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

For detailed architecture, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (if available) or review the codebase.

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

See [docs/AIRGAP.md](docs/AIRGAP.md) for detailed air-gap setup.

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

## � Documentation

| Document | Purpose |
|----------|---------|
| [docs/CLI.md](docs/CLI.md) | Command-line interface reference |
| [docs/AIRGAP.md](docs/AIRGAP.md) | Air-gapped mode setup & usage |
| [docs/ENCRYPTED_SECRETS.md](docs/ENCRYPTED_SECRETS.md) | Secret management & encryption |
| [docs/CANVAS.md](docs/CANVAS.md) | Live Canvas (A2UI) widget system |
| [docs/MODEL_SWITCHING.md](docs/MODEL_SWITCHING.md) | Dynamic model provider switching |
| [src/plugins/README.md](src/plugins/README.md) | Plugin authoring guide |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution guidelines |
| [SECURITY.md](SECURITY.md) | Security policy & vulnerability reporting |

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built with ❤️ by the Gravity Claw community**
