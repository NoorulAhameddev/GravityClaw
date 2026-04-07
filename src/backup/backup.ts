import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { createHash, randomBytes, createCipheriv, createDecipheriv, type CipherGCM, type DecipherGCM } from "crypto";
import { gzipSync, gunzipSync } from "zlib";
import { createLogger } from "../logger.ts";
import { safeJsonParse } from "../utils/json.ts";

const log = createLogger("backup");

export interface BackupMetadata {
    timestamp: string;
    version: string;
    size: number;
    checksum: string;
    encrypted: boolean;
    compressed: boolean;
    sourceDbPath: string;
}

export interface BackupInfo {
    filename: string;
    timestamp: Date;
    size: number;
    metadata: BackupMetadata;
}

export class BackupManager {
    private backupDir: string;
    private masterKey: string;
    private encryptionAlgorithm = "aes-256-gcm";

    constructor(backupDir: string, masterKey?: string) {
        this.backupDir = backupDir;
        this.masterKey = masterKey || randomBytes(32).toString("hex");

        // Ensure backup directory exists
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }
    }

    /**
     * Create a backup of the database
     */
    async createBackup(
        db: Database.Database,
        dbPath: string,
        options?: { encrypt?: boolean; compress?: boolean }
    ): Promise<string> {
        const encrypt = options?.encrypt !== false;
        const compress = options?.compress !== false;

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").split("-").slice(0, 4).join("");
        const baseName = `backup-${timestamp}-${Date.now()}`;
        let filename = baseName;
        let backupPath = path.join(this.backupDir, filename);

        try {
            // Step 1: Create unencrypted temporary backup using SQLite's backup API
            const tempBackupPath = path.join(this.backupDir, `${baseName}.tmp`);
            log.info(`Creating database backup: ${tempBackupPath}`);

            try {
                // Use better-sqlite3's backup method
                db.backup(tempBackupPath);
            } catch (err) {
                log.error("SQLite backup failed, attempting file copy fallback", err, undefined);
                // Fallback: copy the database file
                fs.copyFileSync(dbPath, tempBackupPath);
            }

            // Step 2: Read the backup file
            let backupData: Buffer = fs.readFileSync(tempBackupPath);
            const originalChecksum = this.calculateChecksum(backupData);
            const originalSize = backupData.length;

            // Step 3: Compress if enabled
            if (compress) {
                log.info("Compressing backup...");
                backupData = gzipSync(backupData) as Buffer;
                filename = `${baseName}.gz`;
                backupPath = path.join(this.backupDir, filename);
            }

            // Step 4: Encrypt if enabled
            if (encrypt) {
                log.info("Encrypting backup...");
                backupData = this.encryptData(backupData) as Buffer;
                filename = `${filename}.enc`;
                backupPath = path.join(this.backupDir, filename);
            }

            // Step 5: Create metadata
            const metadata: BackupMetadata = {
                timestamp: new Date().toISOString(),
                version: "1.0",
                size: originalSize,
                checksum: originalChecksum,
                encrypted: encrypt,
                compressed: compress,
                sourceDbPath: dbPath,
            };

            // Step 6: Write backup file
            fs.writeFileSync(backupPath, backupData);
            log.info(`Backup created successfully: ${filename}`);

            // Step 7: Update index
            this.updateBackupIndex(filename, metadata);

            // Step 8: Clean up temp file
            if (fs.existsSync(tempBackupPath)) {
                fs.unlinkSync(tempBackupPath);
            }

            return filename;
        } catch (err) {
            log.error("Backup creation failed", err, undefined);
            // Clean up partial backup
            if (fs.existsSync(backupPath)) {
                fs.unlinkSync(backupPath);
            }
            throw err;
        }
    }

    /**
     * Restore from a backup
     */
    async restoreFromBackup(
        db: Database.Database,
        backupFilename: string,
        dbPath: string
    ): Promise<void> {
        const backupPath = path.join(this.backupDir, backupFilename);

        if (!fs.existsSync(backupPath)) {
            throw new Error(`Backup file not found: ${backupFilename}`);
        }

        try {
            log.info(`Restoring from backup: ${backupFilename}`);

            // Step 1: Read backup file
            let backupData: Buffer = fs.readFileSync(backupPath);

            // Step 2: Get metadata to determine processing
            const metadata = this.getBackupMetadata(backupFilename);

            // Step 3: Decrypt if encrypted
            if (metadata.encrypted) {
                log.info("Decrypting backup...");
                backupData = this.decryptData(backupData) as Buffer;
            }

            // Step 4: Decompress if compressed
            if (metadata.compressed) {
                log.info("Decompressing backup...");
                backupData = gunzipSync(backupData) as Buffer;
            }

            // Step 5: Verify checksum
            const restoredChecksum = this.calculateChecksum(backupData);
            if (restoredChecksum !== metadata.checksum) {
                throw new Error(
                    `Checksum mismatch: expected ${metadata.checksum}, got ${restoredChecksum}`
                );
            }
            log.info("Checksum verification passed");

            // Step 6: Close existing database connection
            db.close();

            // Step 7: Backup current database before replacing
            const currentBackupPath = `${dbPath}.backup-before-restore`;
            if (fs.existsSync(dbPath)) {
                fs.copyFileSync(dbPath, currentBackupPath);
                log.info(`Backed up current database to ${currentBackupPath}`);
            }

            // Step 8: Write restored data
            fs.writeFileSync(dbPath, backupData);
            log.info("Database restored successfully");

            // Note: Caller should reopen the database connection
        } catch (err) {
            log.error("Restore failed", err, undefined);
            throw err;
        }
    }

    /**
     * List all available backups
     */
    listBackups(): BackupInfo[] {
        const backups: BackupInfo[] = [];

        if (!fs.existsSync(this.backupDir)) {
            return backups;
        }

        const files = fs.readdirSync(this.backupDir);

        for (const file of files) {
            if (file === "index.json" || file.startsWith(".")) {
                continue;
            }

            const filePath = path.join(this.backupDir, file);
            const stat = fs.statSync(filePath);

            try {
                const metadata = this.getBackupMetadata(file);
                backups.push({
                    filename: file,
                    timestamp: new Date(metadata.timestamp),
                    size: stat.size,
                    metadata,
                });
            } catch (err) {
                log.warn(`Failed to read metadata for ${file}:`, { error: err });
            }
        }

        // Sort by timestamp descending
        return backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }

    /**
     * Delete a backup
     */
    deleteBackup(filename: string): void {
        const backupPath = path.join(this.backupDir, filename);

        if (!fs.existsSync(backupPath)) {
            throw new Error(`Backup file not found: ${filename}`);
        }

        try {
            fs.unlinkSync(backupPath);
            log.info(`Backup deleted: ${filename}`);

            // Update index
            this.removeFromBackupIndex(filename);
        } catch (err) {
            log.error(`Failed to delete backup ${filename}:`, err, undefined);
            throw err;
        }
    }

    /**
     * Cleanup old backups based on retention days
     */
    cleanupOldBackups(retentionDays: number): number {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        const backups = this.listBackups();
        let deletedCount = 0;

        for (const backup of backups) {
            if (backup.timestamp < cutoffDate) {
                try {
                    this.deleteBackup(backup.filename);
                    deletedCount++;
                } catch (err) {
                    log.warn(`Failed to delete old backup ${backup.filename}:`, { error: err });
                }
            }
        }

        if (deletedCount > 0) {
            log.info(`Cleaned up ${deletedCount} old backups (older than ${retentionDays} days)`);
        }

        return deletedCount;
    }

    /**
     * Verify backup integrity
     */
    verifyBackup(filename: string): { valid: boolean; message: string } {
        const backupPath = path.join(this.backupDir, filename);

        if (!fs.existsSync(backupPath)) {
            return { valid: false, message: "Backup file not found" };
        }

        try {
            const backupData = fs.readFileSync(backupPath);
            const metadata = this.getBackupMetadata(filename);

            // Step 1: Decrypt if needed
            let processedData: Buffer = backupData;
            if (metadata.encrypted) {
                try {
                    processedData = this.decryptData(processedData) as Buffer;
                } catch (err) {
                    return { valid: false, message: `Decryption failed: ${err}` };
                }
            }

            // Step 2: Decompress if needed
            if (metadata.compressed) {
                try {
                    processedData = gunzipSync(processedData) as Buffer;
                } catch (err) {
                    return { valid: false, message: `Decompression failed: ${err}` };
                }
            }

            // Step 3: Verify checksum
            const checksum = this.calculateChecksum(processedData);
            if (checksum !== metadata.checksum) {
                return {
                    valid: false,
                    message: `Checksum mismatch: expected ${metadata.checksum}, got ${checksum}`,
                };
            }

            return { valid: true, message: "Backup is valid and intact" };
        } catch (err) {
            return { valid: false, message: `Verification failed: ${err}` };
        }
    }

    /**
     * Get last backup time
     */
    getLastBackupTime(): Date | null {
        const backups = this.listBackups();
        return backups.length > 0 ? (backups[0]!.timestamp) : null;
    }

    /**
     * Get backup size statistics
     */
    getBackupStats(): { totalSize: number; backupCount: number; oldestBackup: Date | null; newestBackup: Date | null } {
        const backups = this.listBackups();
        const totalSize = backups.reduce((sum, b) => sum + b.size, 0);

        return {
            totalSize,
            backupCount: backups.length,
            oldestBackup: backups.length > 0 ? backups[backups.length - 1]!.timestamp : null,
            newestBackup: backups.length > 0 ? backups[0]!.timestamp : null,
        };
    }

    // Private methods

    /** Encrypt data using AES-256-GCM */
    private encryptData(data: Buffer): Buffer {
        const iv = randomBytes(16);
        const key = this.deriveKey();
        const cipher = createCipheriv(this.encryptionAlgorithm, key, iv) as CipherGCM;

        let encrypted = cipher.update(data);
        encrypted = Buffer.concat([encrypted, cipher.final()]);

        const authTag = cipher.getAuthTag();

        // Format: IV (16) + AuthTag (16) + Encrypted Data
        return Buffer.concat([iv, authTag, encrypted]);
    }

    /** Decrypt data using AES-256-GCM */
    private decryptData(encryptedBuffer: Buffer): Buffer {
        const iv = encryptedBuffer.slice(0, 16);
        const authTag = encryptedBuffer.slice(16, 32);
        const encrypted = encryptedBuffer.slice(32);

        const key = this.deriveKey();
        const decipher = createDecipheriv(this.encryptionAlgorithm, key, iv) as DecipherGCM;
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        return decrypted;
    }

    /** Derive a 32-byte key from master key */
    private deriveKey(): Buffer {
        const hash = createHash("sha256");
        hash.update(this.masterKey);
        return hash.digest();
    }

    /** Calculate SHA256 checksum */
    private calculateChecksum(data: Buffer): string {
        return createHash("sha256").update(data).digest("hex");
    }

    /** Update backup index file */
    private updateBackupIndex(filename: string, metadata: BackupMetadata): void {
        const indexPath = path.join(this.backupDir, "index.json");
        let index: Record<string, BackupMetadata> = {};

        if (fs.existsSync(indexPath)) {
            const result = safeJsonParse<Record<string, BackupMetadata>>(fs.readFileSync(indexPath, "utf-8"), {}, "backup index");
            if (result.success && result.data) {
                index = result.data;
            } else {
                log.warn("Failed to read backup index, creating new one");
            }
        }

        index[filename] = metadata;
        fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    }

    /** Remove from backup index */
    private removeFromBackupIndex(filename: string): void {
        const indexPath = path.join(this.backupDir, "index.json");

        if (!fs.existsSync(indexPath)) {
            return;
        }

        try {
            const result = safeJsonParse<Record<string, BackupMetadata>>(fs.readFileSync(indexPath, "utf-8"), {}, "backup index");
            if (!result.success || !result.data) {
                log.warn("Failed to parse backup index for removal");
                return;
            }
            const index = result.data;
            delete index[filename];
            fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
        } catch (err) {
            log.warn("Failed to update backup index");
        }
    }

    /** Get metadata for a backup */
    private getBackupMetadata(filename: string): BackupMetadata {
        const indexPath = path.join(this.backupDir, "index.json");

        if (!fs.existsSync(indexPath)) {
            // Infer metadata from filename
            return this.inferMetadataFromFilename(filename);
        }

        try {
            const result = safeJsonParse<Record<string, BackupMetadata>>(fs.readFileSync(indexPath, "utf-8"), {}, "backup metadata");
            if (result.success && result.data && result.data[filename]) {
                return result.data[filename];
            }
        } catch (err) {
            log.warn("Failed to read backup index");
        }

        return this.inferMetadataFromFilename(filename);
    }

    /** Infer metadata from filename */
    private inferMetadataFromFilename(filename: string): BackupMetadata {
        const hasGz = filename.includes(".gz");
        const hasEnc = filename.includes(".enc");

        return {
            timestamp: new Date().toISOString(),
            version: "1.0",
            size: 0,
            checksum: "",
            encrypted: hasEnc,
            compressed: hasGz,
            sourceDbPath: "",
        };
    }
}
