# Gravity Claw — Copilot Instructions

## Commands

```bash
npm run dev          # Development (tsx watch)
npm start            # Production
npm run typecheck    # TypeScript check (no emit)
npm run test:run     # Run all tests once
npm run test         # Watch mode
npm run test:coverage
```

Run a single test file:
```bash
npx vitest run --config config/vitest.config.ts src/__tests__/agent.test.ts
```

## Architecture

Gravity Claw is a personal AI agent with a tool-use loop that spans multiple communication channels.

**Request flow:** Channel (Telegram/WhatsApp/WebChat) → `ChannelRouter` → `runAgent()` → `callClaude()` (LLM orchestrator) → Tool execution → repeat until no tool calls.

**Key files:**
- `src/agent.ts` — The agentic loop (`runAgent()`). Executes tool calls, feeds results back, respects `AGENT_MAX_ITERATIONS`.
- `src/llm/orchestrator.ts` — `callClaude()`: persists history to SQLite, resolves per-session provider/model overrides, injects memory facts and attachment context into the system prompt.
- `src/tools/index.ts` — `ToolRegistry` (Map-based). All tools are registered here at startup in `src/index.ts`.
- `src/config.ts` — Zod-validated env schema. **Exits the process at startup if misconfigured.** The single source of truth for all config values.
- `src/db.ts` — `better-sqlite3` database at `gravity.db` (WAL mode). Initializes all tables on import. Schema migrations are done inline with try/catch.
- `src/session.ts` — Per-session settings (model, provider, thinking level, voice mode, etc.) stored as JSON in the `settings` column of the `memory` table.
- `src/channels/router.ts` — `ChannelRouter` multiplexes across all registered channels and handles proactive (outbound) messages.

**LLM providers** (`src/llm/`): `openrouter`, `openai`, `anthropic`, `google`, `groq`, `deepseek`, `ollama`, `failover`. All implement `LLMProvider` from `src/types/llm.ts`. Selected via `LLM_PROVIDER` env var; sessions can override per-call.

**Memory is hybrid:**
- SQLite `memory` table: conversation history (JSON rows per message)
- `src/memory/graph.ts`: in-process knowledge graph (entities + relationships)
- `src/memory/markdown.ts`: persistent facts injected into the system prompt
- `src/memory/supabase.ts`: optional cloud sync (async, non-blocking)

**Multi-agent:** `src/agents/swarm.ts` (role-based parallel agents) and `src/agents/mesh.ts` (DAG-based workflow decomposition). Agent records tracked in `agent_swarms` and `workflows`/`workflow_tasks` SQLite tables.

## Key Conventions

### Tool interface
Every tool must satisfy:
```typescript
interface Tool {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties?: Record<string, unknown>; required?: string[] };
  execute(input: Record<string, unknown>): Promise<string>;  // always returns string
}
```
Structured responses use `JSON.stringify({ success, ... })`. Register in `src/index.ts` and export from the category's `index.ts`.

### Context injected into tool inputs
The agent injects these fields alongside user-supplied args — tools can read them:
```
__sessionId, __userId, __platform, __groupId, __isGroup
```

### Adding new things
- **Tool**: Add to `src/tools/<category>/`, export from category `index.ts`, register in `src/index.ts`.
- **LLM provider**: Extend `LLMProvider` in `src/llm/`, add a case in `createSingleProvider()` in `src/llm/index.ts`.
- **Channel**: Implement `Channel` interface from `src/types/channels.ts`, register in `ChannelRouter` in `src/index.ts`.
- **Plugin** (runtime extension): See `src/plugins/README.md`. Create `plugin.json` + entry module exporting a `Plugin` object.
- **Skill** (prompt/knowledge asset): Create a `.md` file in `skills/`. Skills are *not* runtime modules — they guide LLM behavior.

### Logging
Use `createLogger(prefix)` from `src/logger.ts` — never `console.log` directly. Log level is controlled by `LOG_LEVEL` env var.

### Imports
Source files use `.ts` extensions in imports (e.g., `import { foo } from "./bar.ts"`). Type re-exports use `.js` (e.g., `export type { Foo } from "../types/foo.js"`).

### Config access
Import `config` from `src/config.ts`. Do not read `process.env` directly elsewhere — the Zod schema is the contract.

### Commit messages
Follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `refactor:`, etc.

### Tests
Test files live in `src/__tests__/`. Use Vitest globals (`describe`, `it`, `expect`). Tests that use the database should use a unique test session ID and clean up in `afterEach`. Integration tests requiring live API calls go in `src/__tests__/manual/`.
