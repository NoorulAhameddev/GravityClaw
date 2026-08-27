# SESSION — 2026-08-25 — GC-013 concurrency unit tests (Maya role)

## What
Created `src/__tests__/concurrency.test.ts` (only file added; source untouched).
11 deterministic tests, no arbitrary sleeps; manual gate promises + `vi.waitFor`.
Suite: 11/11 green across 5 consecutive runs (~0.9s each). `npm run typecheck` PASS.

## Coverage map
1. Same-key: 2nd call starts strictly after 1st fully settles (event-order proof);
   3-call strict FIFO arrival order with intermediate gates.
2. Cross-key parallelism: two gated calls both running before either resolves.
3. Global cap: fill MAX_CONCURRENT (=10 from live config) with gated fns; excess call
   parks (queued=1 at enqueue sync-tick, fn not started after ticks); release one slot
   -> parked call admitted while held-gated proves slot handoff.
4. Queue-cap rejection: REAL simulation of MAX_QUEUED=1000 via same-key chaining
   behind a gated head (cross-key overflow parks invisibly and does NOT count toward
   pendingCount). Call #1001 rejected with exact 'Service Unavailable' message;
   head release drains all 1000 in order.
5. clearSessions: queued same-key caller rejects with shutdown error; RUNNING fn
   result still resolves. Saturated variant: slot-parked caller rejects; all active
   fns finish normally.
6. Refcount sanity: max active + 2*max overflow burst drains to exactly {active:0,
   queued:0}, status.max === config.AGENT_MAX_CONCURRENT; runWithLimit smoke test.
7. Error propagation: throwing fn rejects caller; same-key successor still runs;
   mid-chain failure does not wedge later chained calls.

## Findings (no fixes applied — read-only mandate)
- GAP (metrics): callers parked in the global slotQueue are invisible to
  getQueuedAgentCount() (pendingCount decrements when their session tail fires,
  before acquireSlot parks them) AND not counted in activeCount. During saturation
  status shows {active:10, queued:0} while a request waits. Cosmetic/observability
  gap, not a correctness bug.
- NOTE: pendingCount only accumulates for same-key-chained waiters whose tails have
  not fired; documented in test 4 comments-free design + this archive.
- Suspected theoretical over-admission race (fresh caller checks activeCount < max
  in the window between releaseSlot decrementing and a woken waiter re-incrementing)
  was NOT triggered by any test; left unverified/unfixed.
- Test-authoring trap found & fixed during iteration: an instantly-resolving gated
  fn makes "active === max" assertions racy (fn finishes and releases before the
  assertion reads the counter). Gate held work when asserting occupancy.

## Evidence
- `$env:UNRESTRICTED_ACCESS='false'; npx vitest run --config config/vitest.config.ts src/__tests__/concurrency.test.ts`
  -> `Tests 11 passed (11)`, Duration ~872-980ms, repeated x5.
- `npm run typecheck` -> exit 0 (one intermediate TS2554 fixed in test file only).

## TASKS.md
GC-013 -> DONE with evidence pointer.
