# TASK LEDGER — GravityClaw

States: TODO | IN_PROGRESS | BLOCKED | DONE | ABANDONED. One owner per task at a time.
Validation criteria are mandatory — a task without validation cannot be marked DONE.

| ID | Objective | Depends on | Owner (role) | Status | Validation |
|----|-----------|-----------|--------------|--------|------------|
| GC-000 | Set `UNRESTRICTED_ACCESS=false` in local `.env`; treat `true` as incident state | — | Noorul | TODO | grep config; approval gate fires for run_shell |
| GC-011 | Commit team-sprint checkpoint (23 files) + push | owner approval | opencode | BLOCKED | typecheck PASS; targeted vitest green; commit message per repo style |
| GC-001 | Sanitizer scope redesign: delimit tool output, never rewrite; exempt `role:'tool'` from destructive filters; preserve PERSISTED_OUTPUT_TAG; sanitize memory-write paths instead | — | Daniel (AI Platform) + Priya review | TODO | unit tests: code blocks survive in tool results; facts.md sanitized on write |
| GC-002 | Server-side session derivation + ownership binding; reject client-supplied sessionId/userId on WS, /api/tools/execute, token minting; session_owner table | — | Tomás + Priya | TODO | cross-session read attempt returns 403; integration test |
| GC-003 | Per-session mutex in concurrency layer (refcount slots; serialize same-session runs) | — | Maya | TODO | concurrency unit test: 2 same-key calls serialize |
| GC-004 | Synthetic failure results for sliced/dropped tool_calls; history trim on atomic assistant+tool boundaries; guarantee leading user role | — | Maya | TODO | loop test: no dangling tool_calls under budget pressure; anthropic converter accepts trimmed window |
| GC-005 | Approval hardening: TTL timeout->deny, queue not overwrite, full-param display all tools, out-of-band approver identity, CSPRNG ids | GC-002 | Maya + Tomás | TODO | ignored approval times out and frees slot; params visible for delete_file |
| GC-006 | Skills: hash manifest or dir outside writable roots; deny-default frontmatter env; execFile argv (kill shell layer); namespace + collision refusal; registry reconcile on disable | — | Priya | TODO | adversarial suite: B1/B2/B3/B4 exploits fail; shipped weather skill cannot exfil |
| GC-007 | Anthropic converter rewrite (drop caller field; merge tool_results into single user turn; guard empty content); provider capability declaration + failover filtering; hoist per-session provider stacks to keyed cache | — | Daniel | TODO | live-API smoke on anthropic multi-tool conversation; breaker persists across calls |
| GC-008 | Air-gap: socket-level enforcement (http.request/Agent.createConnection/undici), skip MCP init when airgapped, wire getAirGapProvider, extend checkAirGapTool coverage, fix verify-airgap.ts | conditional priority | Elena + Priya | TODO | verify-airgap probes blocked endpoint and fails closed |
| GC-009 | Multi-agent hardening: task-level tool allowlists, budget propagation to initiating session, wave-splice fix (F1), aggregate lineage check (F2), grant ownership check (F3), plan confirmation before execute | GC-003 | Maya | TODO | >5-wide DAG completes fully; cross-session aggregate denied |
| GC-010 | Audit trail end-to-end: hashed actor ids (never raw apiKey), AuditEvent.API_REQUEST enum member, secrets KDF -> scrypt/Argon2id, audit every secret decrypt | — | Priya | TODO | audit_log contains no raw key material (grep test) |
| GC-012 | Hygiene batch: CI typecheck covers sdk/+dashboard/; Node engines vs CI matrix alignment; pin trivy-action to release SHA; webhook timestamp+nonce; RBAC wire-or-delete decision; delete .kilo/worktrees stale test copy; remove dead code set (buildSystemContext, shouldStoreMemory, DANGEROUS_PATTERNS, streaming remnants) | — | Elena + owners | TODO | npm run ci green; no duplicate vitest globs |

## Rules
- Claim a task by setting owner + IN_PROGRESS here BEFORE working.
- Never start a task already IN_PROGRESS by another agent.
- On completion: move to DONE with evidence link (commit sha / test output file in `.ai/sessions/`).
