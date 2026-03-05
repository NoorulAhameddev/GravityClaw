import type { Tool } from "../../types/tools.js";
import { listBackups, getBackupStats } from "../../backup/index.ts";
import { createLogger } from "../../logger.ts";

const log = createLogger("tool:list-backups");

export const listBackupsTool: Tool = {
    name: "list_backups",
    description:
        "List all available backups with details including filename, timestamp, size, and encryption status. Also returns overall backup statistics.",
    inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
    },
    async execute() {
        try {
            log.info("Listing backups...");

            const backups = listBackups();
            const stats = getBackupStats();

            // Format backups for display
            const formattedBackups = backups.map((b) => ({
                filename: b.filename,
                timestamp: b.timestamp.toISOString(),
                size: `${(b.size / 1024 / 1024).toFixed(2)} MB`,
                encrypted: b.metadata.encrypted,
                compressed: b.metadata.compressed,
                originalSize: `${(b.metadata.size / 1024 / 1024).toFixed(2)} MB`,
                checksum: b.metadata.checksum,
            }));

            return JSON.stringify({
                success: true,
                backups: formattedBackups,
                stats: {
                    totalBackups: stats.backupCount,
                    totalStorageUsed: `${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`,
                    oldestBackup: stats.oldestBackup?.toISOString() || null,
                    newestBackup: stats.newestBackup?.toISOString() || null,
                },
            });
        } catch (err) {
            log.error("Failed to list backups", err);
            return JSON.stringify({
                success: false,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    },
};
