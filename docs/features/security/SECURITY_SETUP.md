# Gravity Claw Security Setup Guide

## Overview

Gravity Claw implements comprehensive security measures including encrypted secrets management, path validation, file access auditing, and secret rotation. This guide covers setup, best practices, and incident response.

## Table of Contents

1. [MASTER_KEY Generation](#master_key-generation)
2. [Secret Management](#secret-management)
3. [Path Allowlisting](#path-allowlisting)
4. [File Access Auditing](#file-access-auditing)
5. [Secret Rotation](#secret-rotation)
6. [Startup Security Checks](#startup-security-checks)
7. [Security Audit & Monitoring](#security-audit--monitoring)
8. [Incident Response](#incident-response)

## MASTER_KEY Generation

### What is MASTER_KEY?

The `MASTER_KEY` is a 256-bit encryption key used to encrypt/decrypt sensitive secrets stored in `secrets.enc.json`. It's the foundation of Gravity Claw's secrets management system.

### Generate a New MASTER_KEY

```bash
# Using the secret manager CLI
npm run secret:generate

# Or manually:
node scripts/secret-manager.ts generate-key
```

This will output a 64-character hexadecimal string:
```
Generated MASTER_KEY: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

### Store MASTER_KEY Securely

1. **Environment Variable** (Development):
   ```bash
   # Add to .env file
   MASTER_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
   ```

2. **Environment Variable** (Production):
   ```bash
   # Use your platform's secret management:
   # AWS Secrets Manager, Azure Key Vault, Vault, etc.
   export MASTER_KEY=$(aws secretsmanager get-secret-value --secret-id gravity-claw-master-key --query SecretString -o text)
   ```

3. **Never**:
   - Commit to Git
   - Log to console or files
   - Share in plaintext messages
   - Store in the same location as `secrets.enc.json`

## Secret Management

### Adding Secrets

Secrets are stored in `secrets.enc.json` and encrypted with AES-256-GCM.

#### Via CLI:

```bash
# List all secrets
npm run secret:list

# Add/update a secret
node scripts/secret-manager.ts add-secret --name MY_API_KEY --value "secret123" --expires-in-days 90

# Or with metadata
node scripts/secret-manager.ts add-secret \
  --name DB_PASSWORD \
  --value "mypassword" \
  --description "Production database password" \
  --expires-in-days 180
```

#### Via Code:

```typescript
import { addSecret } from './src/secrets.ts';

await addSecret(
  './secrets.enc.json',
  'MY_API_KEY',
  'secret123',
  process.env.MASTER_KEY!,
  {
    name: 'MY_API_KEY',
    description: 'External API key',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  }
);
```

### Rotating Secrets

#### Manual Rotation:

```bash
# Rotate all expired secrets
npm run secret:rotate

# Or via tool
node scripts/secret-manager.ts rotate-secrets --max-age-days 90
```

#### Automatic Rotation:

Set `SECRET_ROTATION_DAYS` in `.env`:

```bash
# Secrets older than 90 days will automatically be notified for rotation
SECRET_ROTATION_DAYS=90

# Enable automatic cleanup of expired secrets (90 days after expiration)
SECRET_CLEANUP_DAYS=90
```

### Viewing Secret Access Log

```bash
# View all secret access logs
npm run secret:audit

# Filter by specific secret
npm run secret:audit -- --secret MY_API_KEY

# Filter by action (read, write, rotate, delete)
npm run secret:audit -- --action write

# Show last N entries
npm run secret:audit -- --limit 50
```

## Path Allowlisting

### Purpose

Path allowlisting prevents file operations (read/write/delete) from accessing:
- System directories (`/etc`, `/sys`, `C:\Windows`, etc.)
- Sensitive files (`.env`, `.ssh`, credentials, etc.)
- Arbitrary locations outside the allowlist

### Configure Safe Directories

#### Default Configuration:

```bash
# Default: workspace directory only
SAFE_DIRECTORIES=./home,./temp,./data
```

#### In .env:

```bash
# Comma-separated list of allowed directories
SAFE_DIRECTORIES=/home/user/documents,/tmp/data,./workspace

# Or use environment variables
SAFE_DIRECTORIES=$HOME/gravityclaw,$TMPDIR
```

#### Use Relative Paths:

Relative paths are resolved from the workspace directory:

```bash
# These are equivalent
SAFE_DIRECTORIES=./data
SAFE_DIRECTORIES=/absolute/path/to/workspace/data
```

### Examples

```bash
# Allow only project workspace
SAFE_DIRECTORIES=.

# Allow project + user home + temp
SAFE_DIRECTORIES=.,~,/tmp

# Allow specific folders
SAFE_DIRECTORIES=./data,./uploads,./exports
```

### Path Validation Rules

File operations are rejected if:

1. **Outside allowlist**: Path not in any safe directory
2. **Path traversal**: Contains `..` or `/` escaping  
3. **Symlink escape**: Symlink resolves outside allowlist
4. **Blocked patterns**: Matches system/sensitive paths
5. **Sensitive files**: Matches `.env*`, `*credentials*`, `*.pem`, `.ssh/*`, etc.

### Testing Path Validation

```typescript
import { validatePathAccess } from './src/security/path-validator.ts';

// Test a path before file operation
const result = validatePathAccess('./data/file.txt', {
  allowedPaths: ['./data', './uploads'],
  action: 'read',
});

if (result.allowed) {
  console.log('Path is safe to access');
} else {
  console.log('Access denied:', result.reason);
}
```

## File Access Auditing

### Enable File Access Logging

```bash
# In .env
SECURITY_AUDIT_ENABLED=true
FILE_ACCESS_LOG_RETENTION_DAYS=30
```

### View File Access Logs

```bash
# Via CLI (dashboard tool)
npm run secret:audit -- --type file

# View all file operations
npm run secret:audit -- --type file --limit 100

# Filter by operation (read, write, delete)
npm run secret:audit -- --type file --action write

# Filter by path
npm run secret:audit -- --type file --path "./data/*"

# Show last 7 days
npm run secret:audit -- --type file --days 7
```

### Audit Log Contents

Each log entry includes:

```json
{
  "timestamp": "2026-03-04T12:34:56.789Z",
  "path": "/full/path/to/file.txt",
  "action": "read",        // read, write, delete
  "size_bytes": 1024,
  "duration_ms": 42,
  "user": "telegram:12345",
  "status": "success",     // success, denied, error
  "error": null
}
```

### Suspicious Pattern Alerts

The system alerts on:

- **Rapid operations**: 10+ file ops per minute from one user
- **Path traversal attempts**: Attempts to use `..` or escape allowlist
- **Symlink attacks**: Attempts to follow symlinks outside allowlist
- **Permission errors**: Multiple "access denied" in short time
- **Large file operations**: Reading/writing > 100MB

## Secret Rotation

### Automatic Scheduling

```bash
# Check for secrets nearing expiration
SECRET_ROTATION_DAYS=90        # Alert when older than 90 days
SECRET_CLEANUP_DAYS=90         # Delete when 90 days past expiration
```

The scheduler automatically:
1. Checks daily for expired secrets
2. Logs rotation reminders
3. Cleans up deleted secrets after grace period

### Manual Rotation

```bash
npm run secret:rotate

# Specific secret
node scripts/secret-manager.ts rotate-secrets \
  --secret MY_API_KEY \
  --new-value "new_secret_value"
```

### Rotation Workflow

1. Generate new secret value
2. Add new secret with same name + version suffix
3. Update applications to use new secret
4. After confirmation, mark old secret as deprecated
5. Automatic cleanup after 90 days (configurable)

Example:

```bash
# Old secret
MY_API_KEY = "old_value_123"   # Created: 2025-01-01

# Rotate (keep both temporarily)
MY_API_KEY = "new_value_456"   # Created: 2026-03-04
MY_API_KEY_OLD = "old_value_123" # Deprecated: 2026-03-04

# After migration, delete old
# (automatically cleaned up after 90 days)
```

## Startup Security Checks

### Validation on Startup

When Gravity Claw starts, it validates:

```
✓ MASTER_KEY is set and valid format
✓ Safe directories exist and are readable
✓ Secrets file integrity (file permissions, format)
✓ No expired secrets in active use
✓ No symptomatic security misconfigurations
```

### Example Startup Log

```
[security] Validating startup security configuration...
[security] ✓ MASTER_KEY is set
[security] ✓ Safe directories exist: ./data, ./temp
[security] ✓ Secrets file integrity verified
[security] ⚠ Warning: 2 secrets expiring within 30 days
[security] Security validation complete
```

### Troubleshooting Startup Issues

| Issue | Solution |
|-------|----------|
| `MASTER_KEY not set` | Add `MASTER_KEY` to `.env` |
| `Safe directories not found` | Create directories or update `SAFE_DIRECTORIES` |
| `Secrets file corrupted` | Restore from backup or regenerate with `secret:import` |
| `Decryption failed` | Verify `MASTER_KEY` matches the one used to encrypt |

## Security Audit & Monitoring

### Dashboard Tools

Available security tools in dashboard:

```typescript
// Get complete security audit log
getSecurityAuditLog({
  type: 'all',           // 'all', 'secret', 'file', 'access'
  days: 7,
  limit: 100,
});

// Check current security status
getSecurityStatus();

// Manual secret rotation
rotateSecrets({ maxAgeDays: 90 });

// Validate a path
validatePathAccess({ path: './data/file.txt', action: 'read' });
```

### Regular Security Reviews

**Weekly**:
1. Review secret access logs for unusual patterns
2. Check for failed file access attempts
3. Verify no new security warnings in logs

**Monthly**:
1. Run `npm run secret:audit` to review all access
2. Rotate secrets nearing expiration (90+ days)
3. Review path allowlist — add/remove as needed
4. Check for deprecated or unused secrets

**Quarterly**:
1. Regenerate MASTER_KEY and re-encrypt secrets
2. Audit all users/services accessing secrets
3. Review security configuration changes
4. Test incident response procedures

### Monitoring Alerts

Configure alerts for:

- ❌ Decryption failures (wrong key)
- ❌ Path traversal attempts
- ❌ Symlink attacks
- ❌ Multiple permission denials
- ⚠️ Secrets expiring soon (< 30 days)
- ⚠️ Rapid secret access patterns

## Incident Response

### Secret Compromise Response

**If a secret is compromised:**

1. **Immediate** (< 5 minutes):
   ```bash
   # Remove the compromised secret
   node scripts/secret-manager.ts delete-secret --name COMPROMISED_SECRET
   
   # Check access log for leaks
   npm run secret:audit -- --secret COMPROMISED_SECRET
   ```

2. **Short-term** (< 1 hour):
   - Contact the service/API to invalidate the old credential
   - Generate new secret value
   - Update applications pointing to it
   - Verify applications use new value

3. **Follow-up** (< 24 hours):
   - Review how secret was leaked (log, backup, code, etc.)
   - Fix the root cause
   - Add preventive measures
   - Document the incident

### Path Validation Attack Response

**If path traversal or symlink attack detected:**

1. **Check logs**:
   ```bash
   npm run secret:audit -- --type file --status denied
   ```

2. **Review safe directory configuration**:
   ```bash
   # Verify SAFE_DIRECTORIES is correct
   node scripts/secret-manager.ts show-config
   ```

3. **Restrict access if needed**:
   ```bash
   # Temporarily disable file tools for affected user
   # Or reduce SAFE_DIRECTORIES scope
   ```

### MASTER_KEY Compromise Response

**If MASTER_KEY is exposed:**

1. **Generate new MASTER_KEY**:
   ```bash
   npm run secret:generate
   ```

2. **Re-encrypt all secrets**:
   ```bash
   # Export all secrets with old key
   npm run secret:export --output secrets-backup.json
   
   # Update .env with new MASTER_KEY
   MASTER_KEY=<new-key>
   
   # Import with new key
   npm run secret:import --input secrets-backup.json
   ```

3. **Update all systems**:
   - Rotate in production secret stores (Vault, AWS Secrets Manager, etc.)
   - Restart all services with new MASTER_KEY
   - Verify all services are operational

4. **Audit impact**:
   - Check logs for unauthorized secret access
   - Verify all services still working
   - Test failure scenarios

## Best Practices Checklist

### Secrets
- [ ] MASTER_KEY stored in environment (not code/git)
- [ ] Secrets rotated every 90 days
- [ ] Old secrets cleaned up after expiration
- [ ] Secret access logged and monitored
- [ ] Backup secrets in secure location
- [ ] Never log decrypted secrets
- [ ] Test secret rotation in dev first

### Paths
- [ ] SAFE_DIRECTORIES configured for legitimate use cases
- [ ] System directories blocked by default
- [ ] `.env` and credentials blocked from file tools
- [ ] Symlinks validated before access
- [ ] File access audit log reviewed regularly
- [ ] Suspicious patterns investigated

### Startup
- [ ] Check MASTER_KEY before startup
- [ ] Validate all config on boot
- [ ] Log security status (without exposing keys)
- [ ] Fail fast on misconfiguration

### Monitoring
- [ ] Set up alerts for failed decryptions
- [ ] Monitor secret access patterns
- [ ] Track file operations on sensitive paths
- [ ] Regular security audits (weekly/monthly)

### Incident Response
- [ ] Document incident procedures
- [ ] Test incident response regularly
- [ ] Keep secure backup of MASTER_KEY regeneration logs
- [ ] Maintain audit trail for forensics

## References

- [AES-256-GCM Encryption](https://nodejs.org/api/crypto.html)
- [OWASP Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal)
- [Secret Rotation Best Practices](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
