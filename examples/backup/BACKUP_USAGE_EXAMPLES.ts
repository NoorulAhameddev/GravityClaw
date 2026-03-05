// ============================================================================
// Gravity Claw Backup & Restore System - Usage Examples
// ============================================================================

/**
 * EXAMPLE 1: Using Backup Tools via Agent
 * These examples show how to use the backup system through the agent's tool interface
 */

// Create an on-demand backup
// User: "Create a backup of my database before I make changes"
// Agent uses tool: create_backup
// Input: { description: "Before database schema migration" }

// Result:
// {
//   "success": true,
//   "message": "Backup created successfully: backup-20240305-120000-1702828800000.db.gz.enc",
//   "filename": "backup-20240305-120000-1702828800000.db.gz.enc",
//   "description": "Before database schema migration",
//   "timestamp": "2024-03-05T12:00:00.000Z"
// }

/**
 * EXAMPLE 2: List all available backups
 * User: "Show me all my backups"
 * Agent uses tool: list_backups
 * No input required
 */

// Result:
// {
//   "success": true,
//   "backups": [
//     {
//       "filename": "backup-20240305-120000-1702828800000.db.gz.enc",
//       "timestamp": "2024-03-05T12:00:00.000Z",
//       "size": "45.23 MB",
//       "encrypted": true,
//       "compressed": true,
//       "originalSize": "350.15 MB",
//       "checksum": "abc123def456..."
//     },
//     {
//       "filename": "backup-20240304-020000-1702742400000.db.gz.enc",
//       "timestamp": "2024-03-04T02:00:00.000Z",
//       "size": "47.89 MB",
//       "encrypted": true,
//       "compressed": true,
//       "originalSize": "355.42 MB",
//       "checksum": "xyz789uvw456..."
//     }
//   ],
//   "stats": {
//     "totalBackups": 2,
//     "totalStorageUsed": "93.12 MB",
//     "oldestBackup": "2024-03-04T02:00:00.000Z",
//     "newestBackup": "2024-03-05T12:00:00.000Z"
//   }
// }

/**
 * EXAMPLE 3: Verify backup integrity
 * User: "Make sure my latest backup is valid"
 * Agent uses tool: verify_backup
 * Input: { backup_filename: "backup-20240305-120000-1702828800000.db.gz.enc" }
 */

// Result:
// {
//   "success": true,
//   "filename": "backup-20240305-120000-1702828800000.db.gz.enc",
//   "valid": true,
//   "message": "Backup is valid and intact",
//   "encrypted": true,
//   "compressed": true,
//   "checksum": "abc123def456...",
//   "size": "45.23 MB",
//   "originalSize": "350.15 MB"
// }

/**
 * EXAMPLE 4: Get backup status
 * User: "When was my last backup and is the scheduler running?"
 * Agent uses tool: get_backup_status
 * No input required
 */

// Result:
// {
//   "success": true,
//   "status": {
//     "schedulerRunning": true,
//     "lastBackupTime": "2024-03-05T02:00:15.000Z",
//     "timeSinceLastBackup": "10h 5m 30s ago",
//     "nextScheduledBackup": "2024-03-06T02:00:00.000Z",
//     "totalBackups": 30,
//     "totalStorageUsed": "1.25 GB",
//     "oldestBackup": "2024-02-04T02:00:00.000Z",
//     "newestBackup": "2024-03-05T02:00:15.000Z"
//   }
// }

/**
 * EXAMPLE 5: Restore from backup
 * User: "Restore the database from the backup taken on March 4th at 2 AM"
 * Agent uses tool: restore_backup
 * Input: { backup_filename: "backup-20240304-020000-1702742400000.db.gz.enc" }
 */

// Result:
// {
//   "success": true,
//   "message": "Database restored successfully from backup-20240304-020000-1702742400000.db.gz.enc",
//   "filename": "backup-20240304-020000-1702742400000.db.gz.enc",
//   "timestamp": "2024-03-04T02:00:00.000Z",
//   "size": "47.89 MB",
//   "note": "Database connection must be reestablished after restore"
// }

/**
 * EXAMPLE 6: Delete a backup
 * User: "Delete the backup from March 1st to save space"
 * Agent uses tool: delete_backup
 * Input: {
 *   backup_filename: "backup-20240301-020000-1702142400000.db.gz.enc",
 *   reason: "Keeping only last 30 days of backups"
 * }
 */

// Result:
// {
//   "success": true,
//   "message": "Backup deleted successfully: backup-20240301-020000-1702142400000.db.gz.enc",
//   "filename": "backup-20240301-020000-1702142400000.db.gz.enc",
//   "size": 45230000,
//   "reason": "Keeping only last 30 days of backups"
// }

// ============================================================================
// EXAMPLE 7: Programmatic Usage (TypeScript)
// ============================================================================

import {
    createBackup,
    restoreFromBackup,
    listBackups,
    deleteBackup,
    verifyBackup,
    getBackupStatus,
    getBackupStats,
} from "./src/backup/index.ts";

import { db } from "./src/db.ts";
import path from "path";

// Get database path
const dbPath = path.join(process.cwd(), "gravity.db");

// Create backup
async function backupDatabase() {
    try {
        const filename = await createBackup(db, dbPath);
        console.log(`✅ Backup created: ${filename}`);
    } catch (err) {
        console.error("❌ Backup failed:", err);
    }
}

// List all backups
async function listAllBackups() {
    try {
        const backups = listBackups();
        console.log(`📦 Total backups: ${backups.length}`);

        backups.forEach((backup, idx) => {
            console.log(`  ${idx + 1}. ${backup.filename}`);
            console.log(`     Date: ${backup.timestamp.toISOString()}`);
            console.log(`     Size: ${(backup.size / 1024 / 1024).toFixed(2)} MB`);
        });
    } catch (err) {
        console.error("❌ List failed:", err);
    }
}

// Verify backup integrity
async function checkBackup(filename: string) {
    try {
        const result = verifyBackup(filename);

        if (result.valid) {
            console.log(`✅ Backup is valid: ${filename}`);
        } else {
            console.log(`❌ Backup corrupted: ${result.message}`);
        }
    } catch (err) {
        console.error("❌ Verification failed:", err);
    }
}

// Get statistics
async function showBackupStats() {
    try {
        const stats = getBackupStats();

        console.log("📊 Backup Statistics:");
        console.log(`  Total backups: ${stats.backupCount}`);
        console.log(
            `  Storage used: ${(stats.totalSize / 1024 / 1024 / 1024).toFixed(2)} GB`
        );
        console.log(
            `  Oldest: ${stats.oldestBackup?.toISOString() || "N/A"}`
        );
        console.log(
            `  Newest: ${stats.newestBackup?.toISOString() || "N/A"}`
        );
    } catch (err) {
        console.error("❌ Stats failed:", err);
    }
}

// Restore from backup
async function recoverFromBackup(filename: string) {
    try {
        console.log(`⏳ Restoring from ${filename}...`);
        await restoreFromBackup(db, filename, dbPath);
        console.log(`✅ Database restored successfully`);
        console.log(`⚠️  Note: Reconnect database after restore`);
    } catch (err) {
        console.error("❌ Restore failed:", err);
    }
}

// Delete old backup
async function removeOldBackup(filename: string) {
    try {
        deleteBackup(filename);
        console.log(`🗑️  Backup deleted: ${filename}`);
    } catch (err) {
        console.error("❌ Delete failed:", err);
    }
}

// Run examples
async function main() {
    console.log("=== Gravity Claw Backup Examples ===\n");

    // List current backups
    await listAllBackups();

    // Get statistics
    await showBackupStats();

    // Verify latest backup
    const backups = listBackups();
    if (backups.length > 0) {
        console.log("\n🔍 Verifying latest backup...");
        await checkBackup(backups[0].filename);
    }

    // Create new backup
    console.log("\n💾 Creating new backup...");
    await backupDatabase();

    // Show updated stats
    console.log("\n📊 Updated statistics...");
    await showBackupStats();
}

// Uncomment to run:
// main().catch(console.error);

// ============================================================================
// EXAMPLE 8: Error Handling & Recovery
// ============================================================================

async function handleBackupError() {
    try {
        const filename = await createBackup(db, dbPath);
        console.log(`✅ Backup: ${filename}`);
    } catch (err) {
        if (err instanceof Error) {
            if (err.message.includes("ENOSPC")) {
                console.error("❌ Backup failed: No space left on device");
                console.error("   Action: Clean up old backups with delete_backup");
            } else if (err.message.includes("permission")) {
                console.error("❌ Backup failed: Permission denied");
                console.error(
                    "   Action: Check backup directory permissions"
                );
            } else if (err.message.includes("database is locked")) {
                console.error("❌ Backup failed: Database is locked");
                console.error(
                    "   Action: Stop other processes accessing database"
                );
            } else {
                console.error(`❌ Backup failed: ${err.message}`);
            }
        }
    }
}

// ============================================================================
// EXAMPLE 9: Scheduled Backup Verification
// ============================================================================

// Run verification every hour
async function scheduleVerification() {
    setInterval(async () => {
        const backups = listBackups();
        if (backups.length > 0) {
            const latest = backups[0];
            const result = verifyBackup(latest.filename);

            if (!result.valid) {
                console.error(
                    `⚠️  Latest backup is corrupted: ${result.message}`
                );
                // Alert user or take action
            }
        }
    }, 60 * 60 * 1000); // Every hour
}

// ============================================================================
// EXAMPLE 10: Monitoring & Alerting
// ============================================================================

function logBackupStatus() {
    const status = getBackupStatus();

    console.log("📈 Backup Status Check:");
    console.log(`   Scheduler running: ${status.schedulerRunning}`);
    console.log(`   Last backup: ${status.lastBackupTime}`);
    console.log(`   Next scheduled: ${status.nextScheduledBackup}`);

    // Alert if no recent backup
    if (status.lastBackupTime) {
        const hoursSinceBackup =
            (Date.now() - new Date(status.lastBackupTime).getTime()) /
            (1000 * 60 * 60);

        if (hoursSinceBackup > 25) {
            console.warn(
                `⚠️  No backup in ${hoursSinceBackup.toFixed(1)} hours`
            );
        }
    }

    // Alert if backups are large
    if (status.totalStorageUsed) {
        const match = status.totalStorageUsed.match(/(\d+(?:\.\d+)?)\s*GB/);
        if (match && parseFloat(match[1]) > 5) {
            console.warn(
                `⚠️  Backup storage is ${status.totalStorageUsed} (consider increasing retention)`
            );
        }
    }
}

function getBackupStatus() {
    throw new Error("Function not implemented.");
}
