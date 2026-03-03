/**
 * Encrypted Secrets Management
 * 
 * Uses AES-256-GCM encryption to securely store sensitive configuration values.
 * Secrets are stored in secrets.enc.json and decrypted at runtime using MASTER_KEY.
 * 
 * Usage:
 * 1. Generate master key: node scripts/encrypt-secret.ts --generate-key
 * 2. Add master key to .env: MASTER_KEY=<generated-key>
 * 3. Encrypt a secret: node scripts/encrypt-secret.ts --encrypt "my-api-key"
 * 4. Store encrypted value in secrets.enc.json
 * 5. Decrypt at runtime: decryptSecret(encryptedValue, masterKey)
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

/**
 * Encryption algorithm and parameters
 */
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Encrypted data structure
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
  };
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
    const json = JSON.parse(content) as Record<string, EncryptedData>;
    
    const secrets = new Map<string, EncryptedData>();
    for (const [key, value] of Object.entries(json)) {
      secrets.set(key, value);
    }
    
    return secrets;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      // File doesn't exist yet
      return new Map();
    }
    throw err;
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
