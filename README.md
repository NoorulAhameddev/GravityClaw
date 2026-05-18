# Gravity Claw 🦾

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node.js](https://img.shields.io/badge/Node.js-v20+-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Status](https://img.shields.io/badge/Status-Early%20Development-orange)

A high-performance, secure, and proactive personal AI agent ecosystem. Transform any LLM into a "Personal OS" capable of intelligent automation, multi-agent orchestration, and seamless multi-platform integration.

**[Quick Start](#-quick-start) • [Features](#-features) • [Architecture](#-architecture) • [Documentation](#-documentation) • [Deployment](#-deployment) • [Contributing](#-contributing) • [Security](#-security)**

---

## ⚠️ Project Status

**Early Development** — Gravity Claw is actively under development. Core features are functional, but APIs and configuration may change. Not recommended for production use yet.

---

## ✨ Features

- **🤖 Intelligent Agent Loop** — Advanced tool-use orchestration with confirmation gates and safety limits
- **📱 Multi-Channel Support** — Telegram, WhatsApp, WebChat with unified messaging interface
- **🧠 Hybrid Memory System** — SQLite + Vector Database + Knowledge Graph for intelligent context
- **👥 Multi-Agent Orchestration** — Agent Swarms (role-based) and Mesh Workflows (DAG-based task decomposition)
- **🔮 Proactive Engine** — Heartbeat check-ins, daily recommendations, and automated insights
- **🎨 Live Canvas (A2UI)** — Push rich HTML/JS widgets to users via WebSockets
- **🔌 Plugin System** — Runtime extensibility without restarts
- **🛡️ Enterprise Security** — Air-gap mode, AES-256-GCM encryption, user/path allowlisting
- **🌐 LLM Flexibility** — OpenAI, Claude, Google AI, Groq, Ollama (local), and more
- **🧩 80+ Built-in Tools** — Browser automation, shell commands, file operations, and integrations

---

## 📋 Requirements

### Required
- **Node.js** v20 or higher
- **npm** v10 or higher
- **LLM API Key** (at least one):
  - OpenAI API key
  - Anthropic (Claude) API key
  - Google AI API key
  - Groq API key
  - OpenRouter API key
  - OR Ollama (for local/air-gapped mode)

### Optional
- **Telegram Bot Token** — For Telegram integration
- **WhatsApp Credentials** — For WhatsApp integration
- **Supabase** — For cloud memory sync
- **ElevenLabs API Key** — For voice synthesis

---

## 🚀 Quick Start

### 1. Clone & Install
```bash
git clone https://github.com/NoorulAhameddev/GravityClaw.git
cd GravityClaw
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your API keys and preferences
```

### 3. Run in Development
```bash
npm run dev
```
Access the dashboard at **http://localhost:3000**

### 4. Try the CLI
```bash
npm run cli -- chat          # Interactive chat REPL
npm run cli -- doctor        # Health checks & diagnostics
npm run cli -- config        # View current configuration
npm run cli -- tools         # List all available tools
```

### 5. Production Deployment
```bash
npm start
```

---

## 🖥️ Dashboard Overview

Access the web dashboard at **http://localhost:3000** for:

| Section | Purpose |
|---------|---------|
| **Overview** | System status, statistics, and quick actions |
| **Chat** | WebChat interface for direct messaging |
| **Admin** | Plugin management, settings, and configuration |
| **Analytics** | Usage metrics and performance insights |
| **Memory** | View and manage knowledge graph and facts |
| **Tools** | Browse available tools and schemas |
| **Workflows & Swarms** | Visualize multi-agent task orchestration |
| **Sessions** | Manage conversation history |
| **Heartbeats** | Configure proactive check-ins |
| **Scheduler** | Set up recurring tasks and automations |
| **Webhooks** | Configure incoming webhook endpoints |

---

## 🛠️ CLI Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start with hot reload (development) |
| `npm start` | Start in production mode |
| `npm run cli -- chat` | Interactive chat REPL |
| `npm run cli -- doctor` | Health checks & diagnostics |
| `npm run cli -- config` | View current configuration |
| `npm run cli -- tools` | List all available tools |
| `npm run cli -- sessions` | Manage conversation sessions |
| `npm run typecheck` | TypeScript type checking |
| `npm run test` | Run tests in watch mode |
| `npm run test:run` | Run tests once |
| `npm run test:coverage` | Generate coverage report |

For detailed CLI documentation, see [docs/guides/CLI.md](docs/guides/CLI.md)

---

## 🏗️ Architecture

### Core Design

Gravity Claw is built as a modular **Personal OS** with these key layers:

```
Channel Layer (Telegram/WhatsApp/Web)
    ↓
Channel Router
    ↓
Agent Loop (LLM Orchestrator)
    ↓
Tool Execution Engine
    ↓
Memory System (Hybrid Storage)
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **Agent Loop** | `src/agent.ts` | Agentic execution with tool calling |
| **LLM Orchestrator** | `src/llm/orchestrator.ts` | Multi-provider LLM management |
| **Tool Registry** | `src/tools/` | Modular tool system (80+ tools) |
| **Memory Engine** | `src/memory/` | SQLite + Vector + Knowledge Graph |
| **Channels** | `src/channels/` | Multi-platform adapters |
| **Plugin System** | `src/plugins/` | Runtime extensions |

### Key Features

- **Channels** — Multi-platform support with unified messaging
- **Agent Loop** — Tool-use with confirmation gates and safety limits
- **Memory** — Hybrid storage for context and learning
- **Orchestration** — Swarms and Mesh workflows for complex tasks
- **Proactive Engine** — Heartbeat updates and recommendations
- **Live Canvas** — Real-time rich UI pushing via WebSockets

For detailed architecture, see [docs/architecture/ARCHITECTURE_OVERVIEW.md](docs/architecture/ARCHITECTURE_OVERVIEW.md)

---

## 🛡️ Security & Privacy

Gravity Claw implements enterprise-grade security:

| Feature | Description |
|---------|-------------|
| **Air-Gapped Mode** | Full local operation via Ollama; zero external calls |
| **Encrypted Secrets** | AES-256-GCM for API keys, decoupled from environment |
| **User Allowlisting** | Strict user ID filtering across all channels |
| **Path Allowlisting** | File operations restricted to safe directories |
| **Admin Controls** | Granular tool permissions for group chats |
| **No External Calls** | Complete network isolation in air-gap mode |
| **Audit Logging** | Complete activity tracking and monitoring |

**Found a security vulnerability?** Please report privately:
- See [SECURITY.md](SECURITY.md) for reporting guidelines
- Do NOT open public issues for security concerns

---

## 📦 Deployment

### Docker (Recommended)
```bash
docker-compose up -d
```

### Manual VPS / Self-Hosted
```bash
# 1. Install Node.js 20+
sudo apt update && sudo apt install nodejs npm

# 2. Clone repository
git clone https://github.com/NoorulAhameddev/GravityClaw.git
cd GravityClaw

# 3. Install dependencies
npm install

# 4. Configure environment
cp .env.example .env
# Edit .env with your API keys

# 5. Start in background
npm start

# Or use PM2 for process management
npm install -g pm2
pm2 start npm --name "gravity-claw" -- start
pm2 save
pm2 startup
```

### Air-Gapped Mode (Offline)
```bash
# 1. Install Ollama
# 2. Pull a model
ollama pull mistral

# 3. Configure .env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434

# 4. Start
npm start
```

For detailed deployment guide, see [docs/guides/DEPLOYMENT.md](docs/guides/DEPLOYMENT.md)

---

## 📚 Documentation

### Quick Links
| Document | Purpose |
|----------|---------|
| **[📚 Documentation Index](docs/INDEX.md)** | Complete documentation hub |
| **[🛠️ Tools Reference](docs/TOOLS_REFERENCE.md)** | Catalog of 80+ tools with examples |
| **[🏗️ Architecture](docs/architecture/ARCHITECTURE_OVERVIEW.md)** | System design & data flow |

### Core Features
| Document | Purpose |
|----------|---------|
| [Multi-Agent Systems](docs/MULTI_AGENT_SYSTEMS.md) | Swarms & Mesh workflows |
| [Skills Guide](docs/SKILLS_GUIDE.md) | Create prompt-based knowledge assets |
| [Proactive Features](docs/PROACTIVE_FEATURES.md) | Heartbeats & recommendations |
| [Live Canvas (A2UI)](docs/features/canvas/CANVAS.md) | Rich UI widget system |
| [Model Switching](docs/guides/MODEL_SWITCHING.md) | Dynamic LLM provider selection |
| [📖 CLI Guide](docs/guides/CLI.md) | Command-line interface reference |

### Security & Operations
| Document | Purpose |
|----------|---------|
| [Security Policy](SECURITY.md) | Security features & vulnerability reporting |
| [Air-Gapped Mode](docs/features/airgap/AIRGAP.md) | Offline operation setup |
| [Encrypted Secrets](docs/ENCRYPTED_SECRETS.md) | Secret management system |
| [Backup & Restore](docs/features/backup/BACKUP_RESTORE_SYSTEM.md) | Backup automation |
| [Observability](docs/features/observability/OBSERVABILITY.md) | Logging, metrics, tracing |
| [Rate Limiting](docs/features/rate-limiting/RATE_LIMITING.md) | API rate limits |
| [Performance Optimization](docs/features/performance/PERFORMANCE.md) | Tuning & efficiency |

### Development
| Document | Purpose |
|----------|---------|
| [API Reference](docs/guides/API.md) | REST & WebSocket APIs |
| [Plugin System](src/plugins/README.md) | Create runtime extensions |
| [Deployment Guide](docs/guides/DEPLOYMENT.md) | Production deployment |
| [Contributing Guide](CONTRIBUTING.md) | Contribution guidelines |

---

## 🔌 Extensibility

### Plugins
Runtime system for extending providers, channels, tools, and memory without restart.
See [src/plugins/README.md](src/plugins/README.md) for details.

### Skills
Prompt-based behavior guidance documents for customizing agent responses.
See [docs/SKILLS_GUIDE.md](docs/SKILLS_GUIDE.md) for details.

### Model Context Protocol (MCP)
Integrate external tool servers via the MCP bridge.

---

## 📜 Roadmap

- [x] **Level 1 — Foundation** — Telegram, Tool Loop, Core Architecture
- [x] **Level 2 — Memory** — SQLite, RAG, Knowledge Graph
- [x] **Level 3 — Automation** — Browser, Shell, Scheduler
- [x] **Level 4 — Connectivity** — MCP, Webhooks, Plugins
- [x] **Level 5 — Intelligence** — Swarms, Mesh, Recommendations
- [x] **Level 6 — Experience** — Voice, Live Canvas, Air-gap Mode

---

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. **Read** [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines and standards
2. **Check** [open issues](https://github.com/NoorulAhameddev/GravityClaw/issues)
3. **Follow** [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
4. **Submit** your pull request

### Development Setup
```bash
git clone https://github.com/NoorulAhameddev/GravityClaw.git
cd GravityClaw
npm install
npm run dev
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for code standards, testing requirements, and PR process.

---

## 📄 License

This project is licensed under the **MIT License** — see [LICENSE](LICENSE) for details.

---

## 📞 Support & Community

- **Issues** — [GitHub Issues](https://github.com/NoorulAhameddev/GravityClaw/issues)
- **Discussions** — [GitHub Discussions](https://github.com/NoorulAhameddev/GravityClaw/discussions)
- **Security** — [SECURITY.md](SECURITY.md)

---

**Built with ❤️ by the Gravity Claw community**

Made with TypeScript • Powered by AI • Built for Automation
