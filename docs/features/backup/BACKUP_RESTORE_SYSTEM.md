# Gravity Claw Backup & Restore System

A production-grade automated backup and restore system for Gravity Claw with AES-256-GCM encryption, gzip compression, integrity verification, and intelligent retention policies.

## Features

### Core Capabilities
- **Automated Backups**: Daily scheduled backups using cron expressions
- **Encryption**: AES-256-GCM encryption for sensitive database backups
- **Compression**: Gzip compression to reduce storage footprint
- **Integrity Verification**: SHA256 checksums and restore validation
- **Retention Management**: Automatic cleanup of old backups (default: 30 days)
- **On-Demand Backups**: Create backups manually at any time
- **Backup History**: Track all backups with timestamps and metadata

### Storage
- **Location**: `./backups/` directory (in .gitignore)
- **File Format**: `backup-YYYYMMDD-HHMMSS-timestamp.db.gz.enc`
- **Index File**: `backups/index.json` for metadata tracking
- **No External Dependencies**: Uses only Node.js built-in crypto and zlib

## Configuration

All backup settings are configurable via environment variables:

```bash
# Enable/disable automatic backup scheduler
BACKUP_ENABLED=true

# Cron expression for backup schedule (default: daily at 2 AM)
BACKUP_CRON="0 2 * * *"

# Number of days to retain backups (default: 30 days)
BACKUP_RETENTION_DAYS=30

# Enable AES-256-GCM encryption (default: true)
BACKUP_ENCRYPT=true

# Enable gzip compression (default: true)
BACKUP_COMPRESS=true

# Custom backup directory (default: ./backups)
BACKUP_DIR=/path/to/backups

# Master encryption key (uses MASTER_KEY if not set)
BACKUP_MASTER_KEY=your-secret-key-here
```

### Cron Expression Examples
```
"0 2 * * *"      # Daily at 2 AM
"0 2 * * 0"      # Every Sunday at 2 AM
"0 */6 * * *"    # Every 6 hours
"0 0 * * *"      # Daily at midnight
"0 0 1 * *"      # Monthly on the 1st
```

## Architecture

### Files Overview

```
src/backup/
├── index.ts          # Main module, exports public API
├── backup.ts         # BackupManager: core backup/restore logic
└── scheduler.ts      # BackupScheduler: cron scheduling

src/tools/backup/
├── index.ts                    # Export all tools
├── createBackupTool.ts         # On-demand backup creation
├── restoreBackupTool.ts        # Restore from backup
├── listBackupsTool.ts          # List available backups
├── deleteBackupTool.ts         # Remove specific backup
├── getBackupStatusTool.ts      # Backup status monitoring
└── verifyBackupTool.ts         # Integrity verification
```

### Backup Process Flow

1. **Create Backup**
   ```
   Database File
      ↓
   SQLite Backup API (or fallback copy)
      ↓
   Compress (gzip)
      ↓
   Encrypt (AES-256-GCM)
      ↓
   Write Encrypted File + Metadata
      ↓
   Cleanup Old Backups (retention policy)
   ```

2. **Restore Backup**
   ```
   Encrypted Backup File
      ↓
   Decrypt (AES-256-GCM)
      ↓
   Decompress (gunzip)
      ↓
   Verify Checksum
      ↓
   Backup Current DB
      ↓
   Restore Database
   ```

## Usage

### Tools (Agent-Driven)

All tools are registered with the agent and can be used through normal agent interactions:

#### Create Backup
```typescript
Tool: create_backup
Input: {
  description?: "Optional description"
}
Response: {
  success: boolean,
  filename: string,
  timestamp: string
}
```

#### List Backups
```typescript
Tool: list_backups
Response: {
  success: boolean,
  backups: Array<{
    filename: string,
    timestamp: string,
    size: string,   // e.g., "45.23 MB"
    encrypted: boolean,
    compressed: boolean
  }>,
  stats: {
    totalBackups: number,
    totalStorageUsed: string,
    oldestBackup: string,
    newestBackup: string
  }
}
```

#### Restore Backup
```typescript
Tool: restore_backup
Input: {
  backup_filename: string  // e.g., "backup-20240305-120000-1234567890.db.gz.enc"
}
Response: {
  success: boolean,
  filename: string,
  timestamp: string,
  note: string  // Database connection must be reestablished
}
```

#### Verify Backup
```typescript
Tool: verify_backup
Input: {
  backup_filename: string
}
Response: {
  success: boolean,  // true if valid, false if corrupted
  valid: boolean,
  message: string,
  checksum: string
}
```

#### Get Backup Status
```typescript
Tool: get_backup_status
Response: {
  status: {
    schedulerRunning: boolean,
    lastBackupTime: string | null,
    timeSinceLastBackup: string,  // e.g., "2d 3h 45m ago"
    nextScheduledBackup: string | null,
    totalBackups: number,
    totalStorageUsed: string
  }
}
```

#### Delete Backup
```typescript
Tool: delete_backup
Input: {
  backup_filename: string,
  reason?: string  // Optional deletion reason
}
Response: {
  success: boolean,
  filename: string,
  size: number,
  reason: string
}
```

### Programmatic API

```typescript
import {
    createBackup,
    restoreFromBackup,
    listBackups,
    deleteBackup,
    getLastBackupTime,
    getNextScheduledBackupTime,
    verifyBackup,
    getBackupStats,
    stopBackupScheduler,
} from "./backup/index.ts";

import { db } from "./db.ts";

// Create on-demand backup
const filename = await createBackup(db, dbPath);

// List all backups
const backups = listBackups();
backups.forEach(b => {
    console.log(`${b.filename} - ${b.timestamp}`);
});

// Verify backup integrity
const result = verifyBackup(backups[0].filename);
console.log(`Backup valid: ${result.valid}`);

// Get statistics
const stats = getBackupStats();
console.log(`Total storage: ${stats.totalSize} bytes`);
```

## Database Files

### SQLite WAL Mode

The database uses WAL (Write-Ahead Logging) mode for better concurrency:
- `gravity.db` - main database file
- `gravity.db-wal` - write-ahead log
- `gravity.db-shm` - shared memory file

All are safely backed up as a unit.

### Backup Files

- **Encrypted & Compressed**: `backup-20240305-120000-1234567890.db.gz.enc` (~5-50 MB depending on data)
- **Unencrypted (if BACKUP_ENCRYPT=false)**: `backup-20240305-120000-1234567890.db.gz`
- **Index**: `backups/index.json` - metadata for all backups

## Security

### Encryption Details
- **Algorithm**: AES-256-GCM
- **Key Derivation**: SHA256 hash of MASTER_KEY
- **IV (Initialization Vector)**: 16 random bytes per backup
- **Authentication Tag**: Ensures integrity and authenticity
- **Format**: `IV (16 bytes) + AuthTag (16 bytes) + EncryptedData`

### Best Practices
1. **Master Key**: Store `MASTER_KEY` in environment variables or secrets manager
2. **Backup Directory**: Restrict file permissions on `./backups/` directory
3. **Network Backups**: Use SSH/TLS when storing backups remotely
4. **Key Rotation**: Regenerate keys periodically
5. **Verification**: Regularly verify backup integrity with `verify_backup` tool

```bash
# Generate a secure master key
openssl rand -hex 32
# Output: a1b2c3d4e5f6...

# Set in .env
BACKUP_MASTER_KEY=a1b2c3d4e5f6...
```

## Error Handling

### Automatic Retry
- Failed backups log the error but don't crash the system
- Scheduler continues running and tries again at next cron interval

### Restore Safety
- Current database is backed up before restoration
- Backup file: `gravity.db.backup-before-restore`
- Restore validates checksum before applying
- Original database preserved if restore fails

### Verification
- All operations check backup integrity
- Decryption, decompression, and checksum validation occur before use
- Detailed error messages help with troubleshooting

## Monitoring

### Check Backup Health
```bash
# View last backup time
Tool: get_backup_status

# Verify latest backup
Tool: verify_backup
Input: { backup_filename: "backup-20240305-120000-1234567890.db.gz.enc" }

# View all backups
Tool: list_backups
```

### Log Level Details
Set `LOG_LEVEL=debug` to see detailed backup operations:
```
[backup] Creating database backup...
[backup] Compressing backup...
[backup] Encrypting backup...
[backup] Backup created successfully: backup-20240305-120000-1234567890.db.gz.enc
[backup] Cleaned up 2 old backups (older than 30 days)
```

## Performance

### Typical Numbers
- **Backup Duration**: 1-10 seconds (depending on database size)
- **Restore Duration**: 2-15 seconds
- **Compression Ratio**: 3:1 to 10:1 (typical)
- **Disk Usage**: ~5-50 MB per backup (after compression)

### Resource Usage
- **CPU**: Minimal (mostly I/O bound)
- **Memory**: ~100 MB peak (for compression)
- **Disk I/O**: Sequential reads/writes (efficient)

## Troubleshooting

### Backup Not Running
1. Check `BACKUP_ENABLED=true` in .env
2. Verify cron expression syntax with online cron parser
3. Check logs for initialization errors
4. Verify `./backups/` directory exists and is writable

### Restore Fails
1. Run `verify_backup` to check file integrity
2. Ensure correct `BACKUP_MASTER_KEY` is set
3. Check database file permissions
4. Verify database is not locked by other process

### Encryption Issues
1. Ensure `MASTER_KEY` or `BACKUP_MASTER_KEY` is set consistently
2. Different keys cannot decrypt backups
3. If key lost, backups cannot be recovered
4. Keep backup of master key in secure location

### Storage Space
1. Increase `BACKUP_RETENTION_DAYS` to keep fewer backups
2. Manually delete old backups with `delete_backup` tool
3. Move backups to external storage: `BACKUP_DIR=/mnt/backups`
4. Monitor with `get_backup_status` tool

## Maintenance

### Regular Tasks
- **Daily**: Monitor `get_backup_status` for scheduler health
- **Weekly**: Run `verify_backup` on recent backups
- **Monthly**: Review backup statistics, clean up old backups
- **Quarterly**: Test restore process in development environment

### Cleanup Strategy
Automatic retention policy removes backups older than 30 days:
```typescript
// Override in code:
backupManager.cleanupOldBackups(60); // Keep 60 days
```

## Integration Points

### Initialization
Backup system initializes automatically in `src/index.ts`:
```typescript
await initializeBackupSystem(db, dbPath, {
    enabled: true,
    cronExpression: "0 2 * * *",
    retentionDays: 30,
    encryptBackups: true,
    compressBackups: true,
});
```

### Shutdown
Backup scheduler stops gracefully on app shutdown:
```typescript
stopBackupScheduler();  // In shutdown handler
```

### Tool Registration
All backup tools registered in tool registry:
```typescript
backupTools.forEach(tool => registry.register(tool));
```

## Testing

### Manual Testing
```bash
# Create backup
curl -X POST http://localhost:3000/api/backup/create

# List backups
curl http://localhost:3000/api/backup/list

# Verify backup
curl -X POST http://localhost:3000/api/backup/verify \
  -d '{"filename":"backup-20240305-120000-1234567890.db.gz.enc"}'

# Get status
curl http://localhost:3000/api/backup/status
```

### Programmatic Testing
See `src/__tests__/backup.test.ts` for comprehensive test suite.

## Future Enhancements

Potential improvements for future versions:
- [ ] Remote backup storage (S3, Azure Blob, GCS)
- [ ] Incremental backups (delta compression)
- [ ] Backup encryption with RSA public key
- [ ] Backup versioning with tags
- [ ] Automated backup verification loop
- [ ] Web UI for backup management
- [ ] Backup size analysis and optimization
- [ ] One-click backup downloads
- [ ] Scheduled restore validation tests

## Support

For issues or questions:
1. Check logs: `LOG_LEVEL=debug`
2. Run verification: `verify_backup`
3. Check configuration: All `.env` variables
4. Review architecture: This documentation
5. Open issue with details and logs
