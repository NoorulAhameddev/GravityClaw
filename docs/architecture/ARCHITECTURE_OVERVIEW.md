# Gravity Claw — Complete Architecture Overview

> **Last Updated**: March 5, 2026  
> **Status**: Early Development — Core systems functional, APIs may change

---

## 📁 Structure & Setup

### Root Folder Structure

```
gravyclaw/
├── backups/            # Backup storage
├── baileys_auth_info/  # WhatsApp auth session
├── bin/                # CLI executable (gravityclaw.mjs)
├── config/             # TypeScript & Vitest configs, MCP server config
├── docs/               # Extensive documentation
├── logs/               # Application logs
├── memory-files/       # Session-specific memory storage
├── public/             # Web UI (canvas, chat, dashboard)
├── scripts/            # Utility scripts (load tests, secret manager, benchmarks)
├── skills/             # Prompt-based knowledge assets (not runtime code)
└── src/                # Main TypeScript source
    ├── agent.ts        # Core agentic loop
    ├── agents/         # Multi-agent orchestration (swarm, mesh)
    ├── airgap/         # Air-gap enforcement
    ├── backup/         # Backup/restore system
    ├── canvas/         # Live Canvas (A2UI)
    ├── channels/       # Platform connectors (Telegram, WhatsApp, WebChat)
    ├── cli/            # CLI commands
    ├── config.ts       # Zod-validated environment config
    ├── db.ts           # SQLite database initialization
    ├── gateway/        # API gateway
    ├── groups/         # Group chat management
    ├── heartbeat/      # Proactive heartbeat updates
    ├── llm/            # LLM provider implementations
    ├── logger.ts       # Logging utilities
    ├── mcp/            # Model Context Protocol bridge
    ├── memory/         # Hybrid memory engine
    ├── middleware/     # Rate limiting, auth
    ├── observability/  # Metrics, tracing, correlation
    ├── performance/    # Performance optimizations
    ├── plugins/        # Runtime plugin system
    ├── recap/          # Daily recap generation
    ├── recommendations/ # Proactive recommendations
    ├── scheduler/      # Cron-based task scheduling
    ├── secrets.ts      # Encrypted secrets (AES-256-GCM)
    ├── security/       # Security validation
    ├── server.ts       # Express + WebSocket server
    ├── session.ts      # Per-session settings
    ├── thinking.ts     # Thinking level injection
    ├── tools/          # 80+ tool implementations
    ├── types/          # TypeScript type definitions
    ├── usage.ts        # Usage tracking
    ├── utils/          # Utility functions
    ├── voice/          # Voice/TTS features
    ├── web/            # Web endpoints
    └── webhooks/       # Webhook handlers
```

### Entry Point

**`src/index.ts`** — Main entry point that:
- Validates config via Zod (exits if misconfigured)
- Enforces air-gap mode if enabled
- Registers all 80+ tools
- Initializes channels (Telegram, WhatsApp, WebChat)
- Starts backup scheduler, MCP client, plugin system
- Launches ChannelRouter
- Registers task execution handlers

### Project Bootstrap

**Technology Stack:**
- **Runtime**: Node.js 20+ with `tsx` for TypeScript execution
- **Language**: TypeScript 5.x (ESM modules)
- **Database**: SQLite 3 (better-sqlite3, WAL mode)
- **Package Manager**: npm (≥10.0.0)

**Commands:**
```bash
npm run dev              # Development (tsx watch)
npm start                # Production
npm run cli              # CLI mode
npm run typecheck        # Type checking
npm run test             # Run tests (Vitest)
npm run test:coverage    # Coverage report
```

### Package Manager

**npm** — Required version ≥10.0.0

### Required Environment Variables

**Absolute minimum to run locally:**

```bash
# Channel Authentication
TELEGRAM_BOT_TOKEN=<from @BotFather>
TELEGRAM_ALLOWED_USER_ID=<numeric ID from @userinfobot>

# LLM Provider (pick one)
OPENROUTER_API_KEY=<key>
# OR
OPENAI_API_KEY=<key>
# OR
ANTHROPIC_API_KEY=<key>
# OR run Ollama locally for air-gapped mode

# Provider Configuration
LLM_PROVIDER=openrouter  # or anthropic, openai, google, groq, deepseek, ollama, failover
LLM_MODEL=openrouter/free

# System Settings
AGENT_MAX_ITERATIONS=10
LOG_LEVEL=info
PORT=3000

# Security (recommended)
MASTER_KEY=<64-char hex from: npm run secret:generate>
```

**Full configuration**: See [`.env.example`](.env.example)

### Monorepo Structure

**Single package** — Not a monorepo. All TypeScript code lives in `src/`.

### Configuration Files

- [`tsconfig.json`](tsconfig.json) — Extends `config/tsconfig.json`
- [`.env.example`](.env.example) — Environment template
- [`package.json`](package.json) — Dependencies and scripts
- [`config/vitest.config.ts`](config/vitest.config.ts) — Test configuration
- [`config/mcp-servers.json`](config/mcp-servers.json) — MCP server registry
- [`docker-compose.yml`](docker-compose.yml) — Docker orchestration
- [`Dockerfile`](Dockerfile) — Container image

**Config validation**: Zod schema in [`src/config.ts`](src/config.ts) — **app exits at startup if misconfigured**.

---

## 🤖 Agent System

### How is an "Agent" Defined?

**Not a formal class** — an "agent" is conceptually composed of:

- **Session ID**: String identifier (e.g., `telegram:123456`)
- **Conversation History**: Stored in SQLite `memory` table
- **LLM Provider**: Dynamically selected based on config/session settings
- **Available Tools**: From global registry
- **Per-Session Settings**: Model, provider, thinking level, voice mode (JSON in SQLite)

The [`runAgent()`](src/agent.ts) function orchestrates the agentic loop for any session.

### Agent Properties

Per-session settings tracked in SQLite `memory.settings` JSON column:

```typescript
{
  model?: string;             // e.g., "gpt-4o", "claude-3.5-sonnet"
  provider?: string;          // "openai", "anthropic", "openrouter"
  thinkingLevel?: "off" | "low" | "medium" | "high" | "max";
  voiceEnabled?: boolean;
  recapHourLocal?: number;    // 0-23
  heartbeatIntervalMinutes?: number;
}
```

Retrieved via [`getSessionSettings(sessionId)`](src/session.ts).

### Agent Creation and Registration

Agents are **ephemeral** — not pre-registered. When a message arrives:

1. [`ChannelRouter.handleMessage()`](src/channels/router.ts) derives `sessionId` from `channelId:chatId`
2. [`runAgent()`](src/agent.ts) is called with that session ID
3. History is retrieved from SQLite
4. LLM is invoked with tools
5. Results are saved back to SQLite

For **multi-agent orchestration**, see swarm/mesh systems below.

### Current Agent Roles

**Built-in specialized roles** (used in swarms):

| Role | Description |
|------|-------------|
| `researcher` | Deep analysis, pattern finding, questioning assumptions |
| `coder` | Programming implementations, clean code, best practices |
| `reviewer` | Code review, QA, identifying issues, constructive feedback |
| `summarizer` | Distillation, synthesis, clear communication |

Defined in [`src/agents/swarm.ts`](src/agents/swarm.ts) as `ROLE_PROMPTS` object.

### Agent Communication

Three mechanisms for inter-agent communication:

#### a) Agent Swarms ([`src/agents/swarm.ts`](src/agents/swarm.ts))

- Parent agent spawns child agents with specialized roles
- Each child has its own session ID (`parentId-role-randomhex`)
- Results aggregated back to parent
- Tracked in `agent_swarms` table

#### b) Inter-Agent Messaging ([`src/agents/communication.ts`](src/agents/communication.ts))

- Sessions can enable `allow_messages` flag
- [`sendMessage(fromSessionId, toSessionId, content)`](src/agents/communication.ts)
- Messages stored in `messages` table
- Tool: `agent_send_message`

#### c) Mesh Workflows

See DAG section below.

### Base Agent Class/Interface

**No formal base class.** The "agent contract" is implicit:

- Sessions have history in SQLite
- [`runAgent(options)`](src/agent.ts) is the polymorphic handler
- LLM providers implement [`LLMProvider` interface](src/types/llm.ts):

```typescript
interface LLMProvider {
  name: string;
  chat(messages, toolDefinitions, options?): Promise<LLMResponse>;
  listModels?(): Promise<string[]>;
  countTokens?(messages): number;
}
```

### Agent Lifecycle

**Stateless per-invocation:**

1. **Init**: ChannelRouter receives message → derives sessionId
2. **Run**: [`runAgent()`](src/agent.ts) executes the tool-use loop
3. **Terminate**: Returns `AgentRunResult` → channel sends response

No persistent "running" agents — they're invoked on-demand per message.

**Exception**: **Scheduled agents** (heartbeat, recap) triggered by cron tasks in [`src/scheduler/`](src/scheduler/).

### Child Agent Spawning

**Yes, via two mechanisms:**

#### a) Tool-based spawning ([`spawn_agent` tool](src/tools/core/swarm.ts))

```typescript
// LLM calls:
spawn_agent({ role: "researcher", task: "Analyze X" })
```
Creates a new session, runs it, returns results.

#### b) Swarm API ([`AgentSwarm` class](src/agents/swarm.ts))

```typescript
const swarm = new AgentSwarm(parentSessionId, {
  numAgents: 3,
  roles: ["researcher", "coder", "reviewer"],
  maxConcurrency: 2
});
await swarm.run(goal);
```

---

## 🕸️ DAG Mesh Workflows

### DAG Workflow Definition

**LLM-generated JSON** via [`MeshWorkflow.decompose(goal)`](src/agents/mesh.ts):

```json
{
  "goalDescription": "Build a REST API",
  "tasks": [
    { "id": "1", "description": "Design schema", "dependsOn": [] },
    { "id": "2", "description": "Implement routes", "dependsOn": ["1"] },
    { "id": "3", "description": "Write tests", "dependsOn": ["2"] }
  ]
}
```

The LLM is prompted with topological ordering requirements and returns pure JSON.

### Execution Engine

**Custom in-memory scheduler** ([`src/agents/mesh.ts`](src/agents/mesh.ts)):

- Topological sort of tasks
- Validates DAG for cycles
- Executes tasks in dependency order
- Each task runs in **isolated session** (`mesh:task:taskId:uuid`)

**Not using BullMQ** or external queue — all in-process.

### DAG Node Definition

Each node is a **`WorkflowTask`**:

```typescript
interface WorkflowTask {
  id: string;
  description: string;
  dependsOn: string[];  // Array of task IDs
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
}
```

Execution of a task = calling [`runAgent()`](src/agent.ts) with the task description.

### Branching and Conditional Logic

**Implicit via dependencies** — no explicit conditionals yet.

The DAG is **static** once generated. If a task fails, downstream tasks are skipped (recorded as failed in `workflow_tasks` table).

**Future enhancement**: Conditional edges based on task results.

### Workflow State Tracking

**Persisted in SQLite** across two tables:

#### `workflows` table

```sql
CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  goal TEXT,
  tasks_json TEXT,          -- Full DAG as JSON
  status TEXT,              -- 'pending', 'running', 'completed', 'failed'
  progress REAL,            -- 0.0 to 1.0
  created_at TIMESTAMP,
  completed_at TIMESTAMP
);
```

#### `workflow_tasks` table

```sql
CREATE TABLE workflow_tasks (
  id TEXT PRIMARY KEY,
  workflow_id TEXT,
  task_id TEXT,
  description TEXT,
  depends_on TEXT,          -- JSON array of deps
  status TEXT,
  result TEXT,
  created_session_id TEXT   -- Session that ran this task
);
```

### Persistence Model

**Hybrid:**

- DAG structure + results → **SQLite** (persistent)
- Execution state (pending tasks, concurrency locks) → **in-memory** during workflow run

After execution completes, all state is in SQLite for audit/replay.

---

## 🧠 Memory Engine

### SQLite Schema

#### Core Tables

```sql
-- Conversation history
CREATE TABLE memory (
  id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  message_json TEXT NOT NULL,  -- OpenAI ChatCompletionMessageParam
  settings TEXT DEFAULT '{}'   -- Per-session config (JSON)
);

-- Facts (Markdown-based persistent memory)
CREATE TABLE facts (
  id INTEGER PRIMARY KEY,
  session_id TEXT,
  fact TEXT NOT NULL,
  tags TEXT,                   -- Comma-separated
  created_at DATETIME,
  updated_at DATETIME
);

-- Knowledge Graph: Entities
CREATE TABLE entities (
  id INTEGER PRIMARY KEY,
  session_id TEXT,
  name TEXT UNIQUE,
  type TEXT,
  properties TEXT,             -- JSON
  access_count INTEGER DEFAULT 0,
  last_accessed DATETIME,
  created_at DATETIME
);

-- Knowledge Graph: Relationships
CREATE TABLE relationships (
  id INTEGER PRIMARY KEY,
  session_id TEXT,
  from_id INTEGER REFERENCES entities(id),
  to_id INTEGER REFERENCES entities(id),
  relation_type TEXT,
  metadata TEXT                -- JSON
);

-- Scheduled tasks
CREATE TABLE scheduled_tasks (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  name TEXT,
  cron_expression TEXT,
  prompt TEXT,
  enabled INTEGER DEFAULT 1,
  last_run DATETIME,
  next_run DATETIME,
  run_count INTEGER DEFAULT 0
);

-- Agent swarms
CREATE TABLE agent_swarms (
  id TEXT PRIMARY KEY,
  parent_session TEXT,
  child_session TEXT,
  role TEXT,
  status TEXT,
  created_at TIMESTAMP
);

-- Mesh workflows
CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  goal TEXT,
  tasks_json TEXT,
  status TEXT,
  progress REAL,
  created_at TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE TABLE workflow_tasks (
  id TEXT PRIMARY KEY,
  workflow_id TEXT,
  task_id TEXT,
  description TEXT,
  depends_on TEXT,
  status TEXT,
  result TEXT,
  created_session_id TEXT
);

-- Inter-agent communication
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  allow_messages INTEGER DEFAULT 0,
  created_at DATETIME,
  updated_at DATETIME
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  from_session_id TEXT,
  to_session_id TEXT,
  content TEXT,
  created_at DATETIME
);
```

**Indexes**: On `session_id`, timestamps for fast queries.

### Vector Database

**Two options:**

#### a) Supabase (cloud, optional)

[`src/memory/supabase.ts`](src/memory/supabase.ts):
- Async sync of messages to Supabase pgvector
- Semantic search via `match_documents` RPC
- Non-blocking, enqueued writes

#### b) OpenAI embeddings (in-memory fallback)

- Uses `text-embedding-3-small` via OpenAI API
- No local vector index — embeddings computed on-demand
- Used by [`searchMemorySemanticTool`](src/tools/memory/index.ts)

**No LanceDB or Chroma** — custom lightweight implementation.

### Knowledge Graph Library

**Custom in SQLite** — [`src/memory/graph.ts`](src/memory/graph.ts):

- Adjacency list via `entities` + `relationships` tables
- Graph queries: BFS traversal, shortest path, connected components
- Mermaid diagram export

**Not using Neo4j** — fully SQLite-based.

### Memory Retrieval

**Hybrid approach:**

1. **Conversation history**: Direct SQLite query, ordered by timestamp
2. **Semantic search**: 
   - Query Supabase `match_documents(embedding, threshold)` 
   - OR compute embedding + cosine similarity in-memory
3. **Graph traversal**: 
   - [`queryGraph(sessionId, entityName, maxDepth)`](src/memory/graph.ts)
   - BFS from starting entity, returns subgraph
4. **Fact injection**: 
   - [`loadFactsForPrompt(sessionId)`](src/memory/markdown.ts)
   - Recent facts prepended to system prompt

### Memory Save Behavior

**After every conversation turn:**

- [`addUserMessage(sessionId, text)`](src/llm/orchestrator.ts) → SQLite INSERT
- [`addAssistantMessage(sessionId, content, toolCalls?)`](src/llm/orchestrator.ts) → SQLite INSERT
- [`addToolResult(sessionId, toolCallId, result)`](src/llm/orchestrator.ts) → SQLite INSERT

**Supabase sync** (if configured): Async queue, batched every 5 seconds.

No manual save required — fully automatic.

### Memory Scoping

**Per-session by default:**
- Each `session_id` has isolated history
- Cross-session queries possible via explicit tools (e.g., `agent_send_message`)

**Global memory** (shared across sessions):
- Facts can be tagged as global (roadmap item)

### Memory Summarization/Compression

**Yes** — [`src/memory/pruning.ts`](src/memory/pruning.ts):

- Detects when context window nearing limit (configurable threshold)
- Summarizes old messages (keeps system prompt + recent N messages + summary of middle)
- Uses LLM to generate summaries
- Tool: `memory_prune_context`

**Also**: "Memory Evolution" experiments in [`src/memory/evolution.ts`](src/memory/evolution.ts) (learning patterns, auto-tagging).

---

## 🔌 Platform Connectors

### Current State of Connectors

| Channel | Status | File | Notes |
|---------|--------|------|-------|
| **Telegram** | ✅ Fully working | [`src/channels/telegram.ts`](src/channels/telegram.ts) | Grammy bot, user allowlist, group support |
| **WhatsApp** | ✅ Working | [`src/channels/whatsapp.ts`](src/channels/whatsapp.ts) | Baileys library, QR auth, media support |
| **WebChat** | ✅ Working | [`src/channels/webchat.ts`](src/channels/webchat.ts) | WebSocket-based, serves `public/chat.html` |

All three are production-ready.

### Adding a New Connector

Implement the [`Channel` interface](src/types/channels.ts):

```typescript
interface Channel {
  id: string;  // Unique identifier (e.g., "discord")
  
  start(onMessage: (msg: UnifiedMessage) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
  sendMessage(chatId: string, text: string): Promise<void>;
  sendTyping?(chatId: string): Promise<void>;  // Optional
  preferredFormat?: "markdown" | "html" | "plaintext" | "whatsapp";
}
```

Register in [`src/index.ts`](src/index.ts):

```typescript
router.register(new DiscordChannel());
```

### Incoming Message Routing

**Unified flow via [`ChannelRouter`](src/channels/router.ts):**

1. Channel receives platform-specific message
2. Transforms to `UnifiedMessage`:
   ```typescript
   {
     channelId: "telegram",
     chatId: "123456",
     userId: "123456",
     text: "Hello!",
     platform: "telegram",
     isGroup: false
   }
   ```
3. Calls `router.handleMessage(msg)`
4. Router derives `sessionId = channelId:chatId`
5. Invokes [`runAgent()`](src/agent.ts)
6. Returns response via `channel.sendMessage(chatId, response)`

**Single handler** for all platforms.

### Outgoing Message Formatting

**Per-channel formatting** in `channel.sendMessage()`:

- **Telegram**: Native Markdown support, use `parse_mode: "Markdown"`
- **WhatsApp**: Plain text + emoji (Markdown stripped)
- **WebChat**: HTML rendering (sanitized)

Router stores `channel.preferredFormat` and adapts content.

---

## 🧩 LLM Integration

### Wired Providers

All in [`src/llm/`](src/llm/):

| Provider | File | Status | Notes |
|----------|------|--------|-------|
| OpenRouter | [`openrouter.ts`](src/llm/openrouter.ts) | ✅ | Multi-model gateway |
| Anthropic | [`anthropic.ts`](src/llm/anthropic.ts) | ✅ | Claude 3.5 Sonnet |
| OpenAI | [`openai.ts`](src/llm/openai.ts) | ✅ | GPT-4o, o1 |
| Google | [`google.ts`](src/llm/google.ts) | ✅ | Gemini Pro |
| Groq | [`groq.ts`](src/llm/groq.ts) | ✅ | Fast inference |
| DeepSeek | [`deepseek.ts`](src/llm/deepseek.ts) | ✅ | DeepSeek models |
| Ollama | [`ollama.ts`](src/llm/ollama.ts) | ✅ | Local, air-gapped |
| Failover | [`failover.ts`](src/llm/failover.ts) | ✅ | Auto-retry cascade |

### LLM Abstraction

**Adapter pattern** — all providers implement [`LLMProvider` interface](src/types/llm.ts):

```typescript
interface LLMProvider {
  name: string;
  chat(messages, toolDefinitions, options?): Promise<LLMResponse>;
  listModels?(): Promise<string[]>;
  countTokens?(messages): number;
}
```

Factory function: [`getProvider()`](src/llm/index.ts) returns current provider based on config/session settings.

### Model Selection

**Three-tier priority:**

1. **Per-session override**: `getSessionSettings(sessionId).model`
2. **Environment variable**: `LLM_MODEL` (e.g., `gpt-4o`, `claude-3.5-sonnet`)
3. **Provider default**: Fallback (e.g., OpenRouter uses `openrouter/free`)

Set dynamically via:

```typescript
updateSessionSetting(sessionId, "model", "gpt-4o");
updateSessionSetting(sessionId, "provider", "openai");
```

Command: `/model gpt-4o` in chat.

### Streaming Support

**Not yet implemented** — all responses are blocking (await full completion).

Roadmap item for canvas live updates.

### System Prompt Structure

**Centralized in [`src/llm/index.ts`](src/llm/index.ts)** — `SYSTEM_PROMPT` constant (1500+ lines).

Enhanced per-agent with:
- **Thinking level** (adds `<thinking>` tags) via [`src/thinking.ts`](src/thinking.ts)
- **Memory facts** (prepended via [`loadFactsForPrompt()`](src/memory/markdown.ts))
- **Attachment context** (images/docs from [`getRecentAttachmentContext()`](src/memory/multimodal.ts))

### Tool/Function Calling

**Yes** — core feature using OpenAI's function calling format:

- Tools registered in [`ToolRegistry`](src/tools/index.ts) (Map-based)
- Exported as `ChatCompletionTool[]` via `registry.getOpenAIDefinitions()`
- Passed to all providers (even non-OpenAI)
- Tool results fed back via [`addToolResult()`](src/llm/orchestrator.ts)

**80+ tools** spanning:
- System (datetime, shell, file ops)
- Memory (save facts, query graph, semantic search)
- Voice (TTS, wake word, talk mode)
- Automation (Playwright browser, scheduling)
- MCP bridge, webhooks, exports, backups

---

## 🎨 Live Canvas

### What is Live Canvas?

**Web UI for agent-generated interactive widgets** — "A2UI" pattern:

- Agent generates HTML/JS
- Pushes to browser via WebSocket
- User interacts → events sent back to agent
- Agent updates UI based on interactions

Think "ChatGPT Code Interpreter" but for arbitrary UIs.

### WebSocket Server

**Native `ws` library** ([`src/server.ts`](src/server.ts)):

```typescript
import { WebSocketServer } from "ws";
const wss = new WebSocketServer({ server });
```

Listens on same port as HTTP server (`PORT=3000` by default).

### Canvas Events

**Server → Client:**
- `connected` — Welcome message with sessionId
- `canvas_push` — Agent pushes widget (HTML + optional JS)
- `pong` — Heartbeat response

**Client → Server:**
- `interaction` — User clicked button, submitted form, etc.
- `error` — Canvas client error
- `ping` — Heartbeat

Defined in [`src/canvas/index.ts`](src/canvas/index.ts).

### Frontend Architecture

**Bundled** — static HTML in [`public/`](public/):

- [`public/canvas.html`](public/canvas.html) — Canvas viewer
- [`public/chat.html`](public/chat.html) — WebChat interface
- [`public/index.html`](public/index.html) — Dashboard/landing

Served by Express: `app.use(express.static("public"))`.

### User Capabilities

**In Canvas:**
- View agent-pushed widgets (charts, forms, interactive demos)
- Interact with widgets → sends events back to agent
- View live updates as agent modifies the canvas

**In WebChat:**
- Send/receive messages
- Upload images (multimodal)
- Export chat history

**In Dashboard** (experimental):
- View sessions list
- See analytics (token usage, tool calls)
- Manage configuration

---

## 🔐 Security

### Encrypted Fields

**Secrets stored in [`secrets.enc.json`](secrets.enc.json)** using **AES-256-GCM**:

- API keys (OpenAI, Anthropic, etc.)
- Webhook secrets
- Custom sensitive config

**Encryption format** ([`src/secrets.ts`](src/secrets.ts)):

```typescript
{
  "MY_API_KEY": {
    iv: "hex...",
    data: "hex...",
    authTag: "hex...",
    metadata: { createdAt, expiresAt, status }
  }
}
```

**Not encrypted**: 
- Conversation history (stored plaintext in SQLite)
- Facts/entities (plaintext)

### Key Management

**Environment variable: `MASTER_KEY`**

- 64-character hex string (32 bytes)
- Generated via: `npm run secret:generate`
- Derived via SHA-256 if not exact length

**No keystore or HSM** — relies on `.env` protection.

### Authentication Layer

**Per-platform:**

- **Telegram**: User ID allowlist (`TELEGRAM_ALLOWED_USER_ID`)
- **WhatsApp**: Device pairing (QR code, Baileys session)
- **WebChat**: No auth (local/trusted network only)
- **Webhooks**: HMAC signature verification

**No JWT or OAuth** — designed for personal/single-user deployment.

### Air-Gapped Offline Mode

**Enforcement in [`src/airgap/enforcement.ts`](src/airgap/enforcement.ts):**

When `AIR_GAPPED=true`:

1. **Blocks all `fetch()` calls** via global override
2. **Forces `LLM_PROVIDER=ollama`**
3. **Disables Supabase sync**
4. **Whitelists**: localhost, `127.0.0.1`, Ollama endpoint

Validated at startup — exits if config violates air-gap rules.

---

## ⚙️ Tooling & Development

### Available Tools (80+)

**Categories** (see [`src/tools/`](src/tools/)):

#### System
- `get_current_datetime`, `shell`, `search_attachments`
- File ops: `read_file`, `write_file`, `list_directory`

#### Memory
- `save_fact`, `recall_facts`, `save_entity`, `save_relationship`
- `query_graph`, `search_memory_semantic`, `memory_prune_context`

#### Voice
- `text_to_speech_openai`, `text_to_speech_elevenlabs`
- `enable_talk_mode`, `set_voice_settings`, `enable_wake_word`

#### Automation
- `browser_navigate`, `browser_click`, `browser_screenshot`
- `schedule_task`, `list_scheduled_tasks`, `cancel_task`

#### Multi-Agent
- `spawn_agent`, `aggregate_results`, `agent_send_message`

#### Observability
- `dashboard_analytics`, `export_chat_history`, `export_graph`

#### Backup
- `create_backup`, `list_backups`, `restore_backup`

#### Security
- `secret_add`, `secret_list`, `secret_rotate`

#### MCP Bridge
- `mcp_list_servers`, `mcp_list_tools`, `mcp_call_tool`

Full list via CLI: `npm run cli -- tools`

### Defining and Registering a Tool

**1. Define** tool implementation:

```typescript
// src/tools/myTool.ts
import type { Tool } from "../types/tools.js";

export const myTool: Tool = {
  name: "my_tool",
  description: "Does something useful",
  inputSchema: {
    type: "object",
    properties: {
      input: { type: "string" }
    },
    required: ["input"]
  },
  async execute(input) {
    // Context injected automatically:
    const { __sessionId, __userId, __platform } = input;
    
    // Your logic here
    return JSON.stringify({ success: true, result: "..." });
  }
};
```

**2. Export** from category index:

```typescript
// src/tools/automation/index.ts
export { myTool } from "./myTool.ts";
```

**3. Register** in [`src/index.ts`](src/index.ts):

```typescript
import { myTool } from "./tools/automation/index.ts";
registry.register(myTool);
```

### Tool Sandboxing

**Partial sandboxing:**

- **File operations**: Path allowlist (`PATH_ALLOWLIST` env var, defaults to CWD)
- **Shell commands**: Requires user confirmation for dangerous patterns
- **Web requests**: Blocked in air-gapped mode

**No VM/container isolation** — tools run in main Node.js process.

### CLI

**Yes** — [`src/cli.ts`](src/cli.ts):

```bash
npm run cli -- chat          # Interactive REPL
npm run cli -- doctor        # Health checks
npm run cli -- config        # View config
npm run cli -- tools         # List tools
npm run cli -- sessions list # Manage sessions
```

Also: `npx gravityclaw` if installed globally.

---

## 🚀 Deployment

### Docker

**Yes** — [`Dockerfile`](Dockerfile) + [`docker-compose.yml`](docker-compose.yml):

```bash
docker-compose up -d
```

**Base image**: `node:20-slim`  
**Includes**: Playwright Chromium (for browser automation)

### Deployment Target

**Intended for:**

- **VPS** (DigitalOcean, Hetzner, AWS EC2)
- **Self-hosted** (Raspberry Pi, home server)
- **Docker** (any container platform)

**Not cloud-native** (no serverless/Lambda support) — designed for long-running process.

### CI/CD

**Not yet implemented** — manual deployment currently.

**Roadmap**: GitHub Actions for Docker builds + integration tests.

---

## 📊 Current State

### What Works End-to-End

✅ **Fully functional:**

- Telegram/WhatsApp/WebChat channels
- LLM orchestration (8 providers, failover)
- 80+ tools including browser automation, scheduling, voice
- Memory: SQLite + vector search + knowledge graph
- Agent swarms (multi-agent parallel)
- Mesh workflows (DAG-based task decomposition)
- Live Canvas (A2UI) for interactive widgets
- Encrypted secrets, air-gapped mode
- Backup/restore system
- CLI for local interaction
- Proactive features (heartbeat, daily recap)
- Rate limiting, observability, performance monitoring

### Known Issues and Stubs

⚠️ **Partially working or future work:**

- **LLM streaming responses**: Not implemented (blocks until completion) - SSE/WebSocket support planned
- **Voice input (STT)**: Available via Whisper API, tested with /api/voice/transcribe
- **MCP server management**: Basic integration works, auto-restart on failure needs enhancement
- **Plugin hot-reload**: Requires app restart
- **Group chat permissions**: Admin controls implemented
- **Cross-session memory**: Session-scoped facts implemented, global cross-session planned

### Next Active Work

From recent commits/docs:

1. **Mobile PWA**: Touch gesture support added, need serviceworker offline caching
2. **Performance tuning**: Query optimization, connection pooling
3. **Skill system refinement**: Better skill injection into prompts
4. **Advanced DAG features**: Conditional edges, parallel execution
5. **Streaming**: SSE/WebSocket streaming for real-time responses

### Architectural Regrets/Changes

**Want to change:**

- **Better-sqlite3 → Turso/LibSQL**: For better cloud sync, edge deployment
- **In-memory vector search → Qdrant/Weaviate**: More scalable semantic search
- **Monolithic tool registry → Plugin-based**: Full hot-reload without restart
- **SQLite schema migrations**: Currently ad-hoc try/catch, need proper migration system (e.g., Kysely)

**Happy with:**

- Import path strategy (`.ts` for source, `.js` for types)
- Zod config validation (catches errors immediately)
- ChannelRouter abstraction (easy to add new platforms)
- Hybrid memory (SQLite + vector + graph) scales well

---

## 🎯 Key Architectural Decisions

### Design Principles

1. **SQLite as primary database**: WAL mode, excellent for single-server deployment
2. **No ORM**: Direct better-sqlite3 for performance
3. **TSX for TS execution**: No build step, fast iteration
4. **Type re-exports use `.js`**: Works with Node.js ESM resolution
5. **Global tool registry**: All tools available to all sessions (no per-agent restrictions yet)
6. **Ephemeral agents**: No persistent "running" agents, invoked on-demand
7. **LLM-generated DAGs**: Mesh system uses LLM to decompose goals, not hardcoded
8. **Air-gap enforcement**: Fail-fast at startup if misconfigured

### Request Flow

```
Channel (Telegram/WhatsApp/Web) 
  → ChannelRouter 
  → runAgent() (tool-use loop)
  → callClaude() (LLM orchestrator)
  → Tool execution
  → Repeat until completion or max iterations
  → Response back to channel
```

### Core Components Hierarchy

```
src/index.ts                    # Entry point
├── src/channels/router.ts      # Message routing
├── src/agent.ts                # Agentic loop
├── src/llm/orchestrator.ts     # LLM provider management
├── src/tools/index.ts          # Tool registry
├── src/memory/                 # Hybrid memory
│   ├── graph.ts                # Knowledge graph
│   ├── markdown.ts             # Persistent facts
│   ├── supabase.ts             # Cloud sync
│   └── pruning.ts              # Context compression
├── src/agents/                 # Multi-agent
│   ├── swarm.ts                # Role-based parallel
│   └── mesh.ts                 # DAG workflows
└── src/canvas/                 # A2UI protocol
```

---

## 📚 Additional Resources

- **Main README**: [`README.md`](README.md)
- **Security Policy**: [`SECURITY.md`](SECURITY.md)
- **Contributing**: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- **CLI Documentation**: [`docs/guides/CLI.md`](docs/guides/CLI.md)
- **Architecture Details**: [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md)
- **Deployment Guide**: [`docs/guides/DEPLOYMENT.md`](docs/guides/DEPLOYMENT.md)
- **API Reference**: [`docs/guides/API.md`](docs/guides/API.md)

---

## 🤝 Contributing

Gravity Claw is in early development. Contributions are welcome!

**Before contributing:**
1. Read [`CONTRIBUTING.md`](CONTRIBUTING.md)
2. Check existing issues
3. Follow conventional commits
4. Ensure tests pass: `npm run test:run`

**Common contribution areas:**
- Adding new LLM providers
- Implementing new tools
- Adding platform connectors
- Improving documentation
- Writing tests

---

## 📝 License

MIT License — See [`LICENSE`](LICENSE) for details.

---

**Last Updated**: March 5, 2026  
**Maintainer**: Noorul Ahamed  
**Repository**: [github.com/noorulahamed/gravityclaw](https://github.com/noorulahamed/gravityclaw)



7. **Memory Persistence**: Writing to graph and relational memory.

