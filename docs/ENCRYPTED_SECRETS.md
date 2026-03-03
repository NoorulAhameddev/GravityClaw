# Encrypted Secrets

Gravity Claw uses AES-256-GCM encryption to securely store sensitive configuration values like API keys.

## Features

- **AES-256-GCM encryption**: Industry-standard authenticated encryption
- **Master key derivation**: Supports hex keys or passphrases (hashed with SHA-256)
- **Tamper detection**: Authenticated encryption prevents data modification
- **CLI management**: Easy-to-use command-line tool
- **Metadata support**: Store descriptions and timestamps with secrets
- **Git-safe**: Encrypted secrets can be committed to version control

## Quick Start

### 1. Generate a Master Key

```bash
node scripts/encrypt-secret.ts --generate-key
```

This outputs a 64-character hex string. Copy it to your `.env` file:

```env
MASTER_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

⚠️ **Keep this key safe!** Anyone with this key can decrypt your secrets.

### 2. Add Encrypted Secrets

```bash
# Add a secret
node scripts/encrypt-secret.ts --add MY_API_KEY "sk-1234567890"

# Add a secret with description
node scripts/encrypt-secret.ts --add ANTHROPIC_KEY "sk-ant-..." --desc "Production Anthropic API key"
```

Secrets are stored in `secrets.enc.json`:

```json
{
  "MY_API_KEY": {
    "iv": "a1b2c3d4e5f6...",
    "data": "encrypted...",
    "authTag": "auth...",
    "metadata": {
      "name": "MY_API_KEY",
      "description": "Production API key",
      "createdAt": "2026-03-01T12:00:00Z"
    }
  }
}
```

### 3. Use Secrets in Code

```typescript
import { decryptAllSecrets } from "./src/secrets.js";
import { config } from "./src/config.js";

const secrets = await decryptAllSecrets("secrets.enc.json", config.MASTER_KEY!);

const apiKey = secrets.get("MY_API_KEY");
console.log("Decrypted API key:", apiKey);
```

## CLI Commands

### Generate Master Key

```bash
node scripts/encrypt-secret.ts --generate-key
```

### Add Secret

```bash
node scripts/encrypt-secret.ts --add <name> <value>
node scripts/encrypt-secret.ts --add MY_KEY "secret-value"
```

### List Secrets

```bash
node scripts/encrypt-secret.ts --list
```

Output:
```
📋 Secrets in secrets.enc.json:

  • MY_API_KEY
    Production API key
    Created: 2026-03-01T12:00:00Z

  • BACKUP_KEY
    Backup API key
    Created: 2026-03-01T13:00:00Z
```

### View Secret Value

```bash
node scripts/encrypt-secret.ts --view MY_API_KEY
```

Output:
```
🔑 Secret 'MY_API_KEY':

sk-1234567890
```

### Remove Secret

```bash
node scripts/encrypt-secret.ts --remove MY_API_KEY
```

### Encrypt (without saving)

```bash
node scripts/encrypt-secret.ts --encrypt "my-secret"
```

Output:
```json
{
  "iv": "a1b2c3d4e5f6...",
  "data": "encrypted...",
  "authTag": "auth..."
}
```

### Decrypt (from JSON)

```bash
node scripts/encrypt-secret.ts --decrypt '{"iv":"...","data":"...","authTag":"..."}'
```

## Security Best Practices

### ✅ DO

- **Generate a strong master key** using the CLI tool
- **Store master key in .env** (never commit to git)
- **Commit encrypted secrets** to version control
- **Rotate secrets regularly** (remove old, add new)
- **Use different master keys** for dev/staging/production environments
- **Back up your master key** securely (password manager, encrypted backup)

### ❌ DON'T

- **Don't commit .env** file to git (use .gitignore)
- **Don't share master key** via email, Slack, etc.
- **Don't log decrypted secrets** in application code
- **Don't reuse master key** across different projects
- **Don't store plaintext secrets** in code or config files

## How It Works

### Encryption (AES-256-GCM)

1. **Key Derivation**: Master key is hashed with SHA-256 to get 256-bit encryption key
2. **Random IV**: Generate random 128-bit initialization vector for each encryption
3. **Encrypt**: Use AES-256-GCM to encrypt plaintext
4. **Auth Tag**: GCM mode produces 128-bit authentication tag
5. **Store**: Save IV, ciphertext, and auth tag (all hex-encoded)

### Decryption

1. **Load**: Read IV, ciphertext, and auth tag from JSON
2. **Key Derivation**: Hash master key with SHA-256
3. **Verify**: GCM mode verifies auth tag (detects tampering)
4. **Decrypt**: Decrypt ciphertext with key and IV
5. **Return**: Return plaintext (or throw error if tampered)

### Security Properties

- **Confidentiality**: AES-256 is unbreakable with current technology
- **Authenticity**: GCM auth tag prevents data tampering
- **Uniqueness**: Random IV ensures different ciphertext for same plaintext
- **Forward secrecy**: Compromising one secret doesn't affect others
- **Tamper detection**: Modified ciphertext fails authentication

## Migration from Plaintext

If you have existing plaintext secrets in `.env`:

1. Generate master key
2. For each secret:
   ```bash
   node scripts/encrypt-secret.ts --add SECRET_NAME "$SECRET_VALUE"
   ```
3. Update code to load from `secrets.enc.json`
4. Remove plaintext secrets from `.env`
5. Git commit `secrets.enc.json`

Example migration script:

```bash
#!/bin/bash
# Migrate secrets from .env to secrets.enc.json

export MASTER_KEY=$(node scripts/encrypt-secret.ts --generate-key | tail -1)
echo "MASTER_KEY=$MASTER_KEY" >> .env

node scripts/encrypt-secret.ts --add OPENAI_API_KEY "$OPENAI_API_KEY"
node scripts/encrypt-secret.ts --add ANTHROPIC_API_KEY "$ANTHROPIC_API_KEY"
node scripts/encrypt-secret.ts --add GOOGLE_API_KEY "$GOOGLE_API_KEY"

echo "✅ Secrets migrated to secrets.enc.json"
echo "⚠️  Remember to remove plaintext secrets from .env"
```

## Environment-Specific Secrets

Use different master keys for different environments:

```bash
# Development
MASTER_KEY=dev-key-0123456789abcdef...

# Staging
MASTER_KEY=staging-key-fedcba9876543210...

# Production
MASTER_KEY=prod-key-abcdef0123456789...
```

Each environment has its own `secrets.enc.json` file with secrets encrypted using that environment's master key.

## Troubleshooting

### "Decryption failed: invalid key or corrupted data"

- **Wrong master key**: Check `MASTER_KEY` in `.env` matches the key used to encrypt
- **Corrupted file**: Restore from backup or re-encrypt
- **Tampered data**: Someone modified `secrets.enc.json` manually

### "MASTER_KEY not found in environment"

- Add `MASTER_KEY=<your-key>` to `.env` file
- Or export it: `export MASTER_KEY=<your-key>`

### "Secret 'X' not found"

- Run `node scripts/encrypt-secret.ts --list` to see available secrets
- Secret name is case-sensitive

## API Reference

See [src/secrets.ts](../src/secrets.ts) for full API documentation:

- `generateMasterKey()` - Generate random 256-bit key
- `encryptSecret(plaintext, masterKey)` - Encrypt a string
- `decryptSecret(encrypted, masterKey)` - Decrypt to string
- `addSecret(file, name, value, key)` - Add to file
- `removeSecret(file, name)` - Remove from file
- `listSecrets(file)` - List all secret names
- `decryptAllSecrets(file, key)` - Decrypt all secrets

## Testing

Run encryption tests:

```bash
npm test secrets.test.ts
```

Tests cover:
- Encryption/decryption correctness
- Key derivation
- Tamper detection
- File operations
- Security properties
