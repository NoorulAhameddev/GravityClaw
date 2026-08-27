# CURRENT STATE — snapshot 2026-08-24 (post remediation wave 1)

- **Current objective:** remediate production blockers identified by 11-audit hostile sweep;
  target = safe single-operator release.
- **Phase:** remediation WAVE 1 COMPLETE (GC-000/001/002p1/003/004 + checkpoint commits).
- **Active agent:** opencode (ox-alpha orchestrator).
- **Last checkpoints (local, UNPUSHED):** `afa7001` team-sprint sprint commit;
  `9a6fde0` .ai canonical OS. Base: origin/main @ `6251960`.
- **Config:** `.env` UNRESTRICTED_ACCESS=false (GC-000 done).

## Completed (this effort arc)
1. Engineering-org design -> `docs/team/ENGINEERING_ORG.md` (committed).
2. Team sprint verified + committed (`afa7001`).
3. 11-audit hostile sweep -> `.ai/AUDITS/2026-08-24-hostile-audit.md` (DO-NOT-APPROVE verdict).
4. Canonical multi-agent OS created in `.ai/` (committed `9a6fde0`).
5. Wave 1 fixes (uncommitted in working tree, all typecheck+test green):
   - GC-001 sanitizer scope: addToolResult now delimits `[TOOL_RESULT_BEGIN]/[END]`, no destructive rewrite; spill tags preserved.
   - GC-004 dropped-call synthetic failure results + atomic turn-boundary getHistory.
   - GC-002 phase 1: WS localhost bypass env-gated + forced sid; webchat tool_call rejects foreign sessionId; /api/tools/execute server-derived context (mismatch->403).
   - GC-003 true per-session FIFO serialization + refcounted global slots (src/concurrency.ts).
   - llm.test.ts updated for delimiter contract.
6. GC-013 concurrency unit suite shipped (2026-08-25): src/__tests__/concurrency.test.ts 11/11
   green x5 runs + typecheck PASS; queue-cap rejection verified against real 1000-entry chain;
   metrics gap logged (slot-parked callers invisible to getQueuedCount).
   See .ai/sessions/2026-08-25-gc013-concurrency-tests.md.
7. GC-014 memory-write sanitization shipped (2026-08-25): new src/memory/sanitize.ts;
   write-side sanitize on saveFact/rewriteSessionFacts/extractMemories/autoDream/vector upsert/
   supabase sync; read-side [UNTRUSTED_MEMORY_BEGIN] label in loadFactsForPrompt;
   sanitizeSessionId rejects '.'/'..'. Typecheck PASS, targeted vitest 36/36.
   Follow-ups: retrieval.ts formatRelevantMemories unlabeled; sanitizer duplicated with
   orchestrator (canonical noted). See .ai/sessions/2026-08-25-gc014-memory-sanitization.md.
8. GC-005 approval hardening shipped (2026-08-25): channel confirmations now per-chat FIFO
   queue with TTL->deny (APPROVAL_TIMEOUT_MINUTES) + timeout notice, timers cleared on
   resolution; strict y/yes/n/no tokens only (other text flows as chat); orchestrator shows
   tool name + sanitized params for ALL approval prompts (run_shell command first); approval
   ids CSPRNG via crypto.randomUUID(); ApprovalRequest records requestedBy/approvedBy/
   deniedBy/resolutionChannel (surfaces in /api/approvals GET). Typecheck PASS; targeted
   vitest tool-executor+channels/router+agent 22/22 + runtime probes. Follow-ups:
   cli/chat.ts confirmation lacks TTL; executor.ts legacy `approver` read; logger masks
   UUID-shaped ids. See .ai/sessions/2026-08-25-gc005-approval-hardening.md.

## ACTIVE / BLOCKED
- Working tree: 6 modified files (wave 1) awaiting owner decision: commit as wave-1 checkpoint?
- Push of afa7001/9a6fde0 awaits owner approval (DEC-GC-002: no force-push, origin authoritative).
- Untracked strays needing triage: docs/team/FINAL_RECURSIVE_AUDIT.md,
  docs/team/audit_reports/, domain_mapping.json (origin unclear — likely subagent residue; review then keep-or-delete).

## Unfinished work
Backlog: GC-005 (approval hardening) -> GC-015 (session ownership phase 2), GC-006 skills,
GC-007 anthropic converter, GC-008 air-gap, GC-009 multi-agent, GC-010 audit/KDF,
GC-012 hygiene (+ dedupe sanitize.ts vs orchestrator sanitizer). See TASKS.md.

## Known bugs (top severity — full list in AUDITS file)
- ~~Memory-poisoning persistence chain (facts/extraction/vector -> raw system prompt) [GC-014]~~ DONE 2026-08-25 (residual: retrieval.ts read-side label pending)
- ~~Approval promise hangs forever holding concurrency slot [GC-005]~~ DONE 2026-08-25 (channel path fixed; CLI chat.ts path still TTL-less — follow-up)
- Skills loader dir->executable at boot; frontmatter env override; quote breakout [GC-006]
- Anthropic adapter invalid wire format (caller field, per-row tool_results) [GC-007]
- Sessions still client-asserted on key-path WS + memory tools accept arbitrary sessionId [GC-015]

## Known risks
- Webchat = single global session. Air-gap claim FALSE as shipped. OpenRouter free-alias fans
  conversation to <=15 third-party backends.

## Tests
Typecheck PASS post-wave-1. Targeted: llm+agent+auth.integration = 34/34 green.
Full vitest/e2e/build: UNKNOWN on current tree (see TEST_STATUS.md).

## Next recommended action
1) Owner approves wave-1 commit (+ push). 2) Dispatch wave 2: GC-005, GC-014, GC-013.
