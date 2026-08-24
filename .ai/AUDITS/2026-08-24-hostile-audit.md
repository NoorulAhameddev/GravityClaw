# Hostile Audit Synthesis — 2026-08-24

11-prompt adversarial sweep executed against tree @ 6251960 + team-sprint uncommitted changes.
Method: 10 parallel read-only audit agents (loop, tools, LLM router, memory, multi-agent, identity,
plugins/skills, injection, air-gap, recon) + this synthesis. Verdict basis preserved here so no
future agent needs the original session.

## VERDICT: DO-NOT-APPROVE for production / multi-user (DEC-GC-003)

## Top systemic risks (ranked)
1. No data/instruction boundary: facts/MEMORY.md/attachments/plans/tool-output concatenated raw into
   system prompt -> memory poisoning = PERSISTENT hijack (survives restarts).
2. Live `.env` UNRESTRICTED_ACCESS=true disarms approvals + path validation (GC-000).
3. Identity layer absent: one shared API key; client-asserted sessions (?session=, body sessionId,
   token minting accepts arbitrary sid/uid); ws.auth never consulted; unconditional WS localhost bypass;
   JWT signed WITH the API key; tokens in URLs; raw apiKey persisted to audit_log.actor_id.
4. Skills loader RCE-adjacent: any skills/*.md becomes child-process tool at boot; frontmatter env
   merges OVER allowlist (NODE_OPTIONS/PYTHONPATH/LD_PRELOAD pass); quote-breakout arg injection;
   approval shows opaque tool name only.
5. Sanitizer breaks agent while under-defending: every tool result mangled pre-storage (code fences
   stripped, verbs -> [FILTERED]) -> confused-retry amplification; facts/vector/extraction paths raw.
6. Per-session serialization nonexistent: concurrent same-session messages corrupt history/spill files.
7. Failover = availability theater: anthropic leg invalid wire format (synthetic `caller` field,
   per-row tool_result turns, empty-content arrays => 400s); google leg dead (`role:'function'`);
   ollama/openrouter silently strip tools (provider switch changes WHAT RUNS); per-session override
   rebuilds breaker/cache each call; worst-case ~1620 HTTP attempts.
8. Multi-agent grants host privileges with fresh budgets: mesh tasks inherit full registry incl.
   scheduler/webhook/admin (persistent workloads escape scope); cost limits reset per fresh task id;
   swarm/decompose bypass rate limiter+usage; silent task loss when wave > maxParallelTasks;
   aggregate_results reads ANY session's last assistant message (no lineage check).
9. Air-gap claim FALSE as shipped (fetch-only patch; MCP child procs; dead provider forcing).
10. Reliability debt: approval promise hangs forever holding slot (10 ignored = runtime DoS);
    dangling tool_calls at budget pressure => strict-provider 400s; microcompact matches zero tools;
    prune data-loss race; queue recovery ignores attempts (cross-restart crash loop);
    workflows stranded status='running'.

## Confirmed attack chains (default config)
- Injection -> write_file payload.js (silent) -> run_shell "echo ok\nnode ./payload.js" -> deceptive y/n -> RCE+env exfil.
- npm install <pkg> lifecycle-script RCE passes validator today.
- search_files boolean oracle brute-forces .env with ZERO approvals.
- execute_code dumps process.env after one y/n.
- browser_navigate SSRF via redirect/DNS rebinding to cloud metadata (no post-validation).
- Cross-session: sessions_grant_permission(self-subvertible) -> sessions_history exfil; send as 'system'.
Live-config chains are strictly worse (zero-friction variants incl. WS localhost tool_call without key).

## Production-blocker fix order (= TASKS.md GC-001..GC-010)
0 UNRESTRICTED_ACCESS=false | 1 sanitizer redesign | 2 server-side sessions+ownership |
3 per-session mutex | 4 tool_call atomicity/history trim | 5 approval TTL/queue/display/identity |
6 skills hardening | 7 anthropic converter+capability filtering | 8 socket-level air-gap |
9 multi-agent allowlists/budgets/splice/lineage | 10 audit trail + scrypt KDF.

## Genuine strengths (verified — do not regress these)
Bounded iteration/tool budgets correctly enforced · generation strictly separated from execution
(NO duplicate side effects across failover/retry) · graph store properly session-scoped ·
Retry-After implementation sound (recent addition verified) · Zod config exits on misconfiguration ·
path validation solid when enabled · mesh DAG real cycle detection + deadlock guard · CLI mature.

## Team-sprint fixes verified correct in audits
Rate-limit pause notices, rejected-allSettled synthesis, shutdown drain, queue startup sweep
(caveat: sweep ignores attempt count -> cross-restart crash-loop risk, tracked inside GC-004/GC-009 scope),
skills env-allowlist + requiresApproval (partial mitigation of #4), Trivy gate, nginx OSS fix,
SDK honesty (501s), backup path resolution.
