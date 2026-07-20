# Phase 3 Execution Brief — Scale & Polish

## Mission
Fix all performance bottlenecks, add streaming, remove Telegram hard dependency, build CLI onboarding.

## Dependencies
Phase 0 + 1 complete (Postgres fixed, error handler, MCP filter, shell validation, server decomposed, CI/CD, pipeline stages, JWT RFC, etc.)

## Three Parallel Tracks

### Track A: Performance

**3.1 Replace O(n) LRU cache with O(1) [PERF-001]**
- File: `src/lib/cache.ts`
- Replace Array-based LRU (uses indexOf + splice) with native Map
- Map preserves insertion order — delete+reinsert for LRU promotion
- Benchmark: 10K ops should be 100-1000x faster

**3.2 Replace sequential tool execution with parallel [PERF-002]**
- File: `src/tools/executor.ts`
- Categorize tool calls: parallel (read-only, no side effects) vs sequential (writes, dependencies)
- Execute parallel batch with `Promise.allSettled()`
- Batch confirmations upfront
- Cancel remaining on first error

**3.3 Add LLM response cache eviction [PERF-003]**
- File: `src/llm/cache.ts`
- Add maxEntries (1000), TTL (1 hour), maxMemoryMB (100)
- LRU eviction using Map insertion order
- Track approximate memory usage per entry

**3.4 Fix SHA-1 blocking event loop [PERF-004]**
- File: `src/lib/utils.ts` or wherever `crypto.createHash("sha1")` is used
- Check `src/agent.ts:50-55` for synchronous SHA-1 hashing
- Use `crypto.subtle` async API or offload to worker
- For non-security-critical dedup, use a faster non-crypto hash

**3.5 Replace fuzzy logic search with BM25 [PERF-005]**
- File: `src/memory/search.ts` or `src/memory/vector.ts`
- Implement BM25 scoring: IDF calculation, term frequency, document length normalization
- Add precomputed document statistics with incremental updates
- Target: sub-10ms search for 10K entries

### Track B: Product Polish

**3.6 Implement streaming support [PM-003]**
- Create: `src/llm/streaming.ts`
- Implement `AsyncGenerator<StreamChunk>` pattern
- Server-Sent Events endpoint: `POST /chat/stream` with `text/event-stream`
- Support chunk types: text, tool_call, error, done
- For each LLM provider: update to support streaming if not already

**3.7 Remove Telegram hard dependency [PM-004]**
- File: `src/config.ts`, `src/index.ts`
- Make TELEGRAM_BOT_TOKEN optional (check `config.telegram.enabled`)
- Reduce `.env.example` from 349 lines to minimal: API_KEY, LLM_PROVIDER, provider API key
- Only start Telegram bot if token is present

**3.8 Build CLI onboarding wizard [PM-002]**
- File: `src/cli/init.ts`
- Use `@clack/prompts` for interactive prompts: project name, LLM provider, API key, feature selection
- Generate `.env` file based on answers
- Print next steps after completion

**3.9 Add React Router with lazy loading [FE-003]**
- File: `dashboard/src/App.tsx`
- Replace manual switch routing with `react-router-dom` `createBrowserRouter`
- Use `lazy()` + `Suspense` for code splitting per page
- Wrap with ErrorBoundary at route level

**3.10 Add WCAG ARIA attributes [FE-006]**
- Files: Dashboard components
- Add: aria-label on interactive elements, aria-live for dynamic content, role="dialog" for modals, aria-current for nav, focus-visible management

### Track C: Monitoring & Reliability

**3.11 Add structured logging [DEV-013]**
- Install `pino` (already may be present), add `pino-pretty` for dev
- Replace console.log with `logger.info/warn/error` with structured context objects
- Configure redact for sensitive fields (authorization, apiKey)

**3.12 Add Prometheus metrics endpoint [DEV-005]**
- Install `prom-client`
- Create metrics: http_request_duration_seconds (Histogram), llm_tokens_total (Counter), active_connections (Gauge)
- Add `/metrics` endpoint with `prom-client` registry
- Track request duration via middleware

**3.13 Add admin dashboard backend APIs [PM-006]**
- Files: `src/routes/admin.ts`
- Endpoints: sessions/count, usage/summary, system/health
- Require admin auth

**3.14 Mobile gateway integration (if kept)**
- Ensure mobile gateway uses shared auth middleware and telemetry

## Verification
```bash
npm run typecheck
npm run test:run
```

## Code Conventions
- `.ts` extensions in imports
- `createLogger(prefix)` for logging
- Config via `import { config } from "./config.ts"`
- kebab-case files, PascalCase classes, camelCase functions
- No comments in code
