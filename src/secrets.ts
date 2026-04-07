/**
 * Encrypted Secrets Management with Rotation & Audit Logging
 * 
 * Uses AES-256-GCM encryption to securely store sensitive configuration values.
 * Secrets are stored in secrets.enc.json and decrypted at runtime using MASTER_KEY.
 * Supports secret expiration, rotation, and comprehensive audit logging.
 * 
 * Features:
 * - AES-256-GCM encryption
 * - Secret expiration with optional expiresAt field
 * - Automatic secret rotation scheduler
 * - Audit log for all secret access (read/write/rotate/delete)
 * - Secret validation before use
 * - Automatic cleanup of expired secrets
 * 
 * Usage:
 * 1. Generate master key: node scripts/secret-manager.ts generate-key
 * 2. Add master key to .env: MASTER_KEY=<generated-key>
 * 3. Add a secret: node scripts/secret-manager.ts add-secret --name MY_API_KEY --value "secret123"
 * 4. View audit log: npm run secret:audit
 * 5. Rotate secrets: npm run secret:rotate
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import { createLogger } from "./logger.ts";
import { safeJsonParse } from "./utils/json.ts";
import { db } from "./db.ts";

const logger = createLogger("secrets");

/**
 * Encryption algorithm and parameters
 */
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits for GCM

/**
 * Encrypted data structure with expiration support
 */
export interface EncryptedData {
  /**
   * Initialization vector (hex encoded)
   */
  iv: string;
  
  /**
   * Encrypted ciphertext (hex encoded)
   */
  data: string;
  
  /**
   * Authentication tag for GCM (hex encoded)
   */
  authTag: string;
  
  /**
   * Optional metadata (not encrypted)
   */
  metadata?: {
    name?: string;
    description?: string;
    createdAt?: string;
    expiresAt?: string;     // Optional expiration timestamp
    rotatedAt?: string;     // Timestamp of last rotation
    status?: 'active' | 'deprecated' | 'deleted'; // Secret status
  };
}

/**
 * Secret access log entry
 */
export interface SecretAccessLog {
  timestamp: string;
  secret_name: string;
  action: 'read' | 'write' | 'rotate' | 'delete';
  user?: string;
  status: 'success' | 'failed';
  error?: string;
}

/**
 * Filters for secret access log queries
 */
export type SecretAccessLogFilters = {
  secret_name?: string | undefined;
  action?: string | undefined;
  days?: number | undefined;
  limit?: number | undefined;
};

/**
 * Validate secret access log filters
 * @param filters - The filters to validate
 * @returns true if filters are valid
 */
function validateSecretAccessLogFilters(filters: unknown): filters is SecretAccessLogFilters {
  if (typeof filters !== 'object' || filters === null) return false;
  
  const f = filters as Record<string, unknown>;
  
  if (f.secret_name !== undefined && typeof f.secret_name !== 'string') return false;
  if (f.action !== undefined && typeof f.action !== 'string') return false;
  if (f.days !== undefined && (typeof f.days !== 'number' || !Number.isInteger(f.days) || f.days < 1 || f.days > 365)) return false;
  if (f.limit !== undefined && (typeof f.limit !== 'number' || !Number.isInteger(f.limit) || f.limit < 1 || f.limit > 1000)) return false;
  
  return true;
}

/**
 * Rate limiting for audit log queries
 */
const QUERY_RATE_LIMIT = 10; // Max queries per minute
const queryRateLimit = new Map<string, { count: number; resetTime: number }>();

/**
 * Check if a query is allowed under rate limiting
 * @param key - Rate limit key (e.g., 'global')
 * @returns true if query is allowed
 */
function checkQueryRateLimit(key: string = 'global'): boolean {
  const now = Date.now();
  const record = queryRateLimit.get(key);
  
  if (!record || now > record.resetTime) {
    queryRateLimit.set(key, { count: 1, resetTime: now + 60000 });
    return true;
  }
  
  if (record.count >= QUERY_RATE_LIMIT) {
    return false;
  }
  
  record.count++;
  return true;
}

/**
 * Reset rate limit map (for testing)
 */
export function resetRateLimitForTesting(): void {
  queryRateLimit.clear();
}

/**
 * Generate a random master key
 * @returns {string} 64-character hex string (32 bytes)
 */
export function generateMasterKey(): string {
  return randomBytes(KEY_LENGTH).toString("hex");
}

/**
 * Derive a 256-bit key from a master key string
 * Handles keys of any length by hashing
 */
function deriveKey(masterKey: string): Buffer {
  if (masterKey.length === 64) {
    // Already the correct length (32 bytes hex)
    return Buffer.from(masterKey, "hex");
  }
  
  // Hash to get consistent 256-bit key
  return createHash("sha256").update(masterKey).digest();
}

/**
 * Encrypt a plaintext string using AES-256-GCM
 * @param plaintext - The secret to encrypt
 * @param masterKey - Master encryption key (hex string or any string)
 * @returns Encrypted data structure
 */
export function encryptSecret(plaintext: string, masterKey: string): EncryptedData {
  if (!plaintext) {
    throw new Error("Plaintext cannot be empty");
  }
  
  if (!masterKey) {
    throw new Error("Master key is required");
  }
  
  // Derive key
  const key = deriveKey(masterKey);
  
  // Generate random IV
  const iv = randomBytes(IV_LENGTH);
  
  // Create cipher
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  // Encrypt
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  // Get authentication tag
  const authTag = cipher.getAuthTag();
  
  return {
    iv: iv.toString("hex"),
    data: encrypted,
    authTag: authTag.toString("hex"),
  };
}

/**
 * Decrypt an encrypted data structure using AES-256-GCM
 * @param encryptedData - The encrypted data
 * @param masterKey - Master encryption key (hex string or any string)
 * @returns Decrypted plaintext
 * @throws Error if decryption fails (wrong key or tampered data)
 */
export function decryptSecret(encryptedData: EncryptedData, masterKey: string): string {
  if (!masterKey) {
    throw new Error("Master key is required");
  }
  
  // Derive key
  const key = deriveKey(masterKey);
  
  // Parse hex values
  const iv = Buffer.from(encryptedData.iv, "hex");
  const authTag = Buffer.from(encryptedData.authTag, "hex");
  
  // Create decipher
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  // Decrypt
  try {
    let decrypted = decipher.update(encryptedData.data, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    throw new Error("Decryption failed: invalid key or corrupted data");
  }
}

/**
 * Load encrypted secrets from secrets.enc.json
 * @param filePath - Path to secrets file
 * @returns Map of secret names to encrypted data
 */
export async function loadSecretsFile(filePath: string): Promise<Map<string, EncryptedData>> {
  try {
    const fs = await import("fs/promises");
    const content = await fs.readFile(filePath, "utf-8");
    const result = safeJsonParse<Record<string, EncryptedData>>(content, {}, "secrets file");
    
    if (!result.success) {
      logger.warn(`Failed to parse secrets file: ${result.error}`);
      return new Map();
    }
    
    const secrets = new Map<string, EncryptedData>();
    for (const [key, value] of Object.entries(result.data || {})) {
      secrets.set(key, value);
    }
    
    return secrets;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return new Map();
    }
    logger.error(`Failed to load secrets file: ${err}`);
    return new Map();
  }
}

/**
 * Save encrypted secrets to secrets.enc.json
 * @param filePath - Path to secrets file
 * @param secrets - Map of secret names to encrypted data
 */
export async function saveSecretsFile(
  filePath: string,
  secrets: Map<string, EncryptedData>
): Promise<void> {
  const fs = await import("fs/promises");
  
  const json: Record<string, EncryptedData> = {};
  for (const [key, value] of secrets.entries()) {
    json[key] = value;
  }
  
  await fs.writeFile(filePath, JSON.stringify(json, null, 2), "utf-8");
}

/**
 * Decrypt all secrets from a secrets file
 * @param filePath - Path to secrets file
 * @param masterKey - Master encryption key
 * @returns Map of secret names to decrypted values
 */
export async function decryptAllSecrets(
  filePath: string,
  masterKey: string
): Promise<Map<string, string>> {
  const encrypted = await loadSecretsFile(filePath);
  const decrypted = new Map<string, string>();
  
  for (const [name, data] of encrypted.entries()) {
    try {
      const plaintext = decryptSecret(data, masterKey);
      decrypted.set(name, plaintext);
    } catch (err) {
      throw new Error(`Failed to decrypt secret '${name}': ${(err as Error).message}`);
    }
  }
  
  return decrypted;
}

/**
 * Add or update an encrypted secret in the secrets file
 * @param filePath - Path to secrets file
 * @param name - Secret name
 * @param plaintext - Secret value to encrypt
 * @param masterKey - Master encryption key
 * @param metadata - Optional metadata
 */
export async function addSecret(
  filePath: string,
  name: string,
  plaintext: string,
  masterKey: string,
  metadata?: EncryptedData["metadata"]
): Promise<void> {
  const secrets = await loadSecretsFile(filePath);
  
  const encrypted = encryptSecret(plaintext, masterKey);
  if (metadata) {
    encrypted.metadata = metadata;
  }
  
  secrets.set(name, encrypted);
  await saveSecretsFile(filePath, secrets);
}

/**
 * Remove a secret from the secrets file
 * @param filePath - Path to secrets file
 * @param name - Secret name to remove
 */
export async function removeSecret(filePath: string, name: string): Promise<void> {
  const secrets = await loadSecretsFile(filePath);
  
  if (!secrets.has(name)) {
    throw new Error(`Secret '${name}' not found`);
  }
  
  secrets.delete(name);
  await saveSecretsFile(filePath, secrets);
}

/**
 * List all secret names in the secrets file
 * @param filePath - Path to secrets file
 * @returns Array of secret names with metadata
 */
export async function listSecrets(filePath: string): Promise<Array<{
  name: string;
  metadata?: EncryptedData["metadata"];
}>> {
  const secrets = await loadSecretsFile(filePath);
  
  return Array.from(secrets.entries()).map(([name, data]) => ({
    name,
    metadata: data.metadata,
  }));
}
/**
 * Log secret access event to audit table
 * @param secretName - Name of the secret
 * @param action - Type of action (read, write, rotate, delete)
 * @param user - Optional user identifier
 * @param status - Success or failure
 * @param error - Optional error message
 */
export function logSecretAccess(
  secretName: string,
  action: 'read' | 'write' | 'rotate' | 'delete',
  user?: string,
  status: 'success' | 'failed' = 'success',
  error?: string
): void {
  try {
    db.prepare(`
      INSERT INTO secret_access_log (timestamp, secret_name, action, user, status, error)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      new Date().toISOString(),
      secretName,
      action,
      user || 'system',
      status,
      error || null
    );
  } catch (err) {
    logger.error(`Failed to log secret access: ${err}`);
  }
}

/**
 * Get secret access log entries
 * @param filters - Optional filters (secret_name, action, days, limit)
 * @returns Array of log entries
 */
export function getSecretAccessLog(filters?: SecretAccessLogFilters): SecretAccessLog[] {
  try {
    // Validate filters
    if (filters && !validateSecretAccessLogFilters(filters)) {
      throw new Error('Invalid filter parameters');
    }
    
    // Rate limiting check
    if (!checkQueryRateLimit('global')) {
      throw new Error('Rate limit exceeded for audit log queries');
    }
    
    let query = 'SELECT * FROM secret_access_log WHERE 1=1';
    const params: unknown[] = [];
    
    if (filters?.secret_name) {
      query += ' AND secret_name = ?';
      params.push(filters.secret_name);
    }
    
    if (filters?.action) {
      // Validate action is one of allowed values
      const allowedActions = ['read', 'write', 'rotate', 'delete'];
      if (!allowedActions.includes(filters.action)) {
        throw new Error(`Invalid action: ${filters.action}`);
      }
      query += ' AND action = ?';
      params.push(filters.action);
    }
    
    if (filters?.days) {
      // Validate days is a positive integer within range
      const days = parseInt(String(filters.days), 10);
      if (isNaN(days) || days < 1 || days > 365) {
        throw new Error(`Invalid days value: ${filters.days}`);
      }
      query += ' AND timestamp > datetime(\'now\', ? || \' days\')';
      params.push(-days);
    }
    
    query += ' ORDER BY timestamp DESC';
    
    if (filters?.limit) {
      // Validate limit is a positive integer within range
      const limit = parseInt(String(filters.limit), 10);
      if (isNaN(limit) || limit < 1 || limit > 1000) {
        throw new Error(`Invalid limit value: ${filters.limit}`);
      }
      // Use parameterized query
      query += ' LIMIT ?';
      params.push(limit);
    } else {
      // Default limit to prevent unbounded queries
      query += ' LIMIT ?';
      params.push(100);
    }
    
    return db.prepare(query).all(...params) as SecretAccessLog[];
  } catch (err) {
    logger.error(`Failed to get secret access log: ${err}`);
    return [];
  }
}

/**
 * Check if a secret is expired
 * @param secret - The encrypted secret data
 * @returns true if secret has expired
 */
export function isSecretExpired(secret: EncryptedData): boolean {
  if (!secret.metadata?.expiresAt) {
    return false; // No expiration set
  }
  
  const expiresAt = new Date(secret.metadata.expiresAt).getTime();
  const now = Date.now();
  
  return now > expiresAt;
}

/**
 * Check if a secret is expiring soon
 * @param secret - The encrypted secret data
 * @param daysThreshold - Number of days before expiration to flag
 * @returns true if secret expires within threshold
 */
export function isSecretExpiringSoon(secret: EncryptedData, daysThreshold: number = 30): boolean {
  if (!secret.metadata?.expiresAt) {
    return false; // No expiration set
  }
  
  const expiresAt = new Date(secret.metadata.expiresAt).getTime();
  const now = Date.now();
  const thresholdMs = daysThreshold * 24 * 60 * 60 * 1000;
  
  return expiresAt - now <= thresholdMs && expiresAt > now;
}

/**
 * Validate a secret before use
 * @param secret - The encrypted secret data
 * @returns Object with validation result and any warnings
 */
export function validateSecret(secret: EncryptedData): {
  valid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  
  // Check if expired
  if (isSecretExpired(secret)) {
    errors.push('Secret has expired');
  }
  
  // Check if expiring soon
  if (isSecretExpiringSoon(secret, 30)) {
    warnings.push('Secret will expire within 30 days');
  }
  
  // Check if deprecated
  if (secret.metadata?.status === 'deprecated') {
    warnings.push('Secret is marked as deprecated');
  }
  
  // Check if deleted
  if (secret.metadata?.status === 'deleted') {
    errors.push('Secret is marked as deleted');
  }
  
  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Cleanup expired secrets from a secrets file
 * @param filePath - Path to secrets file
 * @param graceperiodDays - Days to keep expired secrets before deletion
 */
export async function cleanupExpiredSecrets(
  filePath: string,
  gracePeriodDays: number = 90
): Promise<{ cleaned: number; deleted: string[] }> {
  const secrets = await loadSecretsFile(filePath);
  const deleted: string[] = [];
  let cleaned = 0;
  
  const gracePeriodMs = gracePeriodDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  
  for (const [name, secret] of secrets.entries()) {
    if (secret.metadata?.status === 'deleted' && secret.metadata?.expiresAt) {
      const deletedAt = new Date(secret.metadata.expiresAt).getTime();
      
      if (now - deletedAt > gracePeriodMs) {
        secrets.delete(name);
        deleted.push(name);
        cleaned++;
        
        logger.info(`Cleaned up deleted secret: ${name}`);
      }
    }
  }
  
  if (cleaned > 0) {
    await saveSecretsFile(filePath, secrets);
  }
  
  return { cleaned, deleted };
}

/**
 * Mark a secret for deletion (soft delete)
 * @param filePath - Path to secrets file
 * @param name - Secret name
 */
export async function deleteSecret(filePath: string, name: string): Promise<void> {
  const secrets = await loadSecretsFile(filePath);
  
  if (!secrets.has(name)) {
    throw new Error(`Secret '${name}' not found`);
  }
  
  const secret = secrets.get(name)!;
  if (!secret.metadata) {
    secret.metadata = {};
  }
  
  secret.metadata.status = 'deleted';
  secret.metadata.expiresAt = new Date().toISOString(); // Mark deletion time
  
  secrets.set(name, secret);
  await saveSecretsFile(filePath, secrets);
  
  logSecretAccess(name, 'delete', undefined, 'success');
  logger.info(`Secret marked for deletion: ${name}`);
}

/**
 * Get secrets expiring soon
 * @param filePath - Path to secrets file
 * @param daysThreshold - Number of days before expiration
 */
export async function getExpiringSecrets(
  filePath: string,
  daysThreshold: number = 30
): Promise<Array<{ name: string; expiresAt: string }>> {
  const secrets = await loadSecretsFile(filePath);
  const expiring: Array<{ name: string; expiresAt: string }> = [];
  
  for (const [name, secret] of secrets.entries()) {
    if (isSecretExpiringSoon(secret, daysThreshold) && !isSecretExpired(secret)) {
      expiring.push({
        name,
        expiresAt: secret.metadata!.expiresAt!,
      });
    }
  }
  
  return expiring.sort((a, b) => 
    new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()
  );
}