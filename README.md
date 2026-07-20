# Gravity Claw

**A high-performance, secure, personal AI agent ecosystem.** Transform any LLM into a Personal OS with multi-platform integration, multi-agent orchestration, and intelligent automation.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](tsconfig.json)
[![Status: Active Development](https://img.shields.io/badge/Status-Active%20Development-blue)](.)

---

## Overview

Gravity Claw routes messages from any channel (Telegram, Discord, Slack, WhatsApp, Signal, Email, Web) through an intelligent agent loop that calls LLMs, executes tools, and persists context in a hybrid memory system. It supports 10+ LLM providers, 85+ built-in tools, and can run fully air-gapped.

---

## Features

| Category | Capabilities |
|----------|-------------|
| **Intelligent Agent Loop** | Iterative tool execution with configurable limits, approval gates, and safety bounds |
| **Multi-Channel** | Telegram, Discord, Slack, WhatsApp, Signal, Email, WebChat — unified agent backend |
| **Hybrid Memory** | SQLite + Vector embeddings (ChromaDB) + Knowledge Graph + Markdown facts + Supabase sync |
| **Multi-Agent Orchestration** | Role-based Swarms and DAG-based Mesh workflows |
| **Proactive Engine** | Heartbeat check-ins, daily recaps, recommendations, automated memory consolidation |
| **Live Canvas (A2UI)** | Push rich HTML/JS widgets to users via WebSockets |
| **Plugin System** | Runtime extensibility without restarts (providers, channels, tools, memory) |
| **Enterprise Security** | Air-gap mode, AES-256-GCM encryption, user/path allowlisting, audit logging |
| **LLM Flexibility** | OpenAI, Anthropic (Claude), Google AI, Groq, DeepSeek, Cohere, Mistral, NVIDIA, Ollama, OpenRouter, failover chains |
| **85+ Built-in Tools** | Browser automation, sandboxed code execution, file operations, calendar, Notion, search, web scraping |

---

## Quick Start

```bash
git clone https://github.com/NoorulAhameddev/GravityClaw.git
cd GravityClaw
npm install
cp .env.example .env   # Configure your LLM API key
npm run dev             # http://localhost:3000
```

**Requirements:** Node.js 20+, npm 10+, and at least one LLM API key.

See [docs/environment.md](docs/environment.md) for complete configuration reference.

---

## CLI Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server with hot reload |
| `npm start` | Production server |
| `npm run cli -- chat` | Interactive chat REPL |
| `npm run cli -- doctor` | Health checks and diagnostics |
| `npm run cli -- config` | View current configuration |
| `npm run cli -- tools` | List all available tools |
| `npm run cli -- sessions` | Manage conversation sessions |
| `npm run typecheck` | TypeScript type checking |
| `npm run test:run` | Run test suite |
| `npm run test:coverage` | Generate coverage report |

Full CLI reference: [docs/guides/CLI.md](docs/guides/CLI.md)

---

## Architecture

```
Channel Layer (Telegram, Discord, Slack, WhatsApp, Signal, Email, Web)
    ↓
Channel Router (multiplex, auth, rate-limit)
    ↓
Agent Loop (runAgent → callClaude → Tool execution → repeat)
    ↓
Tool Registry (85+ tools across 15+ categories)
    ↓
Memory System (SQLite + Vector + Knowledge Graph + Markdown)
```

| Component | Location |
|-----------|----------|
| Agent Loop | `src/agent.ts` |
| LLM Orchestrator | `src/llm/orchestrator.ts` |
| Tool Registry (85+ tools) | `src/tools/` |
| Memory Engine | `src/memory/` |
| Multi-Agent (Swarms & Mesh) | `src/agents/` |
| Plugin System | `src/plugins/` |
| Channel Adapters | `src/channels/` |
| Configuration (Zod-validated) | `src/config.ts` |

See [docs/architecture/ARCHITECTURE_OVERVIEW.md](docs/architecture/ARCHITECTURE_OVERVIEW.md) for detailed design.

---

## Security & Privacy

| Feature | Description |
|---------|-------------|
| Air-Gapped Mode | Full local operation via Ollama; zero external network calls |
| Encrypted Secrets | AES-256-GCM for API keys, independent of environment variables |
| User Allowlisting | Strict user/group ID filtering across all channels |
| Path Allowlisting | File operations restricted to safe directories |
| Approval Middleware | Human-in-the-loop gates for dangerous operations |
| Audit Logging | Complete file access and tool execution tracking |
| Rate Limiting | Per-endpoint API and WebSocket rate limits |

**Report vulnerabilities:** See [SECURITY.md](SECURITY.md) for private reporting.

---

## Deployment

```bash
# Docker (recommended)
docker compose up -d

# Manual / VPS
npm start

# Process management with PM2
npm install -g pm2
pm2 start npm --name "gravity-claw" -- start
pm2 save
```

### Air-Gapped Mode

```bash
# Install Ollama, pull a model, then:
LLM_PROVIDER=ollama OLLAMA_BASE_URL=http://localhost:11434 npm start
```

See [docs/guides/DEPLOYMENT.md](docs/guides/DEPLOYMENT.md) and [docs/infrastructure.md](docs/infrastructure.md) for production setup, including Terraform (AWS ECS Fargate + Redis + ALB).

---

## Documentation

| Category | Documents |
|----------|-----------|
| **Getting Started** | [Environment Reference](docs/environment.md) &bull; [Quick Start](docs/guides/CLI.md) &bull; [API Reference](docs/guides/API.md) |
| **Architecture** | [Overview](docs/architecture/ARCHITECTURE_OVERVIEW.md) &bull; [Details](docs/architecture/ARCHITECTURE.md) &bull; [Pipeline](docs/architecture/PIPELINE.md) |
| **Features** | [Multi-Agent Systems](docs/MULTI_AGENT_SYSTEMS.md) &bull; [Skills](docs/SKILLS_GUIDE.md) &bull; [Proactive Features](docs/PROACTIVE_FEATURES.md) &bull; [Live Canvas](docs/features/canvas/CANVAS.md) &bull; [Model Switching](docs/guides/MODEL_SWITCHING.md) |
| **Security** | [Policy](SECURITY.md) &bull; [Air-Gap](docs/features/airgap/AIRGAP.md) &bull; [Encrypted Secrets](docs/ENCRYPTED_SECRETS.md) &bull; [Security Assessment](docs/security-assessment.md) |
| **Operations** | [Deployment](docs/guides/DEPLOYMENT.md) &bull; [Infrastructure](docs/infrastructure.md) &bull; [Backup & Restore](docs/features/backup/BACKUP_RESTORE_SYSTEM.md) &bull; [Observability](docs/features/observability/OBSERVABILITY.md) &bull; [Runbook](docs/operations/runbook.md) |
| **Development** | [Contributing](CONTRIBUTING.md) &bull; [Tools Reference](docs/TOOLS_REFERENCE.md) &bull; [Plugin System](src/plugins/README.md) &bull; [Architecture Decisions](adr/) |

Complete index: [docs/INDEX.md](docs/INDEX.md)

---

## Project Status

All six foundational levels are complete. The project is in active development with ongoing improvements to stability, tool coverage, and documentation.

- Foundation (Telegram, Tool Loop, Core Architecture)
- Memory (SQLite, Vector Search, Knowledge Graph)
- Automation (Browser, Shell, Scheduler)
- Connectivity (MCP, Webhooks, Plugins)
- Intelligence (Swarms, Mesh, Recommendations)
- Experience (Voice, Live Canvas, Air-gap Mode)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for code standards, testing requirements, and PR process. All contributions are governed by our [Code of Conduct](CODE_OF_CONDUCT.md).

---

## License

MIT &mdash; see [LICENSE](LICENSE).

---

## Links

- [Issues](https://github.com/NoorulAhameddev/GravityClaw/issues)
- [Discussions](https://github.com/NoorulAhameddev/GravityClaw/discussions)
- [Security](SECURITY.md)
