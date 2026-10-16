/**
 * Path Validation & Security Module
 *
 * Provides centralized path validation for file operations with:
 * - Symlink attack prevention (resolve and validate)
 * - Path traversal detection (.. components, absolute paths)
 * - Safe directory allowlisting
 * - Blocked pattern matching (system dirs, sensitive files)
 * - Comprehensive logging and caching
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../logger.ts';
import { config } from '../config.ts';

const UNRESTRICTED_ACCESS = config.UNRESTRICTED_ACCESS;

const logger = createLogger('path-validator');

/** True only when targetPath is the base path or a descendant of it. */
function samePath(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

/** True only when targetPath is the base path or a descendant of it. */
function isPathWithin(basePath: string, targetPath: string): boolean {
  let base = path.resolve(basePath);
  let target = path.resolve(targetPath);
  if (process.platform === 'win32') {
    base = base.toLowerCase();
    target = target.toLowerCase();
  }
  const relativePath = path.relative(base, target);
  return (
    relativePath === '' ||
    (relativePath !== '..' &&
      !relativePath.startsWith('..' + path.sep) &&
      !path.isAbsolute(relativePath))
  );
}

function isMissingPathError(error: unknown): boolean {
  const value = error as NodeJS.ErrnoException;
  return value?.code === 'ENOENT' || value?.code === 'ENOTDIR';
}

/**
 * Resolve a path through every existing filesystem component. If the final
 * target does not exist, resolve its nearest existing ancestor and append the
 * remaining components. Broken symlinks and other resolution errors fail closed.
 */
function resolveCanonicalPath(filePath: string): { resolvedPath: string; isSymlink: boolean } {
  const absolutePath = path.resolve(filePath);
  let cursor = absolutePath;
  const missingComponents: string[] = [];

  while (true) {
    let stats: fs.Stats;
    try {
      stats = fs.lstatSync(cursor);
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      missingComponents.push(path.basename(cursor));
      cursor = parent;
      continue;
    }

    // Existing but broken/cyclic symlinks must fail closed. Do not catch this
    // realpath error and treat the symlink as a not-yet-created target.
    const realCursor = path.resolve(fs.realpathSync(cursor));
    const suffix = missingComponents.slice().reverse();
    const resolvedPath = path.resolve(realCursor, ...suffix);
    return {
      resolvedPath,
      isSymlink: stats.isSymbolicLink() || !samePath(resolvedPath, absolutePath),
    };
  }
}

let unrestrictedAccessCounter = 0;

/**
 * Path validation result
 */
export interface PathValidationResult {
  allowed: boolean;
  reason?: string;
  resolvedPath?: string;
  isSymlink?: boolean;
}

/**
 * Configuration for path validation
 */
export interface PathValidationConfig {
  allowedPaths: string[];
  action?: 'read' | 'write' | 'delete';
  checkSymlinks?: boolean;
  checkTraversal?: boolean;
  logFailures?: boolean;
}

// Blocked absolute path patterns (case-insensitive)
const BLOCKED_ABSOLUTE_PATHS = [
  /^\/etc\//i,
  /^\/sys\//i,
  /^\/proc\//i,
  /^\/dev\//i,
  /^\/root\//i,
  /^\/var\/log\//i,
  /^\/boot\//i,
  /^C:\\Windows\\/i,
  /^C:\\Program Files\\/i,
  /^C:\\Program Files \(x86\)\\/i,
  /^C:\\System32\\/i,
  /^C:\\SysWOW64\\/i,
  /^\/System\//i, // macOS
  /^\/Library\//i, // macOS
  /^\/Library\/Logs\//i,
  /^\/private\//i,
];

// Blocked file patterns (case-insensitive)
const BLOCKED_FILE_PATTERNS = [
  /\.env$/i,
  /\.env\./i,
  /\.bash_history$/i,
  /\.zsh_history$/i,
  /\.aws[\/\\]/i,
  /id_rsa$/i,
  /id_ed25519$/i,
  /id_dsa$/i,
  /credentials/i,
  /password/i,
  /secret/i,
  /private.*key/i,
  /\.pem$/i,
  /\.key$/i,
  /\.crt$/i,
  /auth.*token/i,
  /api.*key/i,
  /creds\.json$/i,
  /\.npmrc$/i,
  /\.yarnrc$/i,
  /\.ssh[\/\\]/i,
  /\.git[\/\\]config$/i,
  /config\.php$/i,
  /web\.config$/i,
  /\.htaccess$/i,
  /pg_hba\.conf$/i,
  /shadow$/i,
  /passwd$/i,
  /gshadow$/i,
  /sudoers/i,
];

// Kept for API compatibility. Successful filesystem decisions are not cached
// because symlinks can be replaced between calls.
const validationCache = new Map<string, { result: PathValidationResult; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Reject traversal components and NUL bytes before canonical filesystem checks.
 */
function hasPathTraversal(filePath: string): boolean {
  if (filePath.includes('\0')) return true;
  return filePath.split(/[\\/]/).some((segment) => segment === '..');
}

/**
 * Check if a path matches blocked patterns
 */
function matchesBlockedPatterns(filePath: string): boolean {
  const absolutePath = path.resolve(filePath);
  const fileName = path.basename(absolutePath);

  // Check blocked absolute paths
  for (const pattern of BLOCKED_ABSOLUTE_PATHS) {
    if (pattern.test(absolutePath)) {
      return true;
    }
  }

  // Check blocked file patterns
  for (const pattern of BLOCKED_FILE_PATTERNS) {
    if (pattern.test(fileName) || pattern.test(absolutePath)) {
      return true;
    }
  }

  return false;
}

/**
 * Main path validation function
 */
export function validatePathAccess(
  filePath: string,
  options: PathValidationConfig,
): PathValidationResult {
  const { checkTraversal = true, logFailures = true } = options;

  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    return { allowed: false, reason: 'Path is empty' };
  }

  if (checkTraversal && hasPathTraversal(filePath)) {
    const result: PathValidationResult = {
      allowed: false,
      reason: 'Path contains traversal components (..)',
    };
    if (logFailures) logger.warn('Path traversal detected: ' + filePath);
    return result;
  }

  if (matchesBlockedPatterns(filePath)) {
    const result: PathValidationResult = {
      allowed: false,
      reason: 'Path matches blocked pattern (system dir or sensitive file)',
    };
    if (logFailures) logger.warn('Path matches blocked pattern: ' + filePath);
    return result;
  }

  // Only an explicit operator setting may bypass filesystem validation.
  if (UNRESTRICTED_ACCESS) {
    const resolvedPath = path.resolve(filePath);
    logger.warn('UNRESTRICTED_ACCESS enabled - allowing path: ' + filePath);
    unrestrictedAccessCounter++;
    if (unrestrictedAccessCounter === 1 || unrestrictedAccessCounter % 100 === 0) {
      logger.error(
        '[SECURITY_TELEMETRY] UNRESTRICTED_ACCESS bypass has been used ' +
          unrestrictedAccessCounter +
          ' time(s). This flag disables all path validation. Ensure it is OFF in production and staging.',
      );
    }
    return { allowed: true, resolvedPath, isSymlink: false };
  }

  let canonicalTarget: { resolvedPath: string; isSymlink: boolean };
  let canonicalAllowedPaths: string[];
  try {
    canonicalTarget = resolveCanonicalPath(filePath);
    canonicalAllowedPaths = options.allowedPaths.map(
      (allowed) => resolveCanonicalPath(allowed).resolvedPath,
    );
  } catch (error) {
    const result: PathValidationResult = {
      allowed: false,
      reason: 'Path could not be resolved safely',
    };
    if (logFailures) {
      logger.warn(
        'Path resolution failed (rejecting): ' +
          filePath +
          ': ' +
          (error instanceof Error ? error.message : String(error)),
      );
    }
    return result;
  }

  if (matchesBlockedPatterns(canonicalTarget.resolvedPath)) {
    const result: PathValidationResult = {
      allowed: false,
      reason: 'Canonical path matches blocked pattern (system dir or sensitive file)',
    };
    if (logFailures) logger.warn('Canonical path matches blocked pattern: ' + canonicalTarget.resolvedPath);
    return result;
  }

  const inAllowlist = canonicalAllowedPaths.some((allowed) =>
    isPathWithin(allowed, canonicalTarget.resolvedPath),
  );
  if (!inAllowlist) {
    const result: PathValidationResult = {
      allowed: false,
      reason: 'Path not in canonical allowlist: ' + options.allowedPaths.join(', '),
    };
    if (logFailures) {
      logger.warn('Canonical path not in allowlist: ' + filePath + ' -> ' + canonicalTarget.resolvedPath);
    }
    return result;
  }

  return {
    allowed: true,
    resolvedPath: canonicalTarget.resolvedPath,
    isSymlink: canonicalTarget.isSymlink,
  };
}

/**
 * Validate a parent directory before creating/writing files
 */
export function validateDirectoryAccess(
  dirPath: string,
  config: PathValidationConfig,
): PathValidationResult {
  return validatePathAccess(dirPath, config);
}

/**
 * Get normalized safe directories list
 */
export function getNormalizedPaths(paths: string[]): string[] {
  return paths.map((p) => path.resolve(p));
}

/**
 * Check if targetPath stays within basePath (i.e. does not escape via ..).
 * Returns true when the path is SAFE (contained within basePath).
 * Returns false when an escape is detected.
 *
 * @deprecated Use validatePathAccess for full validation including allowlists.
 */
export function isPathSafe(basePath: string, targetPath: string): boolean {
  try {
    const resolvedBase = resolveCanonicalPath(path.resolve(basePath)).resolvedPath;
    const lexicalTarget = path.resolve(resolvedBase, targetPath);
    const resolvedTarget = resolveCanonicalPath(lexicalTarget).resolvedPath;
    return isPathWithin(resolvedBase, resolvedTarget);
  } catch {
    return false;
  }
}

/**
 * Export validation cache stats for monitoring
 */
export function getValidationCacheStats(): { size: number; ttl_ms: number } {
  return {
    size: validationCache.size,
    ttl_ms: CACHE_TTL_MS,
  };
}

/**
 * Clear validation cache (useful for testing)
 */
export function clearValidationCache(): void {
  validationCache.clear();
}
