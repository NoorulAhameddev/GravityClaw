# Gravity Claw 🦾

Gravity Claw is a high-performance, secure, and pro-active personal AI agent ecosystem. Built from scratch in TypeScript, it transforms a simple LLM into a "Personal OS" capable of automation, multi-agent orchestration, and rich interactive experiences.

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
```

## 🏗️ Core Architecture

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
| **Air-gapped Mode** | Full local operation via Ollama; blocks all external fetch calls. |
| **Encrypted Secrets** | AES-256-GCM management for API keys, decoupled from environment. |
| **Whitelist Security** | Strict user ID filtering for all communication channels. |
| **Path Allowlisting** | File operations restricted to specific safe directories. |
| **Admin Controls** | Granular tool permissions for group chats. |

## 🛠️ Advanced Features

- **Voice & Speech**: Whisper transcription and high-fidelity TTS (OpenAI/ElevenLabs).
- **Automation**: Browser automation (Playwright), Shell execution, and Scheduled tasks.
- **Extensibility**: **MCP Bridge** for external tool servers and a dynamic **Plugin System**.
- **Analytics**: Real-time token usage and cost tracking with daily recap reports.

## 📦 Deployment

### Docker (Recommended)
```bash
docker-compose up -d
```

### Manual VPS
1. Clone to your server.
2. Install Node.js 20+.
3. Configure `.env`.
4. Run `npm install && npm start`.

## 📜 Roadmap

- [x] **Level 1 — Foundation** (Telegram, Tool Loop)
- [x] **Level 2 — Memory** (SQLite, RAG, Knowledge Graph)
- [x] **Level 3 — Automation** (Browser, Shell, Scheduler)
- [x] **Level 4 — Connectivity** (MCP, Webhooks, Plugins)
- [x] **Level 5 — Intelligence** (Swarms, Mesh, Recommendations)
- [x] **Level 6 — Experience** (Voice, Live Canvas, Airgap)
