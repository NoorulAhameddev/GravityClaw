import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { BackupManager } from "./backup.ts";
import type { BackupInfo } from "./backup.ts";
import { BackupScheduler } from "./scheduler.ts";
import type { BackupScheduleConfig } from "./scheduler.ts";
import { createLogger } from "../logger.ts";
import {
    config,
    BACKUP_DIR,
    BACKUP_CRON,
    BACKUP_RETENTION_DAYS,
    BACKUP_ENABLED,
    BACKUP_ENCRYPT,
    BACKUP_COMPRESS,
    BACKUP_MASTER_KEY,
} from "../config.ts";

const log = createLogger("backup");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default configuration - now using config
export const DEFAULT_BACKUP_CONFIG = {
    backupDir: BACKUP_DIR || path.join(process.cwd(), "backups"),
    cronExpression: BACKUP_CRON || "0 2 * * *",
    retentionDays: BACKUP_RETENTION_DAYS || 30,
    enabled: BACKUP_ENABLED !== false,
    encryptBackups: BACKUP_ENCRYPT !== false,
    compressBackups: BACKUP_COMPRESS !== false,
};

let backupManager: BackupManager | null = null;
let backupScheduler: BackupScheduler | null = null;

/**
 * Initialize the backup system
 */
export async function initializeBackupSystem(
    db: Database.Database,
    dbPath: string,
    configOverrides?: Partial<typeof DEFAULT_BACKUP_CONFIG>
): Promise<void> {
    const finalConfig = { ...DEFAULT_BACKUP_CONFIG, ...configOverrides };

    try {
        log.info("Initializing backup system...");

        // Create backup manager
        const masterKey = config.MASTER_KEY || BACKUP_MASTER_KEY;
        backupManager = new BackupManager(finalConfig.backupDir, masterKey);

        // Create scheduler
        backupScheduler = new BackupScheduler(backupManager);

        // Start scheduler
        const scheduleConfig: BackupScheduleConfig = {
            cronExpression: finalConfig.cronExpression,
            retentionDays: finalConfig.retentionDays,
            enabled: finalConfig.enabled,
        };

        backupScheduler.start(db, dbPath, scheduleConfig);

        log.info("Backup system initialized successfully");
    } catch (err) {
        log.error("Failed to initialize backup system", err);
        throw err;
    }
}

/**
 * Get the backup manager instance
 */
export function getBackupManager(): BackupManager {
    if (!backupManager) {
        throw new Error("Backup system not initialized. Call initializeBackupSystem first.");
    }
    return backupManager;
}

/**
 * Get the backup scheduler instance
 */
export function getBackupScheduler(): BackupScheduler {
    if (!backupScheduler) {
        throw new Error("Backup system not initialized. Call initializeBackupSystem first.");
    }
    return backupScheduler;
}

/**
 * Create an on-demand backup
 */
export async function createBackup(db: Database.Database, dbPath: string): Promise<string> {
    const manager = getBackupManager();
    return manager.createBackup(db, dbPath, {
        encrypt: DEFAULT_BACKUP_CONFIG.encryptBackups,
        compress: DEFAULT_BACKUP_CONFIG.compressBackups,
    });
}

/**
 * Restore from a backup
 */
export async function restoreFromBackup(
    db: Database.Database,
    backupFilename: string,
    dbPath: string
): Promise<void> {
    const manager = getBackupManager();
    return manager.restoreFromBackup(db, backupFilename, dbPath);
}

/**
 * List all available backups
 */
export function listBackups(): BackupInfo[] {
    const manager = getBackupManager();
    return manager.listBackups();
}

/**
 * Delete a backup
 */
export function deleteBackup(filename: string): void {
    const manager = getBackupManager();
    return manager.deleteBackup(filename);
}

/**
 * Get last backup time
 */
export function getLastBackupTime(): Date | null {
    const manager = getBackupManager();
    return manager.getLastBackupTime();
}

/**
 * Get next scheduled backup time
 */
export function getNextScheduledBackupTime(): Date | null {
    const scheduler = getBackupScheduler();

    if (!scheduler.isSchedulerRunning()) {
        return null;
    }

    // Parse cron expression to get next execution time
    // For simplicity, we can estimate based on the cron pattern
    const cronExpr = DEFAULT_BACKUP_CONFIG.cronExpression;

    // This is a simplified version; for accurate calculation, use cron-parser library
    if (cronExpr.includes("2")) {
        // Daily at 2 AM
        const next = new Date();
        next.setHours(2, 0, 0, 0);
        if (next <= new Date()) {
            next.setDate(next.getDate() + 1);
        }
        return next;
    }

    return null;
}

/**
 * Verify a backup
 */
export function verifyBackup(filename: string): { valid: boolean; message: string } {
    const manager = getBackupManager();
    return manager.verifyBackup(filename);
}

/**
 * Get backup statistics
 */
export function getBackupStats(): {
    totalSize: number;
    backupCount: number;
    oldestBackup: Date | null;
    newestBackup: Date | null;
} {
    const manager = getBackupManager();
    return manager.getBackupStats();
}

/**
 * Stop the backup scheduler
 */
export function stopBackupScheduler(): void {
    if (backupScheduler) {
        backupScheduler.stop();
    }
}

export type { BackupInfo, BackupMetadata } from "./backup.ts";
export type { BackupScheduleConfig } from "./scheduler.ts";
