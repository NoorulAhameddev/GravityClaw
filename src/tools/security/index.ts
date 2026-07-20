/**
 * Security Management Tools
 * 
 * Provides dashboard access to security features including:
 * - Security audit logs (secrets and files)
 * - Secret rotation management
 * - Security status & configuration
 * - Path access validation
 */

import type { Tool } from '../index.js';
import { createLogger } from '../../logger.ts';
import {
  getSecretAccessLog,
  getExpiringSecrets,
  cleanupExpiredSecrets,
  logSecretAccess,
} from '../../secrets.ts';
import { validatePathAccess } from '../../security/path-validator.ts';
import { config, getSafeDirectories } from '../../config.ts';
import { db } from '../../db.ts';
import * as path from 'path';

const logger = createLogger('security-tools');

/**
 * Tool: Get Security Audit Log
 */
export const getSecurityAuditLogTool: Tool = {
  name: 'getSecurityAuditLog',
  description: `Retrieve security audit logs for secrets and file access.

Logs include:
- Secret access (read, write, rotate, delete)
- File operations (read, write, delete, list)
- Path validation failures
- Timestamps, users, and status

Filters:
- type: 'all' | 'secret' | 'file'
- days: number of days to retrieve (default: 7)
- limit: max results (default: 100)
- secret_name: filter by secret (secrets only)
- action: filter by action type
- user: filter by user
- status: filter by status (success/failed/denied/error)

Example: getSecurityAuditLog({ type: 'all', days: 30, limit: 100 })`,

  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['all', 'secret', 'file'],
        description: 'Log type to retrieve (default: all)',
      },
      days: {
        type: 'number',
        description: 'Number of days to retrieve (default: 7)',
      },
      limit: {
        type: 'number',
        description: 'Maximum results (default: 100)',
      },
      secret_name: {
        type: 'string',
        description: 'Filter by secret name (secrets only)',
      },
      action: {
        type: 'string',
        description: 'Filter by action type (read, write, delete, rotate, etc)',
      },
      user: {
        type: 'string',
        description: 'Filter by user',
      },
      status: {
        type: 'string',
        enum: ['success', 'failed', 'denied', 'error'],
        description: 'Filter by status',
      },
    },
  },

  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      const type = (args.type as string) || 'all';
      const days = (args.days as number) || 7;
      const limit = (args.limit as number) || 100;
      const secretName = args.secret_name as string | undefined;
      const action = args.action as string | undefined;
      const user = args.user as string | undefined;
      const status = args.status as string | undefined;

      const logs: any[] = [];

      // Get secret access logs
      if (type === 'all' || type === 'secret') {
        const secretLogs = getSecretAccessLog({
          secret_name: secretName,
          action,
          days,
          limit,
        });

        if (secretLogs && Array.isArray(secretLogs)) {
          let filtered = secretLogs;
          if (user) {
            filtered = filtered.filter(log => log.user === user);
          }
          if (status) {
            filtered = filtered.filter(log => log.status === status);
          }
          logs.push(...filtered);
        }
      }

      // Get file access logs
      if (type === 'all' || type === 'file') {
        const query = `
          SELECT timestamp, path, action, user, status, error
          FROM file_access_log
          WHERE 1=1
          ${days ? `AND timestamp > datetime('now', ? || ' days')` : ''}
          ${user ? `AND user = ?` : ''}
          ${action ? `AND action = ?` : ''}
          ${status ? `AND status = ?` : ''}
          ORDER BY timestamp DESC
          LIMIT ?
        `;

        const params: any[] = [];
        if (days) params.push(-days);
        if (user) params.push(user);
        if (action) params.push(action);
        if (status) params.push(status);
        params.push(limit);

        const fileLogs = db.prepare(query).all(...params);
        if (fileLogs && Array.isArray(fileLogs)) {
          logs.push(...fileLogs);
        }
      }

      // Sort combined logs by timestamp descending
      logs.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return timeB - timeA;
      });

      return JSON.stringify({
        success: true,
        type,
        count: logs.length,
        filters: {
          days,
          limit,
          secret_name: secretName,
          action,
          user,
          status,
        },
        logs: logs.slice(0, limit),
      });
    } catch (err) {
      logger.error(`getSecurityAuditLog failed: ${err}`);
      return JSON.stringify({
        success: false,
        error: String(err),
      });
    }
  },
};

/**
 * Tool: Get Security Status
 */
export const getSecurityStatusTool: Tool = {
  name: 'getSecurityStatus',
  description: `Check current security configuration and status.

Returns:
- MASTER_KEY status (set/not set)
- Safe directories configuration
- Audit logging enabled status
- Secret rotation settings
- Number of expiring secrets
- Recent security events

Example: getSecurityStatus()`,

  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      const secretsPath = path.join(process.cwd(), 'secrets.enc.json');
      let expiringSecretsCount = 0;

      try {
        const expiring = await getExpiringSecrets(secretsPath, config.SECRET_ROTATION_DAYS);
        expiringSecretsCount = expiring.length;
      } catch (err) {
        // Secrets file might not exist
      }

      // Get recent security events
      const recentEvents = db.prepare(`
        SELECT COUNT(*) as count, status
        FROM (
          SELECT status FROM secret_access_log WHERE timestamp > datetime('now', '-24 hours')
          UNION ALL
          SELECT status FROM file_access_log WHERE timestamp > datetime('now', '-24 hours')
        )
        GROUP BY status
      `).all();

      return JSON.stringify({
        success: true,
        status: {
          master_key_set: !!process.env.MASTER_KEY,
          security_audit_enabled: config.SECURITY_AUDIT_ENABLED,
          safe_directories: getSafeDirectories(),
          secret_rotation_days: config.SECRET_ROTATION_DAYS,
          expiring_secrets_count: expiringSecretsCount,
          recent_security_events: recentEvents,
        },
      });
    } catch (err) {
      logger.error(`getSecurityStatus failed: ${err}`);
      return JSON.stringify({
        success: false,
        error: String(err),
      });
    }
  },
};

/**
 * Tool: Rotate Secrets
 */
export const rotateSecretsTool: Tool = {
  name: 'rotateSecrets',
  description: `Check and manage secret rotation.

Options:
- maxAgeDays: number of days to flag for rotation (default: 90)
- autoCleanup: automatically cleanup deleted secrets (default: false)

Returns list of secrets that need rotation with expiration dates.

Example: rotateSecrets({ maxAgeDays: 90, autoCleanup: true })`,

  inputSchema: {
    type: 'object',
    properties: {
      maxAgeDays: {
        type: 'number',
        description: 'Max age in days for rotation (default: 90)',
      },
      autoCleanup: {
        type: 'boolean',
        description: 'Auto cleanup deleted secrets (default: false)',
      },
    },
  },

  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      const secretsPath = path.join(process.cwd(), 'secrets.enc.json');
      const maxAgeDays = (args.maxAgeDays as number) || config.SECRET_ROTATION_DAYS;
      const autoCleanup = (args.autoCleanup as boolean) || false;

      // Get expiring secrets
      const expiring = await getExpiringSecrets(secretsPath, maxAgeDays);

      let cleanup: any = null;
      if (autoCleanup) {
        cleanup = await cleanupExpiredSecrets(secretsPath, 90);
      }

      // Log rotation check
      logSecretAccess(
        'ROTATION_CHECK',
        'rotate',
        'system',
        'success',
        `Checked ${expiring.length} expiring secrets`
      );

      return JSON.stringify({
        success: true,
        expiring_secrets: expiring,
        expiring_count: expiring.length,
        max_age_days: maxAgeDays,
        cleanup_result: cleanup,
        recommendation:
          expiring.length > 0
            ? `Rotate ${expiring.length} secret(s) to maintain security`
            : 'All secrets are current',
      });
    } catch (err) {
      logger.error(`rotateSecrets failed: ${err}`);
      return JSON.stringify({
        success: false,
        error: String(err),
      });
    }
  },
};

/**
 * Tool: Validate Path Access
 */
export const validatePathAccessTool: Tool = {
  name: 'validatePathAccess',
  description: `Validate if a path is allowed for file operations.

Checks:
- Path is within safe directories allowlist
- No path traversal (.. components)
- No symlink escapes
- Not a blocked system directory
- Not a sensitive file (.env, credentials, etc)

Returns validation result with reason if denied.

Example: validatePathAccess({ path: "./data/file.txt", action: "read" })`,

  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to validate',
      },
      action: {
        type: 'string',
        enum: ['read', 'write', 'delete'],
        description: 'Operation type (default: read)',
      },
    },
    required: ['path'],
  },

  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      const filePath = args.path as string;
      const action = (args.action as 'read' | 'write' | 'delete') || 'read';

      const result = validatePathAccess(filePath, {
        allowedPaths: getSafeDirectories(),
        action,
        checkSymlinks: true,
        checkTraversal: true,
        logFailures: true,
      });

      return JSON.stringify({
        success: true,
        allowed: result.allowed,
        path: filePath,
        action,
        resolved_path: result.resolvedPath,
        is_symlink: result.isSymlink,
        reason: result.reason,
      });
    } catch (err) {
      logger.error(`validatePathAccess failed: ${err}`);
      return JSON.stringify({
        success: false,
        error: String(err),
      });
    }
  },
};

export const securityTools = [
  getSecurityAuditLogTool,
  getSecurityStatusTool,
  rotateSecretsTool,
  validatePathAccessTool,
];
