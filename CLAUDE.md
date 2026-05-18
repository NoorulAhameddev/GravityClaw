# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

Gravity Claw is a personal AI agent with a tool-use loop spanning multiple communication channels.

**Request flow:** Channel (Telegram/WhatsApp/WebChat) → `ChannelRouter` → `runAgent()` → `callClaude()` (LLM orchestrator) → Tool execution → repeat until no tool calls.

**Core files:**
- `src/agent.ts` — The agentic loop (`runAgent()`). Executes tool calls, feeds results back, respects `AGENT_MAX_ITERATIONS`.
- `src/llm/orchestrator.ts` — `callClaude()`: persists history to SQLite, resolves per-session provider/model overrides, injects memory facts and attachment context into the system prompt.
- `src/tools/index.ts` — `ToolRegistry` (Map-based). All tools registered at startup in `src/index.ts`.
- `src/config.ts` — Zod-validated env schema. **Exits process at startup if misconfigured.** Single source of truth for all config.
- `src/db.ts` — `better-sqlite3` database at `gravity.db` (WAL mode). Initializes all tables on import.
- `src/session.ts` — Per-session settings (model, provider, thinking level, voice mode) stored as JSON in `memory` table.
- `src/channels/router.ts` — `ChannelRouter` multiplexes across all registered channels and handles proactive (outbound) messages.

**LLM providers** (`src/llm/`): `openrouter`, `openai`, `anthropic`, `google`, `groq`, `deepseek`, `ollama`, `failover`. All implement `LLMProvider` from `src/types/llm.ts`. Selected via `LLM_PROVIDER` env var.

**Hybrid memory:**
- SQLite `memory` table: conversation history (JSON rows per message)
- `src/memory/graph.ts`: in-process knowledge graph (entities + relationships)
- `src/memory/markdown.ts`: persistent facts injected into system prompt
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
Structured responses use `JSON.stringify({ success, ... })`. Register in `src/index.ts` and export from category's `index.ts`.

### Context injected into tool inputs
The agent injects these fields alongside user-supplied args:
```
__sessionId, __userId, __platform, __groupId, __isGroup
```

### Adding new components
- **Tool**: Add to `src/tools/<category>/`, export from category `index.ts`, register in `src/index.ts`.
- **LLM provider**: Extend `LLMProvider` in `src/llm/`, add case in `createSingleProvider()` in `src/llm/index.ts`.
- **Channel**: Implement `Channel` interface from `src/types/channels.ts`, register in `ChannelRouter` in `src/index.ts`.
- **Plugin** (runtime extension): See `src/plugins/README.md`. Create `plugin.json` + entry module exporting a `Plugin` object.
- **Skill** (prompt/knowledge asset): Create `.md` file in `skills/`. Skills guide LLM behavior but are not runtime modules.

### Logging
Use `createLogger(prefix)` from `src/logger.ts` — never `console.log` directly. Log level controlled by `LOG_LEVEL` env var.

### Imports
Source files use `.ts` extensions (e.g., `import { foo } from "./bar.ts"`). Type re-exports use `.js` (e.g., `export type { Foo } from "../types/foo.js"`).

### Config access
Import `config` from `src/config.ts`. Do not read `process.env` directly elsewhere — the Zod schema is the contract.

### Tests
Test files live in `src/__tests__/`. Use Vitest globals (`describe`, `it`, `expect`). Tests using the database should use unique test session ID and clean up in `afterEach`. Integration tests requiring live API calls go in `src/__tests__/manual/`.

### Commit messages
Follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `refactor:`, etc.

## Personal Knowledge Base (Zed Vault)

Your personal knowledge base is the Obsidian vault "Zed" at:
`C:\Users\Noorul_Ahamed\OneDrive\Documents\Zed\`

**Before each session:**
1. Read `vault-context.md` for current state (project status, OKRs, active decisions)
2. Read `2-Projects/gravityclaw.md` for project context
3. Check `1-Daily/` for today's notes

**Vault structure:**
- `0-Inbox/` — Quick capture
- `1-Daily/` — Daily notes (YYYY-MM-DD.md)
- `2-Projects/` — Project context files
- `9-Decisions/` — Decision logs (DEC-001 to DEC-010)
- `9-Decisions/sessions/` — Session archives (~470 sessions)

**Key files:**
- `vault-context.md` — Session bootstrap, OKRs, active projects
- `2-Projects/gravityclaw.md` — Project overview, architecture, session activity
- `AGENTS.md` — Vault-specific agent instructions

**Session sync:** When working on this project, you can:
- Write session summaries to `9-Decisions/sessions/`
- Update daily notes in `1-Daily/`
- Create tasks in `6-Tasks/active/`

The vault contains ~100 sessions of GravityClaw development history that can provide context.