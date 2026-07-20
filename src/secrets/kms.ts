import crypto from "crypto";
import { createLogger } from "../logger.ts";

const log = createLogger("kms");
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

export interface KmsBackend {
    encrypt(keyId: string, plaintext: Buffer): Promise<Buffer>;
    decrypt(keyId: string, ciphertext: Buffer): Promise<Buffer>;
    generateKey(): Promise<{ keyId: string; publicKey?: string }>;
    rotateKey(oldKeyId: string): Promise<string>;
}

export class LocalKmsBackend implements KmsBackend {
    private keys = new Map<string, Buffer>();

    constructor() {
        const masterKey = process.env.ENCRYPTION_KEY || crypto.randomBytes(KEY_LENGTH).toString("hex");
        this.keys.set("master", Buffer.from(masterKey.slice(0, KEY_LENGTH * 2), "hex"));
        log.info("Local KMS initialized");
    }

    async encrypt(keyId: string, plaintext: Buffer): Promise<Buffer> {
        const key = this.keys.get(keyId);
        if (!key) throw new Error(`Key not found: ${keyId}`);

        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const tag = cipher.getAuthTag();

        return Buffer.concat([iv, tag, encrypted]);
    }

    async decrypt(keyId: string, ciphertext: Buffer): Promise<Buffer> {
        const key = this.keys.get(keyId);
        if (!key) throw new Error(`Key not found: ${keyId}`);

        const iv = ciphertext.subarray(0, IV_LENGTH);
        const tag = ciphertext.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
        const encrypted = ciphertext.subarray(IV_LENGTH + TAG_LENGTH);

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    }

    async generateKey(): Promise<{ keyId: string; publicKey?: string }> {
        const keyId = `key_${Date.now()}`;
        this.keys.set(keyId, crypto.randomBytes(KEY_LENGTH));
        log.info(`Generated new key: ${keyId}`);
        return { keyId };
    }

    async rotateKey(oldKeyId: string): Promise<string> {
        const { keyId: newKeyId } = await this.generateKey();
        log.info(`Rotated key: ${oldKeyId} -> ${newKeyId}`);
        return newKeyId;
    }
}

let kmsBackend: KmsBackend;
const tryImport = async (name: string) => { try { return await import(name); } catch { return null; } };
try {
    const kmsModule = await tryImport("@aws-sdk/client-kms");
    if (kmsModule?.KMSClient) {
        const client = new kmsModule.KMSClient({ region: process.env.AWS_REGION || "us-east-1" });
        kmsBackend = {
            async encrypt(keyId: string, plaintext: Buffer): Promise<Buffer> {
                const result = await client.send(new kmsModule.EncryptCommand({ KeyId: keyId, Plaintext: plaintext }));
                return Buffer.from(result.CiphertextBlob!);
            },
            async decrypt(keyId: string, ciphertext: Buffer): Promise<Buffer> {
                const result = await client.send(new kmsModule.DecryptCommand({ CiphertextBlob: ciphertext }));
                return Buffer.from(result.Plaintext!);
            },
            async generateKey(): Promise<{ keyId: string }> {
                return { keyId: "aws-kms-key" };
            },
            async rotateKey(oldKeyId: string): Promise<string> {
                return oldKeyId;
            },
        };
        log.info("AWS KMS backend initialized");
    } else {
        kmsBackend = new LocalKmsBackend();
    }
} catch {
    kmsBackend = new LocalKmsBackend();
}

export { kmsBackend };
