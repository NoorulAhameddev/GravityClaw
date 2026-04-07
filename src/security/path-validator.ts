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

const logger = createLogger('path-validator');

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
  /^\/System\//i,  // macOS
  /^\/Library\//i, // macOS
  /^\/Library\/Logs\//i,
  /^\/private\//i,
];

// Blocked file patterns (case-insensitive)
const BLOCKED_FILE_PATTERNS = [
  /\.env$/i,
  /\.env\./i,
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

// Validation cache (results cached for 5 minutes)
const validationCache = new Map<string, { result: PathValidationResult; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Clear old cache entries
 */
function removeOldCacheEntries(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];
  
  for (const [key, entry] of validationCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      keysToDelete.push(key);
    }
  }
  
  keysToDelete.forEach(key => validationCache.delete(key));
}

/**
 * Check if path contains traversal components (e.g., ..)
 */
function hasPathTraversal(filePath: string): boolean {
  // Check for .. components
  if (filePath.includes('..')) {
    return true;
  }
  
  // Normalize and check if still valid
  const normalized = path.normalize(filePath);
  const resolved = path.resolve(filePath);
  
  // Check for null bytes (another traversal technique)
  if (filePath.includes('\0')) {
    return true;
  }
  
  return false;
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
 * Resolve symlinks and verify the real path is allowed
 */
function isSymlinkAllowed(filePath: string, allowedPaths: string[]): boolean {
  try {
    // Check if file exists and is a symlink
    const stats = fs.lstatSync(filePath);
    if (!stats.isSymbolicLink()) {
      return true; // Not a symlink, allowed to proceed
    }
    
    // Resolve the actual path (follow symlinks)
    const realPath = fs.realpathSync(filePath);
    
    // Check if resolved path is within allowlist
    for (const allowedPath of allowedPaths) {
      const normalizedAllowed = path.resolve(allowedPath);
      if (realPath.startsWith(normalizedAllowed)) {
        return true;
      }
    }
    
    // Symlink resolves outside allowlist
    logger.warn(`Symlink escapes allowlist: ${filePath} -> ${realPath}`);
    return false;
  } catch (err) {
    // CRITICAL: Fail closed - reject on any error to prevent symlink attacks
    logger.warn(`Symlink validation failed (rejecting): ${filePath}. Error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * Check if path is within any allowed directory
 */
function isPathInAllowlist(filePath: string, allowedPaths: string[]): boolean {
  const absolutePath = path.resolve(filePath);
  
  for (const allowedPath of allowedPaths) {
    const normalizedAllowed = path.resolve(allowedPath);
    
    // Check if absolutePath is within normalizedAllowed
    // Use path.relative and check if it goes "up" with ..
    const relative = path.relative(normalizedAllowed, absolutePath);
    
    if (!relative.startsWith('..') && relative !== '..') {
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
  config: PathValidationConfig
): PathValidationResult {
  // Check cache first
  const cacheKey = `${filePath}:${config.allowedPaths.join(',')}:${config.action}`;
  const cached = validationCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }
  
  // Clean old cache entries periodically
  if (validationCache.size > 1000) {
    removeOldCacheEntries();
  }
  
  // Default config values
  const {
    checkSymlinks = true,
    checkTraversal = true,
    logFailures = true,
  } = config;

  // Validate empty path
  if (!filePath || filePath.trim().length === 0) {
    const result: PathValidationResult = {
      allowed: false,
      reason: 'Path is empty',
    };
    if (logFailures) logger.warn(`Path validation failed: ${result.reason}`);
    return result;
  }

  // Check for path traversal
  if (checkTraversal && hasPathTraversal(filePath)) {
    const result: PathValidationResult = {
      allowed: false,
      reason: 'Path contains traversal components (..)',
    };
    if (logFailures) logger.warn(`Path traversal detected: ${filePath}`);
    return result;
  }

  // Check blocked patterns
  if (matchesBlockedPatterns(filePath)) {
    const result: PathValidationResult = {
      allowed: false,
      reason: 'Path matches blocked pattern (system dir or sensitive file)',
    };
    if (logFailures) logger.warn(`Path matches blocked pattern: ${filePath}`);
    return result;
  }

  // Check if in allowlist
  if (!isPathInAllowlist(filePath, config.allowedPaths)) {
    const result: PathValidationResult = {
      allowed: false,
      reason: `Path not in allowlist: ${config.allowedPaths.join(', ')}`,
    };
    if (logFailures) {
      logger.warn(`Path not in allowlist: ${filePath}`);
      logger.debug(`Allowed paths: ${config.allowedPaths.join(', ')}`);
    }
    return result;
  }

  // Check symlinks
  if (checkSymlinks && !isSymlinkAllowed(filePath, config.allowedPaths)) {
    const result: PathValidationResult = {
      allowed: false,
      reason: 'Symlink resolves outside of allowlist',
    };
    if (logFailures) logger.warn(`Symlink escapes allowlist: ${filePath}`);
    return result;
  }

  // All checks passed
  const resolvedPath = path.resolve(filePath);
  const result: PathValidationResult = {
    allowed: true,
    resolvedPath,
    isSymlink: false,
  };
  
  // Check if it's actually a symlink
  try {
    const stats = fs.lstatSync(filePath);
    result.isSymlink = stats.isSymbolicLink();
  } catch (err) {
    // File might not exist yet (for write operations)
    // That's okay, we've validated the path itself
  }

  // Cache successful result
  validationCache.set(cacheKey, {
    result,
    timestamp: Date.now(),
  });

  return result;
}

/**
 * Validate a parent directory before creating/writing files
 */
export function validateDirectoryAccess(
  dirPath: string,
  config: PathValidationConfig
): PathValidationResult {
  return validatePathAccess(dirPath, config);
}

/**
 * Get normalized safe directories list
 */
export function getNormalizedPaths(paths: string[]): string[] {
  return paths.map(p => path.resolve(p));
}

/**
 * Check if any path escapes the allowlist via ..
 */
export function checkPathEscape(basePath: string, targetPath: string): boolean {
  const resolved = path.resolve(basePath, targetPath);
  const normalized = path.normalize(resolved);
  
  // If resolving a path with .. ends up outside the base, it's an escape
  return normalized.startsWith(basePath);
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
