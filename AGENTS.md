# Gravity Claw — Agent Instructions

This file provides guidelines for agentic coding agents working on this codebase.

## Build / Lint / Test Commands

```bash
# Development
npm run dev          # Run with tsx watch (auto-reload on changes)
npm start            # Production start (512MB heap limit)

# Type checking
npm run typecheck    # TypeScript check (no emit)

# Testing
npm run test         # Run tests in watch mode
npm run test:run     # Run all tests once
npm run test:ui      # Run tests with UI
npm run test:coverage # Run with coverage report
```

**Running a single test:**
```bash
npx vitest run --config config/vitest.config.ts src/__tests__/agent.test.ts
```

Additional commands:
```bash
npm run cli                  # Run CLI
npm run bench:load           # Load test (50 clients, 100 messages, 60s)
npm run bench:stress        # Stress test (10→300 clients)
npm run bench:tools          # Tool benchmarks
npm run secret:generate     # Generate encryption key
npm run secret:list          # List secrets
npm run secret:add           # Add a secret
```

## Architecture Overview

**Request flow:** Channel (Telegram/WhatsApp/WebChat) → `ChannelRouter` → `runAgent()` → `callClaude()` (LLM orchestrator) → Tool execution → repeat until no tool calls.

**Key files:**
- `src/agent.ts` — Agentic loop (`runAgent()`). Executes tool calls, feeds results back, respects `AGENT_MAX_ITERATIONS`.
- `src/llm/orchestrator.ts` — `callClaude()`: persists history to SQLite, resolves per-session provider/model overrides, injects memory facts and attachment context.
- `src/tools/index.ts` — `ToolRegistry` (Map-based). All tools registered at startup in `src/index.ts`.
- `src/config.ts` — Zod-validated env schema. **Exits on startup if misconfigured.** Single source of truth for all config.
- `src/db.ts` — `better-sqlite3` database at `gravity.db` (WAL mode). Initializes tables on import. Migrations done inline with try/catch.
- `src/session.ts` — Per-session settings (model, provider, thinking level, voice mode) stored as JSON in `settings` column.
- `src/channels/router.ts` — `ChannelRouter` multiplexes across all registered channels.

**LLM providers** (`src/llm/`): `openrouter`, `openai`, `anthropic`, `google`, `groq`, `deepseek`, `ollama`, `failover`. All implement `LLMProvider` from `src/types/llm.ts`. Selected via `LLM_PROVIDER` env var.

**Multi-agent:** `src/agents/swarm.ts` (role-based parallel agents) and `src/agents/mesh.ts` (DAG-based workflow decomposition). Agent records tracked in `agent_swarms` and `workflows`/`workflow_tasks` SQLite tables.

## Agent Configuration Limits

The agent loop has configurable limits to prevent resource exhaustion:

- `AGENT_MAX_ITERATIONS` (default: 10): Maximum number of agent iterations per request
- `AGENT_MAX_TOOLS_PER_ITERATION` (default: 5): Maximum tool calls per iteration
- `AGENT_MAX_TOOLS_TOTAL` (default: 50): Maximum total tool calls per agent run

These limits are enforced in `src/agent.ts:runAgent()` and help prevent:
- Infinite loops via recursive tool calls
- Resource exhaustion with unlimited tool calls
- Rate limiting bypass at session level
- DDoS attacks with parallel tool executions

When limits are reached, the agent returns an error to the LLM and logs telemetry events.

## Code Style Guidelines

### TypeScript Config
- **Target:** ES2022 | **Module:** ESNext | **Resolution:** bundler
- **Strict mode:** Enabled | **noUncheckedIndexedAccess:** Enabled | **noImplicitOverride:** Enabled
- **verbatimModuleSyntax:** true (use `.js` for type-only exports)

### Imports
Source files use `.ts` extensions, type re-exports use `.js`:
```typescript
import { foo } from "./bar.ts"
export type { Foo } from "../types/foo.js"
```

### Naming Conventions
- **Files:** kebab-case (`my-module.ts`)
- **Classes/Interfaces:** PascalCase (`AgentConfig`)
- **Functions/variables:** camelCase (`runAgent`)
- **Constants:** SCREAMING_SNAKE_CASE (`MAX_RETRIES`)

### Config Access
Import `config` from `src/config.ts`. **Do not read `process.env` directly.**

```typescript
import { config } from "./config.ts"
const apiKey = config.openaiApiKey
```

### Logging
Use `createLogger(prefix)` from `src/logger.ts` — never `console.log`. Log level controlled by `LOG_LEVEL` env var.

```typescript
const log = createLogger("my-module")
log.info("Starting operation")
```

### Error Handling
- Use try/catch for all async operations
- Return structured responses: `JSON.stringify({ success: true, data: ... })`
- Log errors with context before rethrowing

### Comments
**Do NOT add comments** unless explicitly requested by the user.

## Tool Interface

Every tool must satisfy:
```typescript
interface Tool {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties?: Record<string, unknown>; required?: string[] };
  execute(input: Record<string, unknown>): Promise<string>;  // always returns string
}
```

Register in `src/index.ts` and export from category's `index.ts`.

**Context injected into tool inputs:** `__sessionId, __userId, __platform, __groupId, __isGroup`

## Adding New Components

- **Tool:** Add to `src/tools/<category>/`, export from category `index.ts`, register in `src/index.ts`.
- **LLM provider:** Extend `LLMProvider` in `src/llm/`, add case in `createSingleProvider()` in `src/llm/index.ts`.
- **Channel:** Implement `Channel` interface from `src/types/channels.ts`, register in `ChannelRouter`.
- **Plugin:** See `src/plugins/README.md`. Create `plugin.json` + entry module exporting `Plugin` object.
- **Skill:** Create `.md` file in `skills/`. Skills guide LLM behavior (not runtime modules).

## Tests

- Test files live in `src/__tests__/`
- Use Vitest globals (`describe`, `it`, `expect`)
- Tests using DB should use unique test session ID and clean up in `afterEach`
- Integration tests go in `src/__tests__/manual/`

## Memory Architecture

- SQLite `memory` table: conversation history (JSON rows per message)
- `src/memory/graph.ts`: in-process knowledge graph (entities + relationships)
- `src/memory/markdown.ts`: persistent facts injected into system prompt
- `src/memory/supabase.ts`: optional cloud sync (async, non-blocking)

## Token Efficiency & Tool Usage Guidelines

To prevent resource exhaustion and excessive token consumption (especially when using expensive tools like `browser_subagent`), agents MUST follow these rules:

### 1. Avoid Redundant Verification
- Once a fix is verified (e.g., via logs, terminal output, or a clear screenshot), do NOT run additional verification steps "just to be sure."
- Trust the evidence obtained. If a screenshot shows a "Live" status, do not launch another browser subagent to click a button unless explicitly requested by the USER for interaction testing.

### 2. Browser Usage (High Cost)
- **The browser consumes a massive amount of tokens.** Use it only when necessary.
- Prefer `curl`, `fetch`, or internal health check APIs for verifying connectivity rather than launching a full browser session.
- If a browser subagent task fails, analyze the error deeply before retrying. Do NOT repeat the exact same task if the failure reason is obvious (e.g., process not running).

### 3. Trust the Logs
- If the terminal/server logs confirm a process is listening on a port, assume it is accessible locally unless there is evidence of firewall/binding issues.
- Use `netstat` or `ps` to verify process state instead of visual verification when possible.

### 4. Sequential Execution
- Avoid launching multiple subagents or parallel tasks that overlap in purpose.
- If a task requires visual confirmation, take a single screenshot and analyze it thoroughly rather than taking multiple shots in a loop.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `refactor:`, etc.

## Security

- No hardcoded secrets
- Validate all inputs
- Use parameterized queries
- Implement proper authentication/authorization
