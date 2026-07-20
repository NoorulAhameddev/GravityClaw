# Phase 1 Execution Brief — Production Hardening

## Mission
Production-harden GravityClaw: fix all HIGH-severity issues, add CI/CD, consolidate architecture, add monitoring.

## Dependencies
Phase 0 complete (Postgres fixed, error handler, MCP env filter, shell validation, etc.)

## Three Parallel Tracks

### Track A: Security Hardening

**1.1 Fix JWT to be RFC-compliant [SEC-013]**
- File: `src/middleware/websocket-auth.ts`
- Replace custom atob/btoa JWT with `jsonwebtoken` library
- Use `npm install jsonwebtoken @types/jsonwebtoken`
- Implement `createSessionToken()` and `validateSessionToken()` with proper HS256, 24h expiry, issuer
- Use base64url encoding

**1.2 Fix secrets cache invalidation [SEC-011]**
- File: `src/secrets-runtime.ts`
- Add cache TTL (5 minutes) and master key change detection
- Add periodic cleanup interval with `.unref()`
- Reload secrets when key changes or TTL expires

**1.3 Add bash sanitization to sandbox [SEC-012]**
- File: `src/tools/sandbox.ts`
- Add `sanitizeBashCode()` that blocks: download-execute chains (curl|wget|fetch → sh|bash), eval/exec with network, sudo, /dev/ raw writes
- Apply before writing to temp script file

**1.4 Add rate limits + budget to swarm agents [SEC-007 / AI-003]**
- File: `src/agents/swarm.ts`
- Route swarm agents through guarded execution with: rate limit check, daily budget check, token budget check, input truncation (4K), output limit (500 tokens), usage tracking
- Add `MAX_SWARM_ITERATIONS = 5` to prevent runaway loops

### Track B: Architecture Consolidation

**1.5 Decompose server.ts into route modules [ARC-001]**
- Create `src/routes/` directory with separate files: health.ts, auth.ts, metrics.ts, webhooks.ts, memory.ts, tools.ts, admin.ts, scheduler.ts, swarms.ts, workflows.ts, voice.ts, export.ts, mobile.ts
- Each exports `register<Name>Routes(app)` function using `express.Router()`
- server.ts becomes < 100 lines of wiring only (import + register)
- Maintain all existing behavior

**1.6 Decompose runAgent() into pipeline [ARC-002]**
- Create `src/pipeline/` directory: types.ts, inputValidator.ts, contextBuilder.ts, toolPicker.ts, llmCaller.ts, outputValidator.ts, toolExecutor.ts, memoryWriter.ts, orchestrator.ts
- Pipeline class with composable stages
- Preserve all existing agent behavior

**1.7 Consolidate to single migration system [ARC-003 / DB-004]**
- Audit schemas in `src/db/schema.ts`, `src/db/definitions.ts`, `src/db/postgres.ts`
- Keep `src/db/definitions.ts` as canonical source of truth
- Remove `src/db/schema.ts` (old system)
- Remove inline SQL from `src/db/postgres.ts`
- Make Postgres use same migration runner as SQLite

**1.8 Add FK constraints to 12+ tables [DB-003]**
- File: `src/db/definitions.ts`
- Add FK constraints with ON DELETE CASCADE on: memory, usage, fact_stats, attachments, agent_swarms, workflows, execution_plans, background_tasks, recommendation_events, metrics, group_settings, group_sessions, webhooks

### Track C: DevOps & CI/CD

**1.9 Set up CI/CD pipeline [ARC-006 / DEV-001]**
- Create: `.github/workflows/ci.yml`
- Jobs: typecheck, lint, build, test (matrix node 20+22), security (audit + CodeQL), docker build
- Configure env vars for CI: mock LLM provider, test API key

**1.10 Multi-stage Docker build [DEV-003]**
- File: `Dockerfile`
- Builder stage: node:20-slim, npm ci, build
- Runtime stage: node:20-slim, tini, non-root user, healthcheck, 512MB heap limit
- Do NOT replace existing Dockerfile if one exists — merge approaches

**1.11 Add liveness/readiness probes [DEV-009]**
- File: `src/routes/health.ts` (part of route decomposition)
- `/api/live` — simple alive check
- `/api/ready` — checks DB + LLM connectivity, returns 503 if degraded

**1.12 Add error tracking [DEV-014]**
- Integrate Sentry: `npm install @sentry/node @sentry/profiling-node`
- Initialize in `src/index.ts` if SENTRY_DSN is configured
- Capture unhandled exceptions + rejections

**1.13 Consolidate telemetry [ARC-004 / FOR-003]**
- Keep `src/lib/telemetry/` (OpenTelemetry)
- Remove `src/observability/`
- Update all imports to use canonical telemetry module

**1.14 Mount or remove mobile gateway [ARC-005 / FOR-002]**
- Either mount on main server via `app.use('/mobile', gateway)` or delete `src/gateway/mobile.ts`
- Check if any config references exist and clean them up

## Verification
```bash
npm run typecheck
npm run lint
npm run build
npm run test:run
```

## Code Conventions
- `.ts` extensions in imports
- `createLogger(prefix)` for logging
- Config via `import { config } from "./config.ts"`
- kebab-case files, PascalCase classes, camelCase functions
- No comments in code
