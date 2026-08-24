# TEST STATUS — snapshot 2026-08-24

## Verified this session (current tree, incl. uncommitted team sprint)
| Check | Result | Evidence |
|---|---|---|
| Root `npm run typecheck` | PASS (multiple runs, latest after all team edits) | orchestrator verification |
| Scoped tsc sdk/gravityclaw-client | PASS exit 0 | Tomás report |
| Scoped tsc dashboard/tsconfig.app.json | PASS exit 0 | Tomás report |
| Targeted vitest: skills, queue-lifecycle, backup-verify, tool-executor, agent, auth.integration | 86/88 pass; 2 failures = environmental ONLY | see below |

## Environmental gotcha (IMPORTANT)
Local `.env` has `UNRESTRICTED_ACCESS=true`, which short-circuits the approval gate ->
tool-executor approval tests fail BY CONFIGURATION, not by regression.
Correct invocation:
```powershell
$env:UNRESTRICTED_ACCESS='false'; npx vitest run src/__tests__/tools/tool-executor.test.ts
# -> 8/8 pass
```

## UNKNOWN / not verified on current tree
- Full `npx vitest run` suite (67 files)
- Playwright e2e (11 specs)
- `npm run build` after team sprint (esbuild bundle)
- Live-provider behavior (anthropic/google legs expected broken per audit C-1/C-2/H-4)

## Known noise
- Broken skills/* junction warnings during git ops: cosmetic, ignore.
- `.kilo/worktrees/distinct-mistake/` contains stale copy globbed by some vitest runs -> duplicate
  old tests. Cleanup tracked as GC-012. If you see impossible test failures, suspect this first.

## CI parity command
`npm run ci` == typecheck && lint && test:run && build.
NOTE: ci.yml docker job now FAILS the build on CRITICAL/HIGH Trivy findings (intentional gate).
