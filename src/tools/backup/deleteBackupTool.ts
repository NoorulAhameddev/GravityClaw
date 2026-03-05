import type { Tool } from "../../types/tools.js";
import { deleteBackup, listBackups } from "../../backup/index.ts";
import { createLogger } from "../../logger.ts";

const log = createLogger("tool:delete-backup");

export const deleteBackupTool: Tool = {
    name: "delete_backup",
    description:
        "Delete a specific backup file from the backup directory. This action is permanent and cannot be undone. Returns success status and reason for deletion.",
    inputSchema: {
        type: "object" as const,
        properties: {
            backup_filename: {
                type: "string",
                description: "The filename of the backup to delete",
            },
            reason: {
                type: "string",
                description: "Optional reason for deletion",
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

            log.info(`Deleting backup: ${filename}`);

            // Verify backup exists
            const backups = listBackups();
            const backup = backups.find((b) => b.filename === filename);

            if (!backup) {
                throw new Error(
                    `Backup not found: ${filename}. Available backups: ${backups.map((b) => b.filename).join(", ")}`
                );
            }

            // Delete backup
            deleteBackup(filename);

            return JSON.stringify({
                success: true,
                message: `Backup deleted successfully: ${filename}`,
                filename,
                size: backup.size,
                reason: input.reason || "No reason provided",
            });
        } catch (err) {
            log.error("Failed to delete backup", err);
            return JSON.stringify({
                success: false,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    },
};
