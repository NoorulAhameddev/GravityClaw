# Shared Memory Contract

GravityClaw now owns the shared memory automation for all four coding agents working in `D:\Projects`.

## Architecture

- Obsidian vault is the canonical long-term memory
- `D:\Projects\.ai_memory` is the machine-readable operational memory
- GravityClaw sync scripts keep the repo-local state mirrored into Obsidian

## Files

- `D:\Projects\.ai_memory\registry.json`
- `D:\Projects\.ai_memory\session-state.json`
- `D:\Projects\.ai_memory\handoffs.jsonl`
- `D:\Projects\.ai_memory\decisions.jsonl`
- `D:\Projects\.ai_memory\projects\gravityclaw.json`
- `D:\Projects\.ai_memory\projects\aegis-ai.json`

## Commands

```bash
npm run shared-memory:init
npm run shared-memory:sync
npm run shared-memory:daemon
```

## Protocol

At session start, every agent should read:

1. `vault-context.md`
2. `0-Inbox/session-state.md`
3. `.ai_memory/registry.json`
4. `.ai_memory/session-state.json`
5. Recent entries in `.ai_memory/handoffs.jsonl`

During the session:

- update `.ai_memory/session-state.json`
- append durable decisions to `.ai_memory/decisions.jsonl`

At session end:

- append a compact handoff to `.ai_memory/handoffs.jsonl`
- mirror `.ai_memory/session-state.json` into Obsidian `0-Inbox/session-state.md`
