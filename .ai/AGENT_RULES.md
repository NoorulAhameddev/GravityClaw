# AGENT RULES — universal contract for every AI agent on GravityClaw

Applies to: Claude Code, OpenCode, Codex, Antigravity, Hermes, ChatGPT reviewers, any replacement agent.

## Mandatory sequence per session
1. Read `.ai/AGENT_RULES.md` (this file), `.ai/CURRENT_STATE.md`, `.ai/TASKS.md`, `.ai/HANDOFF.md`.
2. `git status` + `git log --oneline -10` + `git diff` before touching anything.
3. Claim your task in `.ai/TASKS.md` (owner + IN_PROGRESS) BEFORE working.
4. Work within the ownership map (`docs/team/ENGINEERING_ORG.md`) — do not edit another
   role's files without coordination note in HANDOFF/sessions.
5. After changes: `npm run typecheck` minimum; targeted vitest for touched subsystems;
   set `UNRESTRICTED_ACCESS=false` when testing approval paths.
6. Update `.ai/CURRENT_STATE.md` + `.ai/TASKS.md`; write `.ai/sessions/<date>-<slug>.md`
   with what/why/evidence.
7. Create/update `.ai/HANDOFF.md` before ending — assume you will not return.

## Hard constraints (project-specific)
- NEVER enable `UNRESTRICTED_ACCESS=true` except a single deliberate experiment; restore immediately. Treat finding it `true` as an incident to report.
- Never read `process.env` directly outside `src/config.ts` (Zod contract).
- Security-touching files (skills/loader, executor, auth/*, websocket-auth, path-validator,
  command-validator, secrets*, audit/*) require Priya-role review per two-person list in ENGINEERING_ORG.md.
- Do not commit unless the owner explicitly approved the checkpoint (standing rule this workspace).
- PowerShell gotchas: quote `'stash@{0}'`-style refs single-quoted; broken skills/* junction
  warnings during git ops are cosmetic noise.
- Tests may hit a stale duplicate tree under `.kilo/worktrees/` — see TEST_STATUS.md before
  chasing phantom failures.

## Continuity rules
- Anything important goes in the repo, never only in conversation.
- Never rewrite architecture without reading `.ai/DECISIONS.md` first.
- Distinguish pre-existing failures from regressions; record both in TEST_STATUS.md.
- If context/token limits approach: stop new work -> smallest safe unit -> update state files ->
  HANDOFF.md -> validation -> propose checkpoint commit.

## Replacement-agent bootstrap order
AGENT_RULES -> PROJECT -> CURRENT_STATE -> TASKS -> ARCHITECTURE -> DECISIONS ->
TEST_STATUS -> HANDOFF -> git status/history -> relevant sources. Then VERIFY claims
against the repository independently. Handoff = what previous agent BELIEVED; repo+tests = truth.
