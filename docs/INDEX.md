# GravityClaw Documentation Index

**Complete guide to all GravityClaw documentation**

---

## 🚀 Getting Started

New to GravityClaw? Start here:

| Document | Description | Priority |
|----------|-------------|----------|
| [README](../README.md) | Project overview, quick start, features | ⭐⭐⭐ Required |
| [CLI Guide](guides/CLI.md) | Command-line interface reference | ⭐⭐⭐ Essential |
| [Deployment Guide](guides/DEPLOYMENT.md) | Local, VPS, and Docker deployment | ⭐⭐ Recommended |

---

## 📚 Core Concepts

Understand the architecture and design:

| Document | Description |
|----------|-------------|
| [Architecture Overview](architecture/ARCHITECTURE_OVERVIEW.md) | Complete system architecture |
| [Architecture Details](architecture/ARCHITECTURE.md) | Detailed technical design, data flow |
| [Request Flow](#) | How messages flow through the system |
| [Database Schema](#) | SQLite schema and table structure |

---

## 🛠️ Features & Capabilities

### Tools & Extensibility

| Document | Description | Topics Covered |
|----------|-------------|----------------|
| [**Tools Reference**](TOOLS_REFERENCE.md) | Complete catalog of all 80+ tools | All tools by category, usage examples, development guide |
| [Skills Guide](SKILLS_GUIDE.md) | Create prompt-based knowledge assets | Skill format, examples, code blocks, management |
| [Plugin System](../src/plugins/README.md) | Runtime extension system | Plugin architecture, traits, development |

### Multi-Agent & Orchestration

| Document | Description | Topics Covered |
|----------|-------------|----------------|
| [**Multi-Agent Systems**](MULTI_AGENT_SYSTEMS.md) | Swarms and Mesh workflows | Agent roles, DAG execution, coordination patterns |

### Advanced Features

| Document | Description | Topics Covered |
|----------|-------------|----------------|
| [**Proactive Features**](PROACTIVE_FEATURES.md) | Heartbeat, recommendations, recaps  | Scheduled check-ins, daily suggestions, evening summaries |
| [Live Canvas (A2UI)](features/canvas/CANVAS.md) | Push rich HTML/JS widgets to users | Canvas protocol, examples, WebSocket integration |
| [Model Switching](guides/MODEL_SWITCHING.md) | Dynamic provider/model selection | Per-session overrides, failover, cost optimization |
| [Export Functionality](EXPORT_FUNCTIONALITY.md) | Data export tools | Chat history, memory, usage stats, knowledge graph |

### Development & Automation

| Document | Description | Topics Covered |
|----------|-------------|----------------|
| [Webhooks](guides/API.md#webhooks) | External integrations via webhooks | Creating webhooks, triggering, history |
| [Scheduler](TOOLS_REFERENCE.md#scheduler-tools) | Cron-based task scheduling | Natural language schedules, task management |
| [Browser Automation](TOOLS_REFERENCE.md#browser-automation) | Headless browser tools | Navigation, scraping, form filling |

---

## 🔒 Security & Operations

### Security

| Document | Description | Topics Covered |
|----------|-------------|----------------|
| [**Security Policy**](../SECURITY.md) | Vulnerability reporting, features | Security features, best practices, contact info |
| [Air-Gapped Mode](features/airgap/AIRGAP.md) | Complete offline operation | Setup, enforcement, local models |
| [Encrypted Secrets](ENCRYPTED_SECRETS.md) | AES-256-GCM secret management | Encryption, rotation, audit logging |
| [Security Implementation](features/security/SECURITY_IMPLEMENTATION.md) | Security features in depth | Allowlisting, validation, audit trails |
| [Security Setup Guide](features/security/SECURITY_SETUP.md) | Step-by-step security configuration | Initial setup, hardening, production checklist |

### Backup & Data Management

| Document | Description | Topics Covered |
|----------|-------------|----------------|
| [**Backup & Restore System**](features/backup/BACKUP_RESTORE_SYSTEM.md) | Complete backup guide | Automated backups, encryption, restoration, scheduling |

### Monitoring & Performance

| Document | Description | Topics Covered |
|----------|-------------|----------------|
| [**Observability**](features/observability/OBSERVABILITY.md) | Logging, metrics, tracing | Structured logging, Prometheus metrics, distributed tracing, correlation |
| [Performance Optimization](features/performance/PERFORMANCE.md) | Speed and efficiency tuning | Agent optimization, memory tuning, caching strategies |
| [Rate Limiting](features/rate-limiting/RATE_LIMITING.md) | API rate limiting system | Configuration, tiers, monitoring, bypass |

---

## 📖 API & Integration Reference

| Document | Description | Topics Covered |
|----------|-------------|----------------|
| [**API Reference**](guides/API.md) | Complete API documentation | REST endpoints, WebSocket protocol, tool APIs, authentication |
| [Tools Reference](TOOLS_REFERENCE.md#tool-api-reference) | Tool interface specification | Input schemas, context injection, error handling |

---

## 🤝 Contributing & Development

| Document | Description |
|----------|-------------|
| [**Contributing Guide**](../CONTRIBUTING.md) | How to contribute to the project |
| [Code of Conduct](../CODE_OF_CONDUCT.md) | Community guidelines and expectations |
| [License](../LICENSE) | MIT License terms |

---

## 📋 Reference & Examples

### Examples

| Location | Contents |
|----------|----------|
| [docs/examples/](examples/) | Code examples and snippets |
| [Skills Examples](../skills/) | Example skill files (calculator, weather) |
| [Plugin Examples](../src/plugins/builtin/) | Built-in plugin implementations |

### Quick References

| Document | Description |
|----------|-------------|
| [Observability Quick Reference](features/observability/OBSERVABILITY.md#quick-start) | Fast lookup for logging, metrics, tracing |
| [Rate Limiting At-a-Glance](features/rate-limiting/RATE_LIMITING.md#configuration-quick-reference) | Fast lookup for rate limit configuration |
| [Security Quick Reference](features/security/SECURITY_QUICK_REFERENCE.md) | Security features and commands |

---

## 📦 By Use Case

### "I want to..."

#### Set Up & Deploy
1. [README Quick Start](../README.md#quick-start) - 5-minute setup
2. [Deployment Guide](guides/DEPLOYMENT.md) - Production deployment
3. [Security Setup](features/security/SECURITY_SETUP.md) - Secure your installation
4. [Air-Gapped Mode](features/airgap/AIRGAP.md) - Offline operation

#### Extend Functionality
1. [Tools Reference](TOOLS_REFERENCE.md#tool-development) - Create custom tools
2. [Skills Guide](SKILLS_GUIDE.md) - Create skills with code blocks
3. [Plugin System](../src/plugins/README.md) - Build runtime plugins
4. [Multi-Agent Systems](MULTI_AGENT_SYSTEMS.md) - Coordinate multiple agents

#### Integrate with External Systems
1. [API Reference](guides/API.md) - REST and WebSocket APIs
2. [Webhooks](guides/API.md#webhooks) - Incoming webhook integration
3. [MCP Bridge](TOOLS_REFERENCE.md#mcp-bridge-tools) - Model Context Protocol
4. [Canvas Integration](features/canvas/CANVAS.md) - Push rich UIs to users

#### Monitor & Optimize
1. [Observability](features/observability/OBSERVABILITY.md) - Logging, metrics, and tracing
2. [Performance Optimization](features/performance/PERFORMANCE.md) - Speed and efficiency
3. [Backup System](features/backup/BACKUP_RESTORE_SYSTEM.md) - Data protection
4. [Rate Limiting](features/rate-limiting/RATE_LIMITING.md) - Resource management

#### Secure & Protect
1. [Security Policy](../SECURITY.md) - Overview of security features
2. [Encrypted Secrets](ENCRYPTED_SECRETS.md) - Credential management
3. [Security Implementation](features/security/SECURITY_IMPLEMENTATION.md) - Feature details
4. [Air-Gapped Mode](features/airgap/AIRGAP.md) - Network isolation

---

## 📊 Documentation Status

### Complete & Current ✅
- Core documentation (README, Architecture, CLI)
- Tools Reference (all 80+ tools)
- Multi-Agent Systems
- Skills Guide
- Proactive Features
- Security features
- Observability system
- Backup & restore
- Rate limiting
- API reference

### In Progress 🚧
- Dashboard user guide (implementation complete, docs updating)
- Performance tuning guide (expanding)
- Webhook integration examples

### Planned 📝
- Video tutorials
- Interactive examples
- Troubleshooting flowcharts
- Migration guides
- Internationalization

---

## 🔍 Search Documentation

Can't find what you're looking for? Try:

1. **GitHub Search**: Use repository search for keywords
2. **Grep Command**: `grep -r "your-term" docs/`
3. **Tool Search**: `npm run cli -- tools | grep your-term`
4. **Ask the Agent**: Use the agent itself to search documentation

---

## 📝 Documentation Standards

All GravityClaw documentation follows these standards:

- **Markdown format** with consistent structure
- **Code examples** tested and working
- **Clear hierarchy** with table of contents
- **Cross-references** between related docs
- **Version info** where applicable
- **Last updated dates** for time-sensitive content

---

## 🆘 Need Help?

### Documentation Issues

Found an error in the docs? Please:
1. Check the [audit report](DOCUMENTATION_AUDIT_REPORT.md) for known issues
2. Open an issue on GitHub with "docs:" prefix
3. Even better: Submit a pull request with the fix!

### Feature Documentation Missing

Missing docs for a feature? Check:
1. [Tools Reference](TOOLS_REFERENCE.md) - Comprehensive tool catalog
2. [API Reference](guides/API.md) - API endpoints
3. Source code comments - Often the most current info
4. [Open issues](https://github.com/noorulahamed/gravityclaw/issues) - May be planned

### General Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/noorulahamed/gravityclaw/issues)
- **Discussions**: [Ask questions and share ideas](https://github.com/noorulahamed/gravityclaw/discussions)
- **Security Issues**: See [Security Policy](../SECURITY.md)

---

## 📚 External Resources

### Related Technologies

- [OpenAI API](https://platform.openai.com/docs) - OpenAI integration
- [Anthropic Claude](https://docs.anthropic.com/) - Claude integration
- [Telegram Bot API](https://core.telegram.org/bots/api) - Telegram channel
- [Baileys (WhatsApp)](https://whiskeysockets.github.io/) - WhatsApp channel
- [Better-SQLite3](https://github.com/WiseLibs/better-sqlite3) - Database
- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP specification

### Learning Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Node.js Documentation](https://nodejs.org/docs/latest/api/)
- [LLM Best Practices](https://platform.openai.com/docs/guides/prompt-engineering)

---

## 🗺️ Documentation Sitemap

```
gravyclaw/
├── README.md                                  # Project overview
├── ARCHITECTURE_OVERVIEW.md                   # System architecture
├── CONTRIBUTING.md                            # Contribution guide
├── SECURITY.md                               # Security policy
├── CODE_OF_CONDUCT.md                        # Community guidelines
├── LICENSE                                   # MIT License
│
└── docs/
    ├── INDEX.md (this file)                  # Documentation hub
    ├── DOCUMENTATION_AUDIT_REPORT.md         # Audit findings
    │
    ├── Getting Started/
    │   ├── CLI.md                           # CLI reference
    │   └── DEPLOYMENT.md                    # Deployment guide
    │
    ├── Core Features/
    │   ├── TOOLS_REFERENCE.md               # All tools catalog
    │   ├── MULTI_AGENT_SYSTEMS.md           # Swarms & Mesh
    │   ├── SKILLS_GUIDE.md                  # Skills system
    │   ├── PROACTIVE_FEATURES.md            # Heartbeat, recommendations, recap
    │   ├── CANVAS.md                        # Live Canvas (A2UI)
    │   ├── MODEL_SWITCHING.md               # Dynamic model selection
    │   └── EXPORT_FUNCTIONALITY.md          # Data export tools
    │
    ├── Architecture/
    │   └── ARCHITECTURE.md                  # Detailed architecture
    │
    ├── API & Integration/
    │   └── API.md                          # Complete API docs
    │
    ├── Security/
    │   ├── AIRGAP.md                       # Air-gapped mode
    │   ├── ENCRYPTED_SECRETS.md            # Secret management
    │   ├── SECURITY_IMPLEMENTATION.md      # Security features
    │   ├── SECURITY_SETUP.md               # Setup guide
    │   └── SECURITY_QUICK_REFERENCE.md     # Quick lookup
    │
    ├── Operations/
    │   ├── BACKUP_RESTORE_SYSTEM.md        # Backup guide
    │   ├── OBSERVABILITY.md                # Monitoring
    │   ├── PERFORMANCE.md                  # Optimization
    │   └── RATE_LIMITING.md                # Rate limits
    │
    ├── Development/
    │   └── ../src/plugins/README.md        # Plugin system
    │
    └── examples/                           # Code examples
```

---

**Last Updated**: March 5, 2026  
**Documentation Version**: 1.0.0

For the latest documentation, always check the [GitHub repository](https://github.com/noorulahamed/gravityclaw).
