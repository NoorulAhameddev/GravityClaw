# Security Features Quick Reference

## 🔑 Secret Management

### Generate MASTER_KEY (One Time)
```bash
npm run secret:generate
# Output: 64-character hex key
# Add to .env: MASTER_KEY=<generated-key>
```

### List All Secrets
```bash
npm run secret:list
```

### Add a Secret
```bash
npm run secret:add -- \
  --name API_KEY \
  --value "secret123" \
  --expires-in-days 90 \
  --description "External API key"
```

### Delete a Secret
```bash
npm run secret:delete -- DELETED_SECRET
# Soft delete - keeps in file for grace period
```

### Check for Expiring Secrets
```bash
npm run secret:rotate
# Shows secrets approaching rotation age (default: 90 days)
```

### Rotate Secrets
```bash
npm run secret:rotate -- --max-age-days 90
# Shows which secrets need rotation
```

### Cleanup Deleted Secrets
```bash
npm run secret:cleanup -- --grace-period-days 90
# Permanently removes secrets deleted 90+ days ago
```

## 📋 Audit Logging

### View All Audit Logs (Last 7 Days)
```bash
npm run secret:audit
```

### Filter by Type
```bash
npm run secret:audit -- --type secret    # Secrets only
npm run secret:audit -- --type file      # Files only
npm run secret:audit -- --type all       # Both (default)
```

### Filter by Time
```bash
npm run secret:audit -- --days 30        # Last 30 days
npm run secret:audit -- --days 365       # Last year
```

### Filter by Action
```bash
npm run secret:audit -- --action write   # Write operations only
npm run secret:audit -- --action read    # Read operations only
npm run secret:audit -- --type secret --action rotate
```

### Limit Results
```bash
npm run secret:audit -- --limit 50       # Show last 50 entries
npm run secret:audit -- --limit 1000 --days 90
```

### Combined Filters
```bash
npm run secret:audit -- --type secret --action write --days 7 --limit 50
npm run secret:audit -- --type file --user telegraph:123456 --limit 100
```

## 🛡️ Path Validation

### Configuration

**In `.env`:**
```bash
# Default: workspace directory only
SAFE_DIRECTORIES=.

# Multiple directories (comma-separated)
SAFE_DIRECTORIES=./data,./uploads,./exports

# Environment variables
SAFE_DIRECTORIES=$HOME/data,/tmp,$TMPDIR
```

### Via Dashboard Tool
```typescript
// Check if path is allowed
validatePathAccess({ 
  path: './data/file.txt', 
  action: 'read'    // read, write, or delete
})

// Response includes:
{
  allowed: true,
  path: './data/file.txt',
  resolved_path: '/full/path/to/data/file.txt',
  is_symlink: false,
  reason: null  // Only if denied
}
```

## 📊 Security Status & Monitoring

### Check Security Status
```typescript
getSecurityStatus()
// Returns:
// - MASTER_KEY configuration status
// - Safe directories list
// - Audit logging enabled
// - Expiring secrets count
// - Recent security events
```

### Get Full Audit Trail
```typescript
getSecurityAuditLog({
  type: 'all',        // all, secret, file
  days: 30,
  limit: 100,
  secret_name: 'API_KEY',
  action: 'read',
  user: 'telegram:123456',
  status: 'success'   // success, failed, denied, error
})
```

### Check Secret Rotation Status
```typescript
rotateSecrets({
  maxAgeDays: 90,     // Secrets older than this need rotation
  autoCleanup: true   // Automatically cleanup deleted secrets
})
// Returns: List of secrets needing rotation
```

## 🚀 Getting Started

### 1. Initial Setup
```bash
# Generate master key
npm run secret:generate
# Add to .env

# Configure safe directories
# Edit .env: SAFE_DIRECTORIES=./data,./uploads

# Restart app
npm run dev
```

### 2. First Secret
```bash
npm run secret:add -- \
  --name DB_PASSWORD \
  --value "mypassword" \
  --expires-in-days 180
```

### 3. Verify Setup
```bash
npm run secret:list
npm run secret:audit
```

## ⚙️ Configuration Reference

| Variable | Default | Purpose |
|----------|---------|---------|
| `MASTER_KEY` | (none) | Encryption key for secrets |
| `SAFE_DIRECTORIES` | `.` | Allowed directories for file ops |
| `SECRET_ROTATION_DAYS` | `90` | Days before secret flagged for rotation |
| `SECRET_CLEANUP_DAYS` | `90` | Days to keep deleted secrets |
| `SECURITY_AUDIT_ENABLED` | `true` | Enable audit logging |
| `FILE_ACCESS_LOG_RETENTION_DAYS` | `30` | Keep file logs for N days |

## 🔍 Common Tasks

### Export Secrets for Backup
```bash
npm run secret:export -- --output secrets-backup.json
# Keep this file in secure location (encrypted, offline storage)
```

### Import Secrets from Backup
```bash
npm run secret:import -- --input secrets-backup.json
```

### Migrate MASTER_KEY
```bash
# 1. Export with old key
npm run secret:export -- --output backup.json

# 2. Update .env with new MASTER_KEY
MASTER_KEY=<new-key>

# 3. Import with new key
npm run secret:import -- --input backup.json

# 4. Verify
npm run secret:list
```

### Audit Specific Secret Access
```bash
npm run secret:audit -- --secret DB_PASSWORD --days 30
```

### Find Suspicious Activity
```bash
# Failed operations
npm run secret:audit -- --status failed --days 7

# Denied access attempts
npm run secret:audit -- --status denied

# Recent file operations
npm run secret:audit -- --type file --days 1 --action write
```

## 💡 Best Practices

1. **Rotation Review**
   ```bash
   # Weekly check for expiring secrets
   npm run secret:rotate
   ```

2. **Audit Review**
   ```bash
   # Weekly audit of access patterns
   npm run secret:audit -- --days 7
   ```

3. **Database Backups**
   ```bash
   # Include secrets in backups
   npm run secret:export -- --output weekly-backup.json
   ```

4. **Security Monitoring**
   ```bash
   # Monthly security status check
   getSecurityStatus()
   ```

5. **Cleanup Routine**
   ```bash
   # Monthly cleanup of old deleted secrets
   npm run secret:cleanup -- --grace-period-days 90
   ```

## 🐛 Troubleshooting

### MASTER_KEY not set
```
Error: MASTER_KEY not set. Set MASTER_KEY env var or generate one
Solution: npm run secret:generate && add to .env
```

### Secret file corrupted
```
Error: Secrets file corrupted or invalid JSON
Solution: Restore from backup or run: npm run secret:import --input backup.json
```

### Path access denied
```
Error: Access denied: Path not in allowlist
Solution: Check SAFE_DIRECTORIES in .env, add directory: SAFE_DIRECTORIES=./data,./new-dir
```

### Symlink escape detected
```
Error: Symlink resolves outside of allowlist
Solution: Symlink target outside allowed directories - move or reconfigure allowlist
```

## 📖 Documentation

- Full guide: [docs/SECURITY_SETUP.md](SECURITY_SETUP.md)
- Implementation details: [docs/SECURITY_IMPLEMENTATION.md](SECURITY_IMPLEMENTATION.md)
- Path validator: [src/security/path-validator.ts](../src/security/path-validator.ts)
- Secret manager: [scripts/secret-manager.ts](../scripts/secret-manager.ts)

## 🔗 Related Commands

```bash
npm run dev              # Start with security validation
npm run typecheck        # Verify types
npm run test:run         # Run security tests
```
