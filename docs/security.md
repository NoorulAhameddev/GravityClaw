# Security Policy

## Reporting Security Issues

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in Gravity Claw, please report it privately:

- **Email**: (Add your preferred security contact email)
- **GitHub Security Advisories**: Use the [Security Advisories](https://github.com/noorulahamed/gravityclaw/security/advisories) feature to report vulnerabilities privately

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will respond to security reports within 48 hours and work with you to resolve the issue promptly.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Security Features

Gravity Claw includes several security features to protect your data and credentials:

### 1. Air-Gapped Mode

Run Gravity Claw completely offline using local Ollama models:

- No external API calls
- All processing happens locally
- Network isolation enforced

See [docs/AIRGAP.md](docs/AIRGAP.md) for setup instructions.

### 2. Encrypted Secrets

Store API keys and credentials securely using AES-256-GCM encryption:

```bash
# Generate master key
node scripts/encrypt-secret.ts --generate-key

# Encrypt credentials
node scripts/encrypt-secret.ts --add API_KEY "your-secret-key"
```

See [docs/ENCRYPTED_SECRETS.md](docs/ENCRYPTED_SECRETS.md) for full documentation.

### 3. User Allowlisting

Restrict bot access to specific Telegram or WhatsApp user IDs:

```env
ALLOWED_USER_IDS=123456789,987654321
```

Only whitelisted users can interact with your agent.

### 4. File Access Control

Configure allowed paths for file operations to prevent unauthorized access:

```typescript
// src/config.ts
allowedPaths: [
  process.cwd(),
  path.join(process.cwd(), 'memory-files'),
  // Add specific directories
]
```

### 5. Input Validation

All user inputs are validated and sanitized before processing to prevent injection attacks.

## Security Best Practices

When deploying Gravity Claw:

1. **Environment Variables**: Never commit `.env` files. Use `.env.example` as a template.

2. **API Keys**: Use encrypted secrets system instead of plain environment variables for production:
   ```bash
   MASTER_KEY=xxx  # Only this in .env
   # Store all other secrets encrypted in secrets.enc.json
   ```

3. **Network Security**: 
   - Use HTTPS for web interfaces
   - Configure firewall rules to restrict access
   - Enable rate limiting for public endpoints

4. **Database Security**:
   - Restrict file permissions on `gravity.db` (chmod 600)
   - Regular backups to secure location
   - Encrypt backups if storing sensitive data

5. **Authentication Files**:
   - Keep `baileys_auth_info/` secure (already gitignored)
   - Rotate WhatsApp sessions periodically
   - Never share `creds.json` or session files

6. **Updates**: 
   - Keep dependencies updated: `npm audit fix`
   - Monitor security advisories
   - Subscribe to GitHub notifications

7. **Deployment**:
   - Use non-root user for running the service
   - Enable log rotation to prevent disk exhaustion
   - Monitor for unusual activity

## Known Security Considerations

### LLM Prompt Injection

Large language models can be vulnerable to prompt injection attacks. Mitigations:

- Input validation and sanitization
- Prompt engineering to resist manipulation
- User allowlisting to limit attack surface
- Air-gapped mode for sensitive environments

### Dependency Security

We regularly audit dependencies for vulnerabilities:

```bash
npm audit
```

Report any dependency vulnerabilities you discover.

### Data Privacy

- Conversation history stored locally in `gravity.db`
- Memory files stored in `memory-files/`
- No telemetry or data collection
- Air-gapped mode available for complete isolation

## Disclosure Policy

- We will coordinate disclosure timing with the reporter
- Security advisories will be published after fixes are available
- Credits will be given to reporters (unless anonymity requested)

## Security Updates

Security patches will be released as soon as fixes are available:

- Critical: Within 24-48 hours
- High: Within 1 week
- Medium: Within 2 weeks
- Low: In next regular release

## Contact

For security concerns, please use private reporting channels above rather than public issues.

Thank you for helping keep Gravity Claw and its users secure!
