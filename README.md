# Gravity Claw 🦾

Gravity Claw is a high-performance, secure, and pro-active personal AI agent ecosystem. Built from scratch in TypeScript, it transforms a simple LLM into a "Personal OS" capable of automation, multi-agent orchestration, and rich interactive experiences.

## ⚠️ Project Status

**Early Development** - Gravity Claw is under active development. Core features are functional, but APIs and configuration may change. Not recommended for production use yet. Contributions and feedback are welcome!

## 📋 Requirements

Before getting started, ensure you have:

- **Node.js**: Version 20 or higher
- **npm**: Version 10 or higher
- **API Keys**: At least one of the following:
  - OpenAI API key
  - Anthropic (Claude) API key
  - Google AI API key
  - Groq API key
  - OpenRouter API key
  - **OR** Ollama locally installed for air-gapped mode (no API keys needed)
- **Optional**: 
  - Telegram Bot Token (for Telegram channel)
  - Supabase credentials (for cloud memory)
  - ElevenLabs API key (for high-quality TTS)

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

## 🖥️ Command Line Interface

Gravity Claw includes a production-grade CLI for managing your AI agent:

### Available Commands

| Command | Description |
|---------|-------------|
| `gravityclaw start` | Start all Gravity Claw services (default) |
| `gravityclaw chat` | Interactive REPL chat mode |
| `gravityclaw doctor` | Run health checks and diagnostics |
| `gravityclaw config` | View current configuration |
| `gravityclaw tools` | List all available tools |
| `gravityclaw sessions` | Manage conversation sessions |
| `gravityclaw version` | Show version information |
| `gravityclaw help` | Display help |

### Interactive Chat Mode

Launch a terminal REPL to chat directly with your agent:

```bash
npm run cli -- chat

# Or with options:
npm run cli -- chat --session my-session --verbose
```

Commands within chat mode:
- Type your message and press Enter
- `clear` - Clear session history
- `exit` or `quit` - Exit chat mode

### Session Management

Manage conversation history:

```bash
# List all sessions
npm run cli -- sessions list

# Clear a specific session
npm run cli -- sessions clear <session-id>

# Export session to JSON
npm run cli -- sessions export <session-id> > backup.json
```

### System Diagnostics

Run comprehensive health checks:

```bash
npm run cli -- doctor
```

This checks:
- ✅ Environment configuration
- ✅ Database connectivity  
- ✅ Tools registry
- ✅ LLM provider setup
- ✅ File paths
- ✅ Node.js version

### View Configuration

Display your current settings:

```bash
npm run cli -- config
```

Shows:
- Core settings (provider, model, log level)
- Channel status (Telegram, WhatsApp)
- Feature flags

### List Tools

See all registered tools:

```bash
npm run cli -- tools
```

Displays tools organized by category with descriptions.

### 📚 Full CLI Documentation

See [docs/CLI.md](docs/CLI.md) for complete CLI documentation including:
- Detailed command reference
- Usage examples
- Troubleshooting guide
- Advanced usage patterns

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
- **Extensibility**: **MCP Bridge** for external tool servers, `skills/` prompt assets, and the runtime plugin system in `src/plugins/`.
- **Analytics**: Real-time token usage and cost tracking with daily recap reports.

## 🔌 Extensibility Model

- **`src/plugins/`**: Runtime plugin system (registry + traits for providers, channels, tools, memory).
- **`skills/`**: Skill documents that guide behavior/prompts; these are not runtime plugin modules.
- Plugin authoring reference: [src/plugins/README.md](src/plugins/README.md)

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

## 📞 Support & Community

- 💬 **Issues**: [GitHub Issues](https://github.com/noorulahamed/gravityclaw/issues) - Bug reports and feature requests
- 💡 **Discussions**: [GitHub Discussions](https://github.com/noorulahamed/gravityclaw/discussions) - Questions and community chat
- 📖 **Documentation**: 
  - [Air-gapped Mode](docs/AIRGAP.md)
  - [Encrypted Secrets](docs/ENCRYPTED_SECRETS.md)
  - [Canvas (A2UI)](docs/CANVAS.md)
  - [Model Switching](docs/MODEL_SWITCHING.md)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built with ❤️ by the Gravity Claw community**
