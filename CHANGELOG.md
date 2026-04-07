# Gravity Claw Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.0] - 2026-03-14

### 🚀 Added

#### New Communication Channels
- **Discord Channel** (`src/channels/discord.ts`) - Discord bot with slash commands (/chat, /reset, /status), embedded responses, and message handling
- **Slack Channel** (`src/channels/slack.ts`) - Slack app with Block Kit messages, event handling (app_mention, DMs), and slash commands
- **Signal Channel** (`src/channels/signal.ts`) - Signal messenger integration using signal-cli for private and group messaging
- **Email Channel** (`src/channels/email.ts`) - Email integration via IMAP (receive) and SMTP (send) with sender filtering

#### New Productivity Integrations
- **Google Calendar** (`src/tools/calendar/google-calendar.ts`) - Four tools: list_events, create_event, update_event, delete_event
- **Notion Integration** (`src/tools/productivity/notion.ts`) - Four tools: create_page, read_page, append_block, query_database

#### New LLM Providers
- **Cohere** (`src/llm/cohere.ts`) - Command R Plus model support
- **Mistral** (`src/llm/mistral.ts`) - Mistral Large model support

#### New Tools
- **Code Sandbox** (`src/tools/sandbox.ts`) - Secure code execution for JavaScript, Python, and Bash with timeout and memory limits
- **Human-in-the-Loop Approval** (`src/middleware/approval.ts`) - Approval gates for dangerous operations
- **PostgreSQL Support** (`src/db/postgres.ts`) - Alternative database backend with connection pooling

#### MCP Enhancements
- **MCP Server Bundles** (`src/mcp/servers/`) - Pre-configured setups for Filesystem, GitHub, and PostgreSQL MCP servers

---

### 🔧 Updated

#### LLM Provider Upgrades
- **Anthropic** - Claude 3.5 Sonnet → Claude Sonnet 4 (20250514)
- **Google/Gemini** - Gemini 1.5 Flash → Gemini 2.0 Flash Experimental
- **OpenAI** - GPT-4o-mini → GPT-4o (default)
- **Ollama** - Llama 3.2 → Llama 3.3:70b with function calling support

#### Security Updates
- **Notion Token** - Rotated hardcoded token, now uses environment variable
- **SECURITY_AUDIT_ENABLED** - Fixed bug in startup validation

#### Dependency Updates
- `@anthropic-ai/sdk` - ^0.78.0 → ^0.39.0
- `@whiskeysockets/baileys` - ^7.0.0-rc.9 → ^7.0.0 (stable)
- `openai` - ^4.104.0 → ^4.130.0
- Added: `fuse.js` (fuzzy search)
- Added: `discord.js` (Discord)
- Added: `@slack/web-api`, `@slack/events-api` (Slack)
- Added: `googleapis`, `@googleapis/calendar` (Calendar)
- Added: `@notionhq/client` (Notion)
- Added: `pg` (PostgreSQL)
- Added: `imap`, `nodemailer` (Email)
- Added: `cohere` (Cohere)
- Added: `@mistralai/mistralai` (Mistral)

#### Memory System Upgrades
- **Markdown Memory** - Added fuzzy search using Fuse.js
- **Vector Memory** - Added BM25 keyword fallback for improved recall

#### Channel Upgrades
- **Telegram** - Improved message formatting: HTML parse_mode first, then MarkdownV2, then plain text

#### Agent System Upgrades
- **Mesh** - Added parallel execution for independent tasks (configurable max 5 parallel)
- **Plugin System** - Added workflow trait and hot-reload support

---

### 🛡️ Security

- Added approval middleware for dangerous tool execution
- Code sandbox with strict isolation (no network, memory limits, timeout)
- Sensitive parameter sanitization in approval requests

---

### 📋 Configuration

New environment variables:

#### Channels
```
# Discord
DISCORD_BOT_TOKEN=your_token
DISCORD_GUILD_ID=your_guild_id

# Slack  
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=your_secret

# Signal
SIGNAL_PHONE_NUMBER=+1234567890

# Email
EMAIL_SMTP_HOST=smtp.example.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=user@example.com
EMAIL_SMTP_PASS=password
EMAIL_IMAP_HOST=imap.example.com
EMAIL_FROM_ADDRESS=agent@example.com
```

#### Productivity
```
# Google Calendar
GOOGLE_CALENDAR_API_KEY=key
GOOGLE_CREDENTIALS_PATH=/path/to/credentials.json

# Notion
NOTION_API_KEY=secret_...
NOTION_DATABASE_ID=...
```

#### LLM Providers
```
COHERE_API_KEY=...
MISTRAL_API_KEY=...
```

#### Database
```
DATABASE_URL=postgresql://user:pass@localhost:5432/gravyclaw
```

#### Approval Middleware
```
APPROVAL_ENABLED=true
APPROVAL_TIMEOUT_MINUTES=5
APPROVAL_REQUIRED_TOOLS=run_shell,file_delete,http_request,execute_code
```

---

## [0.1.0] - 2026-03-01

### ⚠️ Initial Release (Early Development)

First release of Gravity Claw - a high-performance, secure, pro-active personal AI agent ecosystem.

#### Core Features
- Multi-channel support (Telegram, WhatsApp, WebChat)
- Agentic loop with tool execution
- Hybrid memory (SQLite, Vector, Knowledge Graph, Markdown)
- Multi-agent orchestration (Swarms, Mesh workflows)
- Proactive features (Heartbeat, Recap, Recommendations)
- Live Canvas (A2UI) via WebSockets

#### LLM Providers
- OpenAI (GPT-4, GPT-4o, o1)
- Anthropic (Claude 3.5 Sonnet)
- Google (Gemini 1.5)
- Groq (Llama 3.3)
- DeepSeek
- Ollama (local)
- OpenRouter (including free models)

#### Security Features
- Air-gapped mode with Ollama
- AES-256-GCM encrypted secrets
- User allowlisting
- Path allowlisting
- Rate limiting

---

*This changelog will be updated with each release. For detailed documentation, see the docs/ directory.*