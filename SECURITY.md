# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

Please report any security vulnerabilities to the maintainers directly via email or by opening a GitHub Security Advisory. Do not disclose vulnerabilities publicly until a patch has been released.

### What to include
- A description of the vulnerability.
- Steps to reproduce the issue.
- Potential impact.

## Security Features

GravityClaw implements the following security features by default:
- Constant-time comparison for API keys and WebSocket tokens.
- Strict input sanitization against LLM prompt injection and jailbreaking.
- Whitelisted environment variable passing for MCP child processes.
- Local validation of dangerous shell execution patterns (eval, sudo, reverse shells).
- Rate limiting on API and WebSocket endpoints.
- Helmet security headers and strict CSP configuration.
- Global error boundaries to prevent unhandled rejection crashes.
