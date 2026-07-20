import { db } from "../db.ts";
import { kmsBackend } from "./kms.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("key-rotation");

export async function rotateMasterKey(): Promise<void> {
    const oldKeyId = process.env.MASTER_KEY_ID || "master";
    log.info(`Starting key rotation: ${oldKeyId}`);

    const newKeyId = await kmsBackend.rotateKey(oldKeyId);
    log.info(`Key rotated: ${oldKeyId} -> ${newKeyId}`);

    try {
        const secrets = db.prepare("SELECT id, encrypted_value FROM secrets").all() as any[];
        for (const secret of secrets) {
            const decrypted = await kmsBackend.decrypt(oldKeyId, Buffer.from(secret.encrypted_value, "hex"));
            const reEncrypted = await kmsBackend.encrypt(newKeyId, decrypted);
            db.prepare("UPDATE secrets SET encrypted_value = ? WHERE id = ?").run(
                reEncrypted.toString("hex"), secret.id,
            );
        }
        log.info(`Re-encrypted ${secrets.length} secrets with new key`);
    } catch {
        log.warn("No secrets table or no secrets to re-encrypt");
    }

    log.info(`Key rotation complete: ${newKeyId}`);
}
