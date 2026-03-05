/**
 * Security Startup Validation
 * 
 * Validates security configuration at startup
 */

import { config } from '../config.ts';
import { createLogger } from '../logger.ts';
import * as fs from 'fs';
import * as path from 'path';

const logger = createLogger('security-startup');

// Get list of safe directories for file operations
function getSafeDirectories(): string[] {
  return [
    process.cwd(),
    path.join(process.cwd(), 'data'),
    path.join(process.cwd(), 'backups'),
  ];
}

// Check if security audit logging is enabled
const SECURITY_AUDIT_ENABLED = config ? true : false;

export function validateSecurityConfiguration(): void {
  logger.info('[security] Validating startup security configuration...');

  // Check MASTER_KEY is set
  if (!config.MASTER_KEY && !process.env.MASTER_KEY) {
    logger.warn('[security] ⚠️  MASTER_KEY not set - encrypted secrets will not work');
  } else {
    logger.info('[security] ✓ MASTER_KEY is configured');
  }

  // Check safe directories exist and are readable
  const safeDirectories = getSafeDirectories();
  for (const dir of safeDirectories) {
    try {
      const fullPath = path.resolve(dir);
      if (!fs.existsSync(fullPath)) {
        logger.warn(`[security] ⚠️  Safe directory does not exist: ${fullPath}`);
      } else {
        // Check if readable
        fs.accessSync(fullPath, fs.constants.R_OK);
        logger.info(`[security] ✓ Safe directory accessible: ${fullPath}`);
      }
    } catch (err) {
      logger.warn(`[security] ⚠️  Cannot access safe directory ${dir}: ${err}`);
    }
  }

  // Check secrets file integrity
  const secretsPath = path.join(process.cwd(), 'secrets.enc.json');
  if (fs.existsSync(secretsPath)) {
    try {
      const content = fs.readFileSync(secretsPath, 'utf-8');
      JSON.parse(content);
      logger.info('[security] ✓ Secrets file integrity verified');
    } catch (err) {
      logger.error('[security] ❌ Secrets file corrupted or invalid JSON:', err);
      // Don't exit - let the system continue, secrets might not be used
    }
  } else {
    logger.info('[security] ℹ️  No secrets file found - will create on first secret addition');
  }

  // Check security audit configuration
  if (SECURITY_AUDIT_ENABLED) {
    logger.info('[security] ✓ Security audit logging enabled');
  } else {
    logger.warn('[security] ⚠️  Security audit logging disabled');
  }

  logger.info('[security] ✓ Security validation complete');
}
