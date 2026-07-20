# Phase 0 Execution Brief — For Antigravity

## Mission
Execute Phase 0 of the GravityClaw audit remediation: fix all CVSS > 7.0 vulnerabilities and critical crash bugs.

## Project
- Root: `D:\Projects\GravityClaw\`
- Read `D:\Projects\GravityClaw\AGENTS.md` for build/lint/test commands and code conventions
- Read `D:\Projects\GravityClaw\audit\plan\02-PHASE-0.md` for full detailed plan with code snippets

## Priority Order (execute in this exact sequence)

### MUST FIX — HIGHEST PRIORITY

**1. Fix PostgreSQL fire-and-forget (SEC-003 / DB-001)**
- File: `src/db/postgres.ts`
- Make `all()`, `get()`, `run()` methods async with proper `await`
- Fix `transaction()` to use BEGIN/COMMIT/ROLLBACK
- Update ALL callers across the codebase to use `await` with these methods
- This is the MOST CRITICAL fix — Postgres silently returns empty results

**2. Add global Express error handler (SEC-008 / BE-001)**
- Create: `src/middleware/errorHandler.ts`
- Implement errorHandler middleware + asyncHandler wrapper
- Register in `src/server.ts` after routes, before listen()
- Wrap ALL async route handlers

**3. Filter process.env for MCP servers (SEC-002)**
- File: `src/mcp/client.ts`
- Whitelist only PATH, HOME, NODE_PATH, TEMP, etc.
- Do NOT pass API keys/secrets to MCP child processes

**4. Add user input sanitization (SEC-005 / AI-001)**
- File: `src/llm/orchestrator.ts`
- Apply sanitizeMemoryContent() before adding user messages to history
- Unicode normalization, zero-width char removal, injection pattern blocking

**5. Add shell tool validation (SEC-001 / SEC-014)**
- File: `src/tools/system/shell.ts`
- Validate commands locally before execAsync()
- Block download-execute chains, eval, sudo, raw device access

**6. Constant-time API key comparison (SEC-004)**
- File: `src/middleware/auth.ts`
- Replace `===` with `crypto.timingSafeEqual()`

**7. Secure WebSocket auth (SEC-010 / FE-007)**
- File: `src/middleware/websocket-auth.ts` — use x-api-key header, not query param
- File: `dashboard/src/lib/utils.ts` — send auth via WebSocket message

### LOWER RISK

**8. Mobile approve endpoint auth (SEC-009 / BE-002)**
- File: `src/gateway/mobile.ts` — add authMiddleware

**9. Frontend error boundary (FE-001)**
- Create: `dashboard/src/components/ErrorBoundary.tsx`
- Wrap in App.tsx

**10. Fix CSS !important overrides (FE-003)**
- File: `dashboard/src/index.css`
- Replace global overrides with Tailwind @layer base
- Restore focus-visible outlines

**11. Helmet middleware (BE-008)**
- `npm install helmet`
- Add to server.ts with CSP config

**12. .dockerignore (DEV-002)**
- Create with node_modules, .env, .git, *.db, etc.

**13. getHistory LIMIT (PERF-007 / DB-006)**
- File: `src/llm/orchestrator.ts`
- Add LIMIT 200 subquery

**14. Cache AJV compilations (PERF-005)**
- File: `src/tools/executor.ts`
- Cache compiled validators per tool name

**15. Fix empty catch blocks (CQ-003)**
- Add log.debug() to all empty catches

**16. Create SECURITY.md (DOC-003)**
- Vulnerability reporting, supported versions

**17. Fix broken doc links (DOC-001)**
- Fix paths in docs/INDEX.md, CLI.md, CONTRIBUTING.md, etc.

## Verification
After all fixes, run:
```
npm run typecheck
npm run test:run
```

## Code Conventions
- `.ts` extensions in imports (not .js)
- `createLogger(prefix)` for logging, never console.log
- Config via `import { config } from "./config.ts"`, never process.env
- kebab-case files, PascalCase classes, camelCase functions
- No comments in code
