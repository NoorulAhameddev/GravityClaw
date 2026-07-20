import * as cron from "node-cron";
import path from "path";
import { BackupManager } from "./backup.ts";
import { createLogger } from "../logger.ts";
import Database from "better-sqlite3";
import { verifyBackup } from "./verify.ts";
import type { VerificationResult } from "./verify.ts";

const log = createLogger("backup:scheduler");

export interface BackupScheduleConfig {
    cronExpression: string;
    retentionDays: number;
    enabled: boolean;
}

export class BackupScheduler {
    private backupManager: BackupManager;
    private scheduledTask: ReturnType<typeof cron.schedule> | null = null;
    private isRunning = false;

    constructor(backupManager: BackupManager) {
        this.backupManager = backupManager;
    }

    /**
     * Start the backup scheduler
     */
    start(
        db: Database.Database,
        dbPath: string,
        config: BackupScheduleConfig
    ): void {
        if (!config.enabled) {
            log.info("Backup scheduler is disabled");
            return;
        }

        if (this.scheduledTask) {
            log.warn("Backup scheduler is already running");
            return;
        }

        try {
            log.info(`Starting backup scheduler (cron: ${config.cronExpression})`);

            this.scheduledTask = cron.schedule(config.cronExpression, async () => {
                await this.performBackup(db, dbPath, config.retentionDays);
            });

            this.isRunning = true;
            log.info("Backup scheduler started successfully");
        } catch (err) {
            log.error("Failed to start backup scheduler", err);
            throw err;
        }
    }

    /**
     * Stop the backup scheduler
     */
    stop(): void {
        if (!this.scheduledTask) {
            log.warn("Backup scheduler is not running");
            return;
        }

        this.scheduledTask.stop();
        this.scheduledTask.destroy();
        this.scheduledTask = null;
        this.isRunning = false;
        log.info("Backup scheduler stopped");
    }

    /**
     * Manually trigger a backup
     */
    async triggerBackup(
        db: Database.Database,
        dbPath: string,
        retentionDays: number
    ): Promise<string> {
        return this.performBackup(db, dbPath, retentionDays);
    }

    /**
     * Check if scheduler is running
     */
    isSchedulerRunning(): boolean {
        return this.isRunning;
    }

    // Private methods

    /** Perform the actual backup operation */
    private async performBackup(
        db: Database.Database,
        dbPath: string,
        retentionDays: number
    ): Promise<string> {
        try {
            log.info("Starting backup operation...");

            // Create backup
            const filename = await this.backupManager.createBackup(db, dbPath, {
                encrypt: true,
                compress: true,
            });

            log.info(`Backup completed: ${filename}`);

            // Verify backup integrity
            const backupPath = path.join(this.backupManager.getBackupDir(), filename);
            const verification: VerificationResult = verifyBackup(backupPath);
            if (verification.valid) {
                log.info(`Backup verification PASSED for ${filename}: ${verification.size} bytes`);
            } else {
                log.error(`Backup verification FAILED for ${filename}: ${verification.errors.join("; ")}`);
            }

            // Cleanup old backups
            const deletedCount = this.backupManager.cleanupOldBackups(retentionDays);
            if (deletedCount > 0) {
                log.info(`Cleaned up ${deletedCount} old backups`);
            }

            return filename;
        } catch (err) {
            log.error("Backup operation failed", err);
            throw err;
        }
    }
}
