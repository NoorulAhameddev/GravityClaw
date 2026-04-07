/**
 * Runtime Secrets Access Utility
 * 
 * Provides tools with access to secrets from secrets.enc.json with automatic
 * fallback to environment variables. Supports caching for performance.
 * 
 * Features:
 * - Decrypt secrets on demand from secrets.enc.json
 * - Memory caching to avoid repeated decryption
 * - Automatic fallback to env vars if secret not in store
 * - Audit logging of secret access
 * 
 * Usage:
 * import { getSecret, hasSecret, getAllSecrets } from './secrets-runtime.ts'
 * 
 * // Get secret (tries encrypted store first, falls back to env var)
 * const apiKey = await getSecret('MY_API_KEY')
 * 
 * // Check if secret exists
 * if (await hasSecret('MY_API_KEY')) { ... }
 */

import * as path from "path";
import * as fs from "fs";
import { createLogger } from "./logger.ts";
import { decryptSecret, loadSecretsFile, logSecretAccess, type EncryptedData } from "./secrets.ts";
import { config } from "./config.ts";

const logger = createLogger("secrets-runtime");

const SECRETS_FILE = "secrets.enc.json";

interface SecretsCache {
    secrets: Map<string, string>;
    loaded: boolean;
    masterKey: string | undefined;
}

const cache: SecretsCache = {
    secrets: new Map(),
    loaded: false,
    masterKey: undefined,
};

function getSecretsFilePath(): string {
    return path.join(process.cwd(), SECRETS_FILE);
}

function getMasterKey(): string | undefined {
    return config.MASTER_KEY;
}

async function loadSecretsIntoCache(): Promise<void> {
    if (cache.loaded) {
        return;
    }

    const masterKey = getMasterKey();
    if (!masterKey) {
        logger.debug("No MASTER_KEY configured, secrets store unavailable");
        cache.loaded = true;
        return;
    }

    const secretsPath = getSecretsFilePath();
    if (!fs.existsSync(secretsPath)) {
        logger.debug("No secrets file found");
        cache.loaded = true;
        return;
    }

    try {
        const encryptedSecrets = await loadSecretsFile(secretsPath);
        
        for (const [name, encryptedData] of encryptedSecrets.entries()) {
            try {
                const decrypted = decryptSecret(encryptedData, masterKey);
                cache.secrets.set(name, decrypted);
            } catch (err) {
                logger.warn(`Failed to decrypt secret '${name}': ${err}`);
            }
        }

        cache.masterKey = masterKey;
        cache.loaded = true;
        logger.info(`Loaded ${cache.secrets.size} secrets from encrypted store`);
    } catch (err) {
        logger.error("Failed to load secrets into cache:", err);
        cache.loaded = true;
    }
}

export interface GetSecretOptions {
    /**
     * Name of the secret to retrieve
     */
    name: string;
    
    /**
     * Optional default value if secret not found
     */
    defaultValue?: string;
    
    /**
     * If true, logs the access to audit log
     */
    logAccess?: boolean;
    
    /**
     * User identifier for audit logging
     */
    userId?: string;
}

/**
 * Get a secret value from the encrypted store or environment variable.
 * 
 * Resolution order:
 * 1. Check encrypted secrets.enc.json (if MASTER_KEY configured)
 * 2. Check environment variable with same name
 * 3. Return defaultValue if provided
 * 4. Return undefined
 * 
 * @param options - Secret retrieval options
 * @returns The secret value or undefined
 */
export async function getSecret(options: string | GetSecretOptions): Promise<string | undefined> {
    const opts = typeof options === "string" 
        ? { name: options } 
        : options;
    
    const { name, defaultValue, logAccess = false, userId } = opts;
    
    await loadSecretsIntoCache();
    
    let value: string | undefined;
    let source: "encrypted" | "env" | "default" | "not_found" = "not_found";
    
    if (cache.secrets.has(name)) {
        value = cache.secrets.get(name);
        source = "encrypted";
    } else if (process.env[name]) {
        value = process.env[name];
        source = "env";
    } else if (defaultValue !== undefined) {
        value = defaultValue;
        source = "default";
    }
    
    if (logAccess) {
        logSecretAccess(
            name,
            "read",
            userId,
            value !== undefined ? "success" : "failed",
            value === undefined ? "Secret not found" : undefined
        );
    }
    
    if (value === undefined) {
        logger.debug(`Secret '${name}' not found (source: ${source})`);
    } else {
        logger.debug(`Secret '${name}' retrieved (source: ${source})`);
    }
    
    return value;
}

/**
 * Check if a secret exists in the encrypted store or environment.
 * 
 * @param name - Secret name to check
 * @returns true if secret exists
 */
export async function hasSecret(name: string): Promise<boolean> {
    await loadSecretsIntoCache();
    
    return cache.secrets.has(name) || process.env[name] !== undefined;
}

/**
 * Get all loaded secret names (from encrypted store only).
 * Does not include env vars.
 * 
 * @returns Array of secret names
 */
export async function getLoadedSecretNames(): Promise<string[]> {
    await loadSecretsIntoCache();
    
    return Array.from(cache.secrets.keys());
}

/**
 * Get all secrets as key-value pairs.
 * Note: Returns decrypted values - use with caution.
 * 
 * @returns Map of secret names to decrypted values
 */
export async function getAllSecrets(): Promise<Map<string, string>> {
    await loadSecretsIntoCache();
    
    return new Map(cache.secrets);
}

/**
 * Reload secrets from the encrypted store.
 * Clears cache and re-reads secrets.enc.json.
 */
export async function reloadSecrets(): Promise<void> {
    cache.secrets.clear();
    cache.loaded = false;
    cache.masterKey = undefined;
    
    await loadSecretsIntoCache();
}

/**
 * Check if the secrets store is available (MASTER_KEY configured).
 * 
 * @returns true if secrets store is available
 */
export function isSecretsStoreAvailable(): boolean {
    return !!getMasterKey();
}

/**
 * Get metadata about a secret without exposing the value.
 * 
 * @param name - Secret name
 * @returns Secret metadata or undefined if not found
 */
export async function getSecretMetadata(name: string): Promise<{
    exists: boolean;
    source: "encrypted" | "env" | "not_found";
    hasExpiry: boolean;
    expiresAt?: string;
    status?: string;
} | undefined> {
    const secretsPath = getSecretsFilePath();
    
    if (fs.existsSync(secretsPath)) {
        try {
            const content = fs.readFileSync(secretsPath, "utf-8");
            const secrets = JSON.parse(content) as Record<string, EncryptedData>;
            
            if (secrets[name]) {
                const result: {
                    exists: boolean;
                    source: "encrypted";
                    hasExpiry: boolean;
                    expiresAt?: string;
                    status?: string;
                } = {
                    exists: true,
                    source: "encrypted",
                    hasExpiry: !!secrets[name].metadata?.expiresAt,
                };
                if (secrets[name].metadata?.expiresAt) {
                    result.expiresAt = secrets[name].metadata?.expiresAt;
                }
                if (secrets[name].metadata?.status) {
                    result.status = secrets[name].metadata?.status;
                }
                return result;
            }
        } catch (err) {
            logger.warn(`Failed to read secret metadata: ${err}`);
        }
    }
    
    if (process.env[name]) {
        return {
            exists: true,
            source: "env",
            hasExpiry: false,
        };
    }
    
    return {
        exists: false,
        source: "not_found",
        hasExpiry: false,
    };
}
