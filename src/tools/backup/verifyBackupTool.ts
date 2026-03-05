import type { Tool } from "../../types/tools.js";
import { verifyBackup, listBackups } from "../../backup/index.ts";
import { createLogger } from "../../logger.ts";

const log = createLogger("tool:verify-backup");

export const verifyBackupTool: Tool = {
    name: "verify_backup",
    description:
        "Verify the integrity of a specific backup. Checks decryption, decompression, and checksum verification. Returns detailed verification results.",
    inputSchema: {
        type: "object" as const,
        properties: {
            backup_filename: {
                type: "string",
                description: "The filename of the backup to verify",
            },
        },
        required: ["backup_filename"],
    },
    async execute(input) {
        try {
            const filename = input.backup_filename as string;

            if (!filename || typeof filename !== "string") {
                throw new Error("backup_filename is required and must be a string");
            }

            log.info(`Verifying backup: ${filename}`);

            // Verify backup exists
            const backups = listBackups();
            const backup = backups.find((b) => b.filename === filename);

            if (!backup) {
                throw new Error(
                    `Backup not found: ${filename}. Available backups: ${backups.map((b) => b.filename).join(", ")}`
                );
            }

            // Verify integrity
            const result = verifyBackup(filename);

            return JSON.stringify({
                success: result.valid,
                filename,
                valid: result.valid,
                message: result.message,
                encrypted: backup.metadata.encrypted,
                compressed: backup.metadata.compressed,
                checksum: backup.metadata.checksum,
                size: `${(backup.size / 1024 / 1024).toFixed(2)} MB`,
                originalSize: `${(backup.metadata.size / 1024 / 1024).toFixed(2)} MB`,
            });
        } catch (err) {
            log.error("Failed to verify backup", err);
            return JSON.stringify({
                success: false,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    },
};
