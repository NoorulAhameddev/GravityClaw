# Gravity Claw 🦾

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node.js](https://img.shields.io/badge/Node.js-v20+-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Status](https://img.shields.io/badge/Status-Early%20Development-orange)

Gravity Claw is a high-performance, secure, and pro-active personal AI agent ecosystem. Built from scratch in TypeScript, it transforms a simple LLM into a "Personal OS" capable of automation, multi-agent orchestration, and rich interactive experiences.

**[Features](#-features) • [Quick Start](#-quick-start) • [Architecture](#-architecture) • [Docs](#-documentation) • [Contributing](#-contributing) • [Security](#-security)**

---

## ⚠️ Project Status

**Early Development** - Gravity Claw is under active development. Core features are functional, but APIs and configuration may change. Not recommended for production use yet. Contributions and feedback are welcome!

## 📋 Requirements

Before getting started, ensure you have:

- **Node.js**: Version 20 or higher
- **npm**: Version 10 or higher
- **API Keys** (at least one):
  - OpenAI API key
  - Anthropic (Claude) API key
  - Google AI API key
  - Groq API key
  - OpenRouter API key
  - **OR** Ollama locally installed (for air-gapped mode)

### Optional Dependencies

- **Telegram Bot Token** - For Telegram integration
- **WhatsApp Credentials** - For WhatsApp integration  
- **Supabase** - For cloud memory sync
- **ElevenLabs API Key** - For high-quality voice synthesis

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up your environment
cp .env.example .env
# Edit .env with your keys

# 3. Run in development
npm run dev

# 4. Run in production
npm start

# 5. Use the CLI
npm run cli -- help
npm run cli -- chat
```

## 🖥️ Dashboard

Access the web dashboard at **http://localhost:3000** when running the server. The dashboard provides:

- **Overview** — System status, stats, and quick actions
- **Chat** — WebChat interface (built-in web channel for direct messaging)
- **Admin** — Plugin management, settings, and configuration
- **Analytics** — Usage metrics and performance insights
- **Memory** — View and manage knowledge graph and stored facts
- **Tools** — Browse available tools and their schemas
- **Workflows & Swarms** — Visualize multi-agent workflows
- **Sessions** — Manage conversation history
- **Heartbeats** — Configure proactive check-ins
- **Scheduler** — Set up recurring tasks
- **Webhooks** — Configure incoming webhook endpoints

WebChat is the built-in web interface that works alongside Telegram and WhatsApp channels.

## 🖥️ CLI Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start with hot reload (development) |
| `npm start` | Start in production mode |
| `npm run cli -- chat` | Interactive chat REPL |
| `npm run cli -- doctor` | Health checks & diagnostics |
| `npm run cli -- config` | View configuration |
| `npm run cli -- tools` | List all available tools |
| `npm run cli -- sessions` | Manage conversation sessions |
| `npm run typecheck` | Type checking |
| `npm run test` | Run tests in watch mode |
| `npm run test:run` | Run tests once |
| `npm run test:coverage` | Generate coverage report |

For detailed CLI usage, see [docs/CLI.md](docs/CLI.md)

---

Gravity Claw is designed as a modular **Personal OS**:
- **Channels**: Multi-platform support (Telegram, WhatsApp, WebChat) with unified messaging.
- **Agent Loop**: Advanced tool-use loop with confirmation gates and safety limits.
- **Memory**: Hybrid engine (SQLite + Vector/Semantic + Knowledge Graph).
- **Orchestration**: **Agent Swarms** (role-based) and **Mesh Workflows** (DAG-based task decomposition).
- **Proactive Engine**: Heartbeat updates and LLM-driven daily recommendations.
- **Interactive UI**: **Live Canvas (A2UI)** via WebSockets for pushing rich HTML/JS widgets.

## 🛡️ Security & Privacy

| Feature | Description |
|---|---|
| **Air-Gapped Mode** | Full local operation via Ollama; blocks all external fetch calls |
| **Encrypted Secrets** | AES-256-GCM management for API keys, decoupled from environment |
| **User Allowlisting** | Strict user ID filtering for all communication channels |
| **Path Allowlisting** | File operations restricted to specific safe directories |
| **Admin Controls** | Granular tool permissions for group chats |
| **No External Calls** | Complete network isolation in air-gap mode |

See [SECURITY.md](SECURITY.md) for detailed security policy and vulnerability reporting.

---

## 🏗️ Architecture Overview

**Request Flow:**
```
Channel (Telegram/WhatsApp/Web) 
  → ChannelRouter 
  → runAgent() (LLM orchestrator) 
  → callClaude() (tool-use loop)
  → Tool execution
  → Repeat until completion
```

**Core Components:**
- `src/agent.ts` - Agentic loop with tool execution
- `src/llm/orchestrator.ts` - LLM provider management & history
- `src/tools/` - Modular tool registry
- `src/memory/` - Hybrid storage (SQLite + Vector + Graph)
- `src/channels/` - Multi-platform adapters
- `src/plugins/` - Runtime extension system

For detailed architecture, see [docs/architecture/ARCHITECTURE_OVERVIEW.md](docs/architecture/ARCHITECTURE_OVERVIEW.md).

---

## 🔌 Extensibility

### Plugins (`src/plugins/`)
Runtime system for extending providers, channels, tools, and memory— no restart required.

### Skills (`skills/`)
Prompt-based behavior guidance documents (not runtime modules).

### MCP Bridge
Integrate external Model Context Protocol tool servers.

Reference: [src/plugins/README.md](src/plugins/README.md)

## � Deployment

### Docker (Recommended)
```bash
docker-compose up -d
```

### Manual VPS / Self-Hosted
```bash
# 1. Install Node.js 20+

# 2. Clone repository
git clone https://github.com/noorulahamed/gravityclaw.git
cd gravityclaw

# 3. Install dependencies
npm install

# 4. Configure environment
cp .env.example .env
# Edit .env with your API keys

# 5. Start in background (using PM2, screen, or systemd)
npm start
```

### Air-Gapped Mode
For offline operation:
```bash
# 1. Install Ollama
# 2. Pull a model: ollama pull mistral (or your preferred model)
# 3. Set in .env: LLM_PROVIDER=ollama
npm start
```

See [docs/features/airgap/AIRGAP.md](docs/features/airgap/AIRGAP.md) for detailed air-gap setup.

---

## 📜 Roadmap

- [x] **Level 1 — Foundation** (Telegram, Tool Loop)
- [x] **Level 2 — Memory** (SQLite, RAG, Knowledge Graph)
- [x] **Level 3 — Automation** (Browser, Shell, Scheduler)
- [x] **Level 4 — Connectivity** (MCP, Webhooks, Plugins)
- [x] **Level 5 — Intelligence** (Swarms, Mesh, Recommendations)
- [x] **Level 6 — Experience** (Voice, Live Canvas, Airgap)

## 🤝 Contributing

We welcome contributions! Whether it's bug fixes, new features, documentation, or ideas:

1. Read our [Contributing Guide](CONTRIBUTING.md)
2. Check out [open issues](https://github.com/noorulahamed/gravityclaw/issues)
3. Follow our [Code of Conduct](CODE_OF_CONDUCT.md)
4. Submit your pull request!

### Development Setup

```bash
git clone https://github.com/noorulahamed/gravityclaw.git
cd gravityclaw
npm install
npm run dev
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines on code standards, testing, and the PR process.

## 🔒 Security

Security is a top priority. Gravity Claw includes:

- **Air-gapped mode** for complete offline operation
- **Encrypted secrets** with AES-256-GCM
- **User allowlisting** to restrict access
- **Path allowlisting** for file operations

Found a security vulnerability? Please report it privately:

- See our [Security Policy](SECURITY.md) for reporting guidelines
- Do not open public issues for security concerns

For more details, see [SECURITY.md](SECURITY.md).

## 📚 Documentation

### 🚀 Start Here
| Document | Purpose |
|----------|---------|
| **[📚 Documentation Index](docs/INDEX.md)** | **Complete documentation hub & navigation** |
| [🛠️ Tools Reference](docs/TOOLS_REFERENCE.md) | Catalog of all 80+ tools with examples |
| [📖 CLI Guide](docs/CLI.md) | Command-line interface reference |
| [🏗️ Architecture](ARCHITECTURE_OVERVIEW.md) | Complete system design & data flow |

### 🤖 Core Features
| Document | Purpose |
|----------|---------|
| [Multi-Agent Systems](docs/MULTI_AGENT_SYSTEMS.md) | Swarms & Mesh workflows for complex tasks |
| [Skills Guide](docs/SKILLS_GUIDE.md) | Create prompt-based knowledge assets with code |
| [Proactive Features](docs/PROACTIVE_FEATURES.md) | Heartbeat check-ins, daily recommendations, evening recaps |
| [Live Canvas (A2UI)](docs/CANVAS.md) | Push rich HTML/JS widgets to users |
| [Model Switching](docs/MODEL_SWITCHING.md) | Dynamic provider/model selection |

### 🔒 Security & Operations
| Document | Purpose |
|----------|---------|
| [Security Policy](SECURITY.md) | Security features & vulnerability reporting |
| [Air-Gapped Mode](docs/AIRGAP.md) | Complete offline operation with local models |
| [Encrypted Secrets](docs/ENCRYPTED_SECRETS.md) | AES-256-GCM secret management |
| [Backup & Restore](docs/BACKUP_RESTORE_SYSTEM.md) | Automated backup system |
| [Observability](docs/OBSERVABILITY.md) | Logging, metrics, tracing, monitoring |
| [Rate Limiting](docs/RATE_LIMITING.md) | API rate limiting configuration |
| [Performance Optimization](docs/PERFORMANCE.md) | Speed & efficiency tuning |

### 🧩 Development & Integration
| Document | Purpose |
|----------|---------|
| [API Reference](docs/API.md) | REST & WebSocket API documentation |
| [Plugin System](src/plugins/README.md) | Create runtime extensions |
| [Deployment Guide](docs/DEPLOYMENT.md) | Production deployment (VPS, Docker) |
| [Contributing Guide](CONTRIBUTING.md) | How to contribute to the project |

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built with ❤️ by the Gravity Claw community**
#   G r a v i t y C l a w  
 