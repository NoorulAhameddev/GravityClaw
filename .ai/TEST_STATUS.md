# TEST STATUS — snapshot 2026-08-24 (post remediation wave 1)

## Verified this session (current tree, incl. wave-1 fixes)
| Check | Result | Evidence |
|---|---|---|
| Root `npm run typecheck` | PASS (multiple runs; latest after GC-001..004) | orchestrator verification |
| Scoped tsc sdk/gravityclaw-client | PASS exit 0 | Tomás report |
| Scoped tsc dashboard/tsconfig.app.json | PASS exit 0 | Tomás report |
| Targeted vitest: llm, agent, auth.integration | **34/34 pass** post-wave-1 | orchestrator verification |
| Targeted vitest (sprint era): skills, queue-lifecycle, backup-verify, tool-executor | green | team-sprint inspection |
| Targeted vitest: `src/__tests__/concurrency.test.ts` (GC-013) | **11/11 pass** x5 runs (~0.9s) | `.ai/sessions/2026-08-25-gc013-concurrency-tests.md` |
| Targeted vitest: memory suites + llm (GC-014, 2026-08-25) | **36/36 pass**: markdown-memory 8, supabase-memory 4, auto-dream 4, auto-dream-extended 4, evolution 6, shared-memory-sync 2, llm 8; `npm run typecheck` PASS | `.ai/sessions/2026-08-25-gc014-memory-sanitization.md` |

## Environmental gotcha (RESOLVED)
`.env` UNRESTRICTED_ACCESS was `true` (short-circuited approval gate -> false failures).
Now set to `false` (GC-000). Tests no longer need the env override, but the invocation
remains safe to use:
```powershell
$env:UNRESTRICTED_ACCESS='false'; npx vitest run --config config/vitest.config.ts <file>
```

## UNKNOWN / not verified on current tree
- Full `npx vitest run` suite (67 files)
- Playwright e2e (11 specs)
- `npm run build` (esbuild bundle) after wave 1
- Live-provider behavior (anthropic/google legs expected broken per audit C-1/C-2/H-4 -> GC-007)
- Concurrency module unit tests SHIPPED (GC-013 done 2026-08-25; metrics gap noted: slot-parked callers invisible to getQueuedAgentCount)

## Known noise
- Broken skills/* junction warnings during git ops: cosmetic, ignore.
- `.kilo/worktrees/distinct-mistake/` contains stale copy globbed by some vitest runs -> duplicate
  old tests. Cleanup tracked as GC-012. If you see impossible test failures, suspect this first.

## CI parity command
`npm run ci` == typecheck && lint && test:run && build.
NOTE: ci.yml docker job now FAILS the build on CRITICAL/HIGH Trivy findings (intentional gate).
