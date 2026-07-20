/**
 * File Operations Tools
 * 
 * Provides secure file system access with comprehensive path validation,
 * symlink attack prevention, and file access audit logging.
 * 
 * Security features:
 * - Path allowlist (default: workspace directory only)
 * - Symlink attack prevention (resolve and validate)
 * - Path traversal detection (.. components, absolute paths)
 * - Blocks system directories (/etc, /sys, /proc, C:\Windows, etc.)
 * - Blocks sensitive files (.env, credentials, auth tokens)
 * - File size limits (10MB read, 5MB write)
 * - File access audit logging (timestamp, path, action, user, status)
 * - Delete confirmation (requires explicit confirmation flag)
 */

import type { Tool } from './index.js';
import { createLogger } from '../../logger.js';
import { config, getSafeDirectories } from '../../config.js';
import { validatePathAccess } from '../../security/path-validator.js';
import type { PathValidationConfig } from '../../security/path-validator.js';
import { getAllowedPaths } from '../../config.js';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { db } from '../../db.js';

const logger = createLogger('file-tools');

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const unlink = promisify(fs.unlink);
const stat = promisify(fs.stat);

// File size limits
const MAX_READ_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_WRITE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Log file access to audit table
 */
function logFileAccess(
  filePath: string,
  action: 'read' | 'write' | 'delete' | 'list',
  user: string | undefined,
  status: 'success' | 'denied' | 'error',
  error?: string,
  sizeBytes?: number,
  durationMs?: number
): void {
  if (!config.SECURITY_AUDIT_ENABLED) {
    return;
  }
  
  try {
    db.prepare(`
      INSERT INTO file_access_log (timestamp, path, action, size_bytes, duration_ms, user, status, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      new Date().toISOString(),
      filePath,
      action,
      sizeBytes || null,
      durationMs || null,
      user || 'system',
      status,
      error || null
    );
  } catch (err) {
    logger.warn(`Failed to log file access: ${err}`);
  }
}

/**
 * Check if user has permission to use file tools in group
 */
async function checkFileToolPermission(
  toolName: string,
  input: Record<string, unknown>
): Promise<{ allowed: boolean; error?: string }> {
  const isGroup = Boolean(input["__isGroup"]);
  const platform = String(input["__platform"] || "");
  const groupId = String(input["__groupId"] || "");
  const userId = String(input["__userId"] || "");

  if (!isGroup || !platform || !groupId || !userId) {
    return { allowed: true }; // Not a group chat, allow
  }

  const { isToolAllowedForUser } = await import("../../groups/index.ts");
  const allowed = isToolAllowedForUser(platform, groupId, userId, toolName);

  if (!allowed) {
    return {
      allowed: false,
      error: `The ${toolName} tool requires administrator privileges in this group.`,
    };
  }

  return { allowed: true };
}

/**
 * Tool: Read File
 */
export const readFileTool: Tool = {
  name: 'read_file',
  description: `Read the contents of a file.

Returns the file content as text. Binary files will be base64-encoded.

Security:
- Path must be within allowed directories (workspace by default)
- Cannot read system files or sensitive files (.env, credentials, etc.)
- Max file size: 10MB

Example: read_file({ path: "README.md" })`,

  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file (relative or absolute)',
      },
      encoding: {
        type: 'string',
        enum: ['utf8', 'base64', 'binary'],
        description: 'File encoding (default: utf8, use base64 for binary files)',
      },
    },
    required: ['path'],
  },

  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      // Check group permissions
      const permCheck = await checkFileToolPermission('read_file', args);
      if (!permCheck.allowed) {
        return JSON.stringify({
          success: false,
          error: permCheck.error,
        });
      }

      const filePath = args.path as string;
      const encoding = (args.encoding as 'utf8' | 'base64' | 'binary') || 'utf8';
      const user = String(args.__userId || 'system');
      const startTime = Date.now();

      // Validate path access
      const validation = validatePathAccess(filePath, {
        allowedPaths: getSafeDirectories(),
        action: 'read',
        checkSymlinks: true,
        checkTraversal: true,
        logFailures: true,
      });
      
      if (!validation.allowed) {
        logFileAccess(filePath, 'read', user, 'denied', validation.reason);
        return JSON.stringify({
          success: false,
          error: `Access denied: ${validation.reason}`,
          path: filePath,
        });
      }

      const absolutePath = validation.resolvedPath || path.resolve(filePath);

      // Check file exists and get size
      let fileStats;
      try {
        fileStats = await stat(absolutePath);
      } catch (err) {
        return JSON.stringify({
          success: false,
          error: `File not found: ${filePath}`,
        });
      }

      // Check size limit
      if (fileStats.size > MAX_READ_SIZE) {
        return JSON.stringify({
          success: false,
          error: `File too large: ${fileStats.size} bytes (max: ${MAX_READ_SIZE} bytes)`,
          size: fileStats.size,
          max_size: MAX_READ_SIZE,
        });
      }

      // Read file
      const content = await readFile(absolutePath, encoding as BufferEncoding);
      const duration = Date.now() - startTime;

      logger.info(`Read file: ${absolutePath} (${fileStats.size} bytes)`);
      logFileAccess(absolutePath, 'read', user, 'success', undefined, fileStats.size, duration);

      return JSON.stringify({
        success: true,
        path: absolutePath,
        content: content.toString(),
        size: fileStats.size,
        encoding,
      });

    } catch (error) {
      const err = error as Error;
      const user = String(args.__userId || 'system');
      logger.error('read_file failed:', err);
      logFileAccess(String(args.path || 'unknown'), 'read', user, 'error', err.message);
      return JSON.stringify({
        success: false,
        error: err.message,
      });
    }
  },
};

/**
 * Tool: Write File
 */
export const writeFileTool: Tool = {
  name: 'write_file',
  description: `Write content to a file. Creates the file if it doesn't exist, overwrites if it does.

Security:
- Path must be within allowed directories
- Cannot write to system files or sensitive locations
- Max content size: 5MB
- Creates parent directories if needed

Example: write_file({ path: "output.txt", content: "Hello World" })`,

  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file (relative or absolute)',
      },
      content: {
        type: 'string',
        description: 'Content to write to the file',
      },
      encoding: {
        type: 'string',
        enum: ['utf8', 'base64'],
        description: 'Content encoding (default: utf8)',
      },
    },
    required: ['path', 'content'],
  },

  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      // Check group permissions
      const permCheck = await checkFileToolPermission('write_file', args);
      if (!permCheck.allowed) {
        return JSON.stringify({
          success: false,
          error: permCheck.error,
        });
      }

      const filePath = args.path as string;
      const content = args.content as string;
      const encoding = (args.encoding as 'utf8' | 'base64') || 'utf8';
      const user = String(args.__userId || 'system');
      const startTime = Date.now();

      // Validate path access
      const validation = validatePathAccess(filePath, {
        allowedPaths: getSafeDirectories(),
        action: 'write',
        checkSymlinks: true,
        checkTraversal: true,
        logFailures: true,
      });
      
      if (!validation.allowed) {
        logFileAccess(filePath, 'write', user, 'denied', validation.reason);
        return JSON.stringify({
          success: false,
          error: `Access denied: ${validation.reason}`,
          path: filePath,
        });
      }

      // Check content size
      const contentSize = Buffer.byteLength(content, encoding);
      if (contentSize > MAX_WRITE_SIZE) {
        logFileAccess(filePath, 'write', user, 'denied', `Content too large: ${contentSize} bytes`);
        return JSON.stringify({
          success: false,
          error: `Content too large: ${contentSize} bytes (max: ${MAX_WRITE_SIZE} bytes)`,
          size: contentSize,
          max_size: MAX_WRITE_SIZE,
        });
      }

      const absolutePath = validation.resolvedPath || path.resolve(filePath);

      // Create parent directory if needed
      const dir = path.dirname(absolutePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`Created directory: ${dir}`);
      }

      // Write file
      await writeFile(absolutePath, content, encoding as BufferEncoding);
      const duration = Date.now() - startTime;

      logger.info(`Wrote file: ${absolutePath} (${contentSize} bytes)`);
      logFileAccess(absolutePath, 'write', user, 'success', undefined, contentSize, duration);

      return JSON.stringify({
        success: true,
        path: absolutePath,
        size: contentSize,
        encoding,
      });

    } catch (error) {
      const err = error as Error;
      const user = String(args.__userId || 'system');
      logger.error('write_file failed:', err);
      logFileAccess(String(args.path || 'unknown'), 'write', user, 'error', err.message);
      return JSON.stringify({
        success: false,
        error: err.message,
      });
    }
  },
};

/**
 * Tool: List Files
 */
export const listFilesTool: Tool = {
  name: 'list_files',
  description: `List files and directories in a directory.

Returns an array of file/directory names with metadata.

Security:
- Path must be within allowed directories
- Won't list system directories

Example: list_files({ directory: "src/tools" })`,

  inputSchema: {
    type: 'object',
    properties: {
      directory: {
        type: 'string',
        description: 'Directory path (relative or absolute)',
      },
      recursive: {
        type: 'boolean',
        description: 'List recursively (default: false)',
      },
    },
    required: ['directory'],
  },

  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      // Check group permissions
      const permCheck = await checkFileToolPermission('list_files', args);
      if (!permCheck.allowed) {
        return JSON.stringify({
          success: false,
          error: permCheck.error,
        });
      }

      const directory = args.directory as string;
      const recursive = (args.recursive as boolean) || false;
      const user = String(args.__userId || 'system');
      const startTime = Date.now();

      // Validate path access
      const validation = validatePathAccess(directory, {
        allowedPaths: getSafeDirectories(),
        action: 'read',
        checkSymlinks: true,
        checkTraversal: true,
        logFailures: true,
      });
      
      if (!validation.allowed) {
        logFileAccess(directory, 'list', user, 'denied', validation.reason);
        return JSON.stringify({
          success: false,
          error: `Access denied: ${validation.reason}`,
          directory,
        });
      }

      const absoluteDir = validation.resolvedPath || path.resolve(directory);

      // Check directory exists
      if (!fs.existsSync(absoluteDir)) {
        return JSON.stringify({
          success: false,
          error: `Directory not found: ${directory}`,
        });
      }

      const dirStats = await stat(absoluteDir);
      if (!dirStats.isDirectory()) {
        return JSON.stringify({
          success: false,
          error: `Not a directory: ${directory}`,
        });
      }

      // List files
      async function listRecursive(dir: string, baseDir: string = dir): Promise<any[]> {
        const entries = await readdir(dir, { withFileTypes: true });
        const files: any[] = [];

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(baseDir, fullPath);
          
          const fileStats = await stat(fullPath);
          const fileInfo = {
            name: entry.name,
            path: relativePath,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: fileStats.size,
            modified: fileStats.mtime.toISOString(),
          };

          files.push(fileInfo);

          // Recurse into subdirectories if requested
          if (recursive && entry.isDirectory()) {
            // Check if subdirectory is allowed
            const subValidation = validatePathAccess(fullPath, {
              allowedPaths: getSafeDirectories(),
              action: 'read',
              checkSymlinks: true,
              checkTraversal: true,
              logFailures: false,
            });
            if (subValidation.allowed) {
              const subFiles = await listRecursive(fullPath, baseDir);
              files.push(...subFiles);
            }
          }
        }

        return files;
      }

      const files = await listRecursive(absoluteDir);
      const duration = Date.now() - startTime;

      logger.info(`Listed directory: ${absoluteDir} (${files.length} items, recursive: ${recursive})`);
      logFileAccess(absoluteDir, 'list', user, 'success', undefined, undefined, duration);

      return JSON.stringify({
        success: true,
        directory: absoluteDir,
        count: files.length,
        files,
        recursive,
      });

    } catch (error) {
      const err = error as Error;
      const user = String(args.__userId || 'system');
      logger.error('list_files failed:', err);
      logFileAccess(String(args.directory || 'unknown'), 'list', user, 'error', err.message);
      return JSON.stringify({
        success: false,
        error: err.message,
      });
    }
  },
};

/**
 * Tool: Delete File
 */
export const deleteFileTool: Tool = {
  name: 'delete_file',
  description: `Delete a file (NOT directories).

⚠️ WARNING: This permanently deletes files. Cannot be undone.

Requires explicit confirmation flag to execute.

Security:
- Path must be within allowed directories
- Cannot delete system files or sensitive files
- Only deletes files, not directories
- Requires confirm: true flag

Example: delete_file({ path: "temp.txt", confirm: true })`,

  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to delete',
      },
      confirm: {
        type: 'boolean',
        description: 'REQUIRED: Set to true to confirm deletion',
      },
    },
    required: ['path', 'confirm'],
  },

  requiresApproval: true,

  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      // Check group permissions
      const permCheck = await checkFileToolPermission('delete_file', args);
      if (!permCheck.allowed) {
        return JSON.stringify({
          success: false,
          error: permCheck.error,
        });
      }

      const filePath = args.path as string;
      const confirm = args.confirm as boolean;
      const user = String(args.__userId || 'system');
      const startTime = Date.now();

      // Require explicit confirmation
      if (!confirm) {
        logFileAccess(filePath, 'delete', user, 'denied', 'Deletion not confirmed');
        return JSON.stringify({
          success: false,
          error: 'Deletion requires explicit confirmation. Set confirm: true',
          path: filePath,
        });
      }

      // Validate path access
      const validation = validatePathAccess(filePath, {
        allowedPaths: getSafeDirectories(),
        action: 'delete',
        checkSymlinks: true,
        checkTraversal: true,
        logFailures: true,
      });
      
      if (!validation.allowed) {
        logFileAccess(filePath, 'delete', user, 'denied', validation.reason);
        return JSON.stringify({
          success: false,
          error: `Access denied: ${validation.reason}`,
          path: filePath,
        });
      }

      const absolutePath = validation.resolvedPath || path.resolve(filePath);

      // Check file exists
      if (!fs.existsSync(absolutePath)) {
        return JSON.stringify({
          success: false,
          error: `File not found: ${filePath}`,
        });
      }

      // Check it's a file, not a directory
      const fileStats = await stat(absolutePath);
      if (fileStats.isDirectory()) {
        return JSON.stringify({
          success: false,
          error: 'Cannot delete directories. Only files can be deleted.',
          path: filePath,
        });
      }

      // Delete file
      await unlink(absolutePath);
      const duration = Date.now() - startTime;

      logger.info(`Deleted file: ${absolutePath} (${fileStats.size} bytes)`);
      logFileAccess(absolutePath, 'delete', user, 'success', undefined, fileStats.size, duration);

      return JSON.stringify({
        success: true,
        path: absolutePath,
        deleted_size: fileStats.size,
      });

    } catch (error) {
      const err = error as Error;
      const user = String(args.__userId || 'system');
      logger.error('delete_file failed:', err);
      logFileAccess(String(args.path || 'unknown'), 'delete', user, 'error', err.message);
      return JSON.stringify({
        success: false,
        error: err.message,
      });
    }
  },
};

/**
 * Tool: Search Files
 */
export const searchFilesTool: Tool = {
  name: 'search_files',
  description: `Search for files by name pattern in a directory.

Uses glob-style pattern matching (* for wildcard).

Security:
- Search directory must be within allowed paths
- Won't search system directories

Example: search_files({ directory: "src", pattern: "*.ts" })`,

  inputSchema: {
    type: 'object',
    properties: {
      directory: {
        type: 'string',
        description: 'Directory to search in',
      },
      pattern: {
        type: 'string',
        description: 'File name pattern (supports * wildcard). Example: "*.ts" or "test*.js"',
      },
      content_search: {
        type: 'string',
        description: 'Optional: Search file contents for this text (case-insensitive)',
      },
    },
    required: ['directory', 'pattern'],
  },

  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      const directory = args.directory as string;
      const pattern = args.pattern as string;
      const contentSearch = args.content_search as string | undefined;
      const user = String(args.__userId || 'system');

      // Validate path access
      const validation = validatePathAccess(directory, {
        allowedPaths: getSafeDirectories(),
        action: 'read',
        checkSymlinks: true,
        checkTraversal: true,
        logFailures: true,
      });
      
      if (!validation.allowed) {
        logFileAccess(directory, 'list', user, 'denied', validation.reason);
        return JSON.stringify({
          success: false,
          error: `Access denied: ${validation.reason}`,
          directory,
        });
      }

      const absoluteDir = validation.resolvedPath || path.resolve(directory);

      // Check directory exists
      if (!fs.existsSync(absoluteDir)) {
        return JSON.stringify({
          success: false,
          error: `Directory not found: ${directory}`,
        });
      }

      // Convert glob pattern to regex
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      const regex = new RegExp(`^${regexPattern}$`, 'i');

      const matches: any[] = [];

      // Search recursively
      async function searchRecursive(dir: string): Promise<void> {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          // Check if path is allowed - ensure it's under the search directory
          const isPathAllowed = fullPath.startsWith(absoluteDir) || fullPath === absoluteDir;
          if (!isPathAllowed) continue;

          if (entry.isDirectory()) {
            // Recurse
            await searchRecursive(fullPath);
          } else if (entry.isFile()) {
            // Check if name matches pattern
            if (regex.test(entry.name)) {
              const fileStats = await stat(fullPath);
              const relativePath = path.relative(absoluteDir, fullPath);
              
              // If content search specified, check file contents
              let contentMatch = true;
              if (contentSearch) {
                try {
                  // Only search text files under 1MB
                  if (fileStats.size < 1024 * 1024) {
                    const content = await readFile(fullPath, 'utf8');
                    contentMatch = content.toLowerCase().includes(contentSearch.toLowerCase());
                  } else {
                    contentMatch = false; // Skip large files
                  }
                } catch {
                  contentMatch = false; // Skip binary files
                }
              }

              if (contentMatch) {
                matches.push({
                  name: entry.name,
                  path: relativePath,
                  absolute_path: fullPath,
                  size: fileStats.size,
                  modified: fileStats.mtime.toISOString(),
                });
              }
            }
          }
        }
      }

      await searchRecursive(absoluteDir);

      logger.info(`Searched directory: ${absoluteDir}, pattern: ${pattern}, found: ${matches.length} files`);

      return JSON.stringify({
        success: true,
        directory: absoluteDir,
        pattern,
        content_search: contentSearch,
        count: matches.length,
        matches,
      });

    } catch (error) {
      const err = error as Error;
      logger.error('search_files failed:', err);
      return JSON.stringify({
        success: false,
        error: err.message,
      });
    }
  },
};

/**
 * Export all file operation tools
 */
export const fileOperationTools: Tool[] = [
  readFileTool,
  writeFileTool,
  listFilesTool,
  deleteFileTool,
  searchFilesTool,
];
