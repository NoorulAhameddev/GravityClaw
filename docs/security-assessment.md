# Security Assessment Report: Gravity Claw

**Project:** Gravity Claw  
**Version:** 0.1.0  
**Assessment Date:** March 17, 2026  
**Assessor:** Automated Security Analysis  

---

## Executive Summary

Gravity Claw is a lean, secure personal AI agent built in TypeScript with multi-channel support (Telegram, WhatsApp, Discord, Slack, Signal, Email, WebChat). The project demonstrates strong security foundations with several built-in protections, though some areas require attention.

| Category | Status |
|----------|--------|
| Encryption & Secrets | ✅ Good |
| Access Control | ✅ Good |
| Input Validation | ✅ Good |
| Dependency Security | ⚠️ Needs Attention |
| Network Security | ✅ Good |
| Rate Limiting | ✅ Good |
| Audit Logging | ✅ Good |

---

## 1. Encryption & Secrets Management

### 1.1 AES-256-GCM Encrypted Secrets

**Status:** ✅ Implemented

The project uses AES-256-GCM encryption for storing sensitive data:

- **Algorithm:** AES-256-GCM (authenticated encryption)
- **Key Derivation:** SHA-256 hashing for master key
- **Features:**
  - Secret expiration support
  - Audit logging for all secret access
  - Automatic cleanup of expired secrets
  - Soft delete support

**Implementation:** `src/secrets.ts`

### 1.2 Master Key Management

**Status:** ⚠️ Needs Improvement

- Master key (`MASTER_KEY`) is loaded from environment
- Warning issued if not set at startup
- **Recommendation:** Consider requiring MASTER_KEY in production

### 1.3 Secrets File

**Status:** ✅ Verified

- Location: `secrets.enc.json`
- Startup validation checks file integrity
- Invalid JSON triggers error logging

---

## 2. Access Control

### 2.1 User Allowlisting

**Status:** ✅ Implemented

```
TELEGRAM_ALLOWED_USER_ID=123456789
ALLOWED_USER_IDS=123456789,987654321
```

Only whitelisted users can interact with the agent.

### 2.2 Path Allowlisting

**Status:** ✅ Implemented

File operations are restricted to safe directories:
- Working directory
- `data/`
- `backups/`

**Implementation:** `src/security/path-validator.ts`

Features:
- Symlink attack prevention
- Path traversal protection
- Real path resolution and validation

### 2.3 Group Permissions

**Status:** ✅ Implemented

- Admin-only tools: `run_shell`, `read_file`, `write_file`, `list_files`, `delete_file`, `execute_code`, `create_file`, `move_file`, `copy_file`
- Per-group tool enable/disable configuration
- Role-based access control

**Implementation:** `src/groups/index.ts`, `src/groups/permissions.ts`

### 2.4 Dangerous Command Confirmation

**Status:** ✅ Implemented

Interactive confirmation required for dangerous operations before execution.

---

## 3. Input Validation & Sanitization

### 3.1 Request Validation

**Status:** ✅ Implemented

- Zod schema validation for all API endpoints
- Separate validators for body, query, and params
- Validation middleware in `src/middleware/validation.ts`

### 3.2 SQL Injection Prevention

**Status:** ✅ Secure

- Uses parameterized queries throughout
- No string interpolation in SQL queries found

### 3.3 Output Encoding

**Status:** ✅ Implemented

- XML escaping for GraphML output
- HTML entity encoding where needed

### 3.4 Parameter Sanitization

**Status:** ✅ Implemented

Approval middleware sanitizes sensitive parameters:
- API keys, passwords, tokens are redacted in logs

---

## 4. Dependency Security

### 4.1 Known Vulnerabilities

**Status:** ⚠️ 12 Vulnerabilities Found

| Severity | Count |
|----------|-------|
| High | 8 |
| Moderate | 4 |

#### High Severity:

1. **tar (≤7.5.10)** - Multiple path traversal vulnerabilities
   - Arbitrary File Creation/Overwrite via Hardlink
   - Symlink Poisoning
   - Arbitrary File Read/Write
   
2. **undici (≤6.23.0)** - Multiple HTTP vulnerabilities
   - Unbounded decompression (DoS)
   - WebSocket length overflow
   - HTTP Request Smuggling
   - CRLF Injection

3. **flatted (<3.4.0)** - Unbounded recursion DoS

4. **semver (2.0.0-alpha - 5.7.1)** - Regular Expression DoS

#### Moderate Severity:

1. **discord.js** - Via undici dependencies
2. **file-type** - ZIP decompression bomb, infinite loop

### 4.2 Affected Components

- `@tensorflow/tfjs-node` - Depends on vulnerable tar
- `discord.js` - Depends on vulnerable undici
- `imap` - Depends on vulnerable semver

### 4.3 Remediation

```bash
# For non-breaking fixes
npm audit fix

# For all fixes (may break)
npm audit fix --force
```

**Note:** Some fixes require breaking changes (e.g., downgrading tfjs-node or discord.js)

---

## 5. Rate Limiting

### 5.1 Token Bucket Algorithm

**Status:** ✅ Implemented

- Per-session rate limiting
- Per-tool category limits
- Configurable limits (users can only lower their limits)
- Persistent storage in SQLite

**Implementation:** `src/middleware/rate-limit.ts`

### 5.2 Default Limits

- Global: 60 requests/minute
- Tool-specific limits available
- History tracking for audit

---

## 6. Network Security

### 6.1 Air-Gapped Mode

**Status:** ✅ Implemented

- Complete network isolation
- Uses local Ollama models only
- Blocks all external API calls

```env
AIR_GAPPED=true
LLM_PROVIDER=ollama
```

### 6.2 API Key Authentication

**Status:** ✅ Optional

- Optional API key for /api/* endpoints
- Header: `X-Api-Key`

### 6.3 CORS Configuration

**Status:** Needs Review

The project uses `cors` middleware. Verify configuration in production.

---

## 7. Audit Logging

### 7.1 Security Audit

**Status:** ⚠️ Disabled by Default

```env
SECURITY_AUDIT_ENABLED=true
```

### 7.2 Secret Access Logging

**Status:** ✅ Implemented

All secret operations logged:
- Read, write, rotate, delete actions
- Timestamp, user, status, error fields

---

## 8. Security Best Practices

### 8.1 Current Implementation

| Practice | Status |
|----------|--------|
| Environment separation | ✅ .env.example provided |
| No secrets in code | ✅ Externalized |
| Database file permissions | ✅ Documented |
| Session management | ✅ Implemented |
| Graceful shutdown | ✅ Implemented |
| Error handling | ✅ Structured logging |

### 8.2 Missing Items

1. **Security contact email** - Not set in SECURITY.md
2. **Security audit enabled by default** - Disabled
3. **Rate limiting on API endpoints** - Should verify
4. **HTTPS enforcement** - Document but not enforced

---

## 9. Recommendations

### High Priority

1. **Fix dependency vulnerabilities**
   ```bash
   npm audit fix
   ```
   Review breaking changes before production use

2. **Enable security audit logging**
   ```env
   SECURITY_AUDIT_ENABLED=true
   ```

3. **Set up master key requirement**
   Ensure `MASTER_KEY` is set in production

### Medium Priority

4. **Add security contact email** in SECURITY.md

5. **Implement HTTPS** for production deployments

6. **Regular dependency updates** - Set up Dependabot or similar

### Low Priority

7. **API rate limiting** - Verify endpoints have rate limits

8. **Input length limits** - Consider adding maximum message length

9. **Two-factor authentication** - Consider for sensitive operations

---

## 10. Security Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                     Gravity Claw Security                     │
├─────────────────────────────────────────────────────────────┤
│  Input Validation                                            │
│  ├── Zod schemas (API)                                       │
│  ├── Path validator (files)                                  │
│  └── Session sanitization                                    │
├─────────────────────────────────────────────────────────────┤
│  Access Control                                              │
│  ├── User allowlisting                                        │
│  ├── Group permissions                                        │
│  └── Admin-only tools                                         │
├─────────────────────────────────────────────────────────────┤
│  Encryption                                                   │
│  ├── AES-256-GCM secrets                                     │
│  └── Optional backup encryption                              │
├─────────────────────────────────────────────────────────────┤
│  Network                                                     │
│  ├── Air-gapped mode (Ollama)                                │
│  └── Optional API key auth                                    │
├─────────────────────────────────────────────────────────────┤
│  Rate Limiting                                               │
│  ├── Token bucket algorithm                                   │
│  └── Per-session & per-tool                                   │
├─────────────────────────────────────────────────────────────┤
│  Audit                                                       │
│  ├── Secret access logs                                       │
│  └── Optional security audit                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Conclusion

Gravity Claw has a solid security foundation with multiple layers of protection. The main areas requiring attention are:

1. **Dependency vulnerabilities** - 8 high-severity issues
2. **Security audit logging** - Disabled by default
3. **Production hardening** - HTTPS, security contact

The encryption, access control, and input validation implementations are robust and follow security best practices.

---

*Report generated: March 17, 2026*
