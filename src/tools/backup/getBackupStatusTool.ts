import type { Tool } from "../../types/tools.js";
import { getLastBackupTime, getNextScheduledBackupTime, getBackupStats, getBackupScheduler } from "../../backup/index.ts";
import { createLogger } from "../../logger.ts";

const log = createLogger("tool:backup-status");

export const getBackupStatusTool: Tool = {
    name: "get_backup_status",
    description:
        "Get the current backup status including last backup time, next scheduled backup, total backups, and storage usage. Useful for monitoring backup health.",
    inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
    },
    async execute() {
        try {
            log.info("Getting backup status...");

            const lastBackup = getLastBackupTime();
            const nextBackup = getNextScheduledBackupTime();
            const stats = getBackupStats();
            const scheduler = getBackupScheduler();

            // Calculate time since last backup
            let timeSinceLastBackup = null;
            if (lastBackup) {
                const ms = Date.now() - lastBackup.getTime();
                const days = Math.floor(ms / (1000 * 60 * 60 * 24));
                const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

                timeSinceLastBackup = `${days}d ${hours}h ${minutes}m ago`;
            }

            return JSON.stringify({
                success: true,
                status: {
                    schedulerRunning: scheduler.isSchedulerRunning(),
                    lastBackupTime: lastBackup?.toISOString() || null,
                    timeSinceLastBackup,
                    nextScheduledBackup: nextBackup?.toISOString() || null,
                    totalBackups: stats.backupCount,
                    totalStorageUsed: `${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`,
                    oldestBackup: stats.oldestBackup?.toISOString() || null,
                    newestBackup: stats.newestBackup?.toISOString() || null,
                },
            });
        } catch (err) {
            log.error("Failed to get backup status", err);
            return JSON.stringify({
                success: false,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    },
};
