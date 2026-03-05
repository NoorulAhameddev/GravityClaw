import type { Tool } from "../../types/tools.js";
import { restoreFromBackup, listBackups } from "../../backup/index.ts";
import { db } from "../../db.ts";
import path from "path";
import { fileURLToPath } from "url";
import { createLogger } from "../../logger.ts";

const log = createLogger("tool:restore-backup");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "../../..", "gravity.db");

export const restoreBackupTool: Tool = {
    name: "restore_backup",
    description:
        "Restore the database from a specific backup. Will verify the backup integrity before restoring, and create a backup of the current database before restoring. The original database is preserved if restoration fails.",
    inputSchema: {
        type: "object" as const,
        properties: {
            backup_filename: {
                type: "string",
                description:
                    "The filename of the backup to restore from (e.g., 'backup-20240305-120000-1234567890.db.gz.enc')",
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

            log.info(`Restoring from backup: ${filename}`);

            // Verify backup exists in list
            const backups = listBackups();
            const backup = backups.find((b) => b.filename === filename);

            if (!backup) {
                throw new Error(
                    `Backup not found: ${filename}. Available backups: ${backups.map((b) => b.filename).join(", ")}`
                );
            }

            // Perform restoration
            await restoreFromBackup(db as any, filename, dbPath);

            return JSON.stringify({
                success: true,
                message: `Database restored successfully from ${filename}`,
                filename,
                timestamp: backup.metadata.timestamp,
                size: backup.size,
                note: "Database connection must be reestablished after restore",
            });
        } catch (err) {
            log.error("Failed to restore from backup", err);
            return JSON.stringify({
                success: false,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    },
};
