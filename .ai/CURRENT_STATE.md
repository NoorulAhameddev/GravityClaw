# CURRENT STATE — snapshot 2026-08-24

- **Current objective:** remediate production blockers identified by 11-audit hostile sweep;
  target = safe single-operator release.
- **Phase:** post-audit remediation planning. NO implementation started on blockers yet.
- **Active agent:** opencode (ox-alpha orchestrator).
- **Last checkpoint:** origin/main == local main @ `6251960`.

## Completed (this effort arc)
1. Engineering-org design -> committed `docs/team/ENGINEERING_ORG.md` (5-engineer model + gates).
2. Team sprint (5 parallel agents, verified): skills-loader hardening, audit middleware wiring,
   tool-result sanitization hook, rate-limit pause notices, rejected-tool-result synthesis,
   shutdown drainBackgroundTasks, queue crash-recovery sweep, backup DB-path resolution fix,
   Retry-After support, CI Trivy gate + SARIF upload + removed npm-audit-fix-force,
   nginx OSS directive fix, SDK honesty fixes (501s, real endpoints), WhatsApp view deletion.
   **ALL UNCOMMITTED** (see below).
3. 11-audit hostile sweep complete -> verdict recorded in `.ai/AUDITS/2026-08-24-hostile-audit.md`.

## ACTIVE / BLOCKED
- **BLOCKED on owner approval: commit of team sprint.** Working tree has 23 changes
  (21 modified/deleted + staged `docs/team/ENGINEERING_ORG.md`, `src/backup/db-path.ts`).
  Verified: typecheck PASS; targeted tests green once UNRESTRICTED_ACCESS=false.
- **IMMEDIATE operational task:** local `.env` currently has `UNRESTRICTED_ACCESS=true`
  (disables approvals + path validation). Set to `false` (TASKS GC-000).

## Unfinished work
Fix-order backlog GC-000..GC-012 in `TASKS.md`. Nothing started.

## Known bugs (top severity — full list in AUDITS file)
- Memory-poisoning persistence chain (save_fact/extraction/vector -> raw system prompt)
- Per-session serialization nonexistent (concurrent same-session runs corrupt history)
- Batch slicing leaves dangling tool_calls (provider 400s at budget pressure)
- Anthropic adapter sends invalid wire format (synthetic caller field, per-row tool_results)
- Skills loader: dir->executable at boot; frontmatter env overrides allowlist; quote breakout
- WS localhost bypass unconditional; sessions client-asserted everywhere
- Approval promise can hang forever holding concurrency slot

## Known risks
- Live `.env` unrestricted (above). Webchat = single global session. Air-gap claim FALSE as shipped.
- OpenRouter free-alias fans conversation to <=15 third-party backends.

## Recently modified files (uncommitted)
ci.yml, CLAUDE.md, dashboard App/Sidebar/WhatsApp(del), nginx.conf, sdk/* (index/types/streaming(del)/examples),
src/{audit/middleware,backup/backup,backup/db-path(new),index,llm/orchestrator,llm/retry,pipeline/orchestrator,
queue/backends/sqlite,queue/storage,server,skills/loader}

## Tests
Root `npm run typecheck`: PASS. Targeted suites: pass (see TEST_STATUS.md). Full vitest/e2e: UNKNOWN on current tree.

## Database / deployment
SQLite `data/gravity.db`, 18 migrations applied, no PG. Deployment: NONE real (dev-stage; prod stack fictional).

## Next recommended action
1) Owner approves checkpoint commit of team sprint. 2) Set UNRESTRICTED_ACCESS=false. 3) Start GC-001..GC-004.
