---
name: checkpoint
description: Save verification state for later resume. USE before stopping work or when requested.
origin: ECC
---

# Checkpoint Command

This command saves the current verification state so work can be resumed later.

## What This Command Does

1. **Capture state** — Save current implementation status
2. **Store criteria** — Save verification criteria and progress
3. **Save context** — Store relevant context for resume

## When to Use

Use `/checkpoint` when:

- Before stopping work for the day
- When asked to save state
- Before context compaction
- When switching tasks

## Checkpoint State

```json
{
  "id": "checkpoint-001",
  "created_at": "2024-01-15T10:30:00Z",
  "feature": "User Authentication",
  "phase": "Phase 2: Login Implementation",
  "criteria": [
    { "name": "User can register", "status": "passed" },
    { "name": "User can login", "status": "pending" },
    { "name": "Token validation", "status": "pending" }
  ],
  "toolCallCount": 47,
  "notes": "Need to fix token response in login endpoint"
}
```

## Example Usage

```
User: /checkpoint

Agent:
# Checkpoint Saved

## Checkpoint: checkpoint-001

| Field | Value |
|-------|-------|
| Feature | User Authentication |
| Phase | Phase 2: Login Implementation |
| Progress | 1/3 criteria passed |
| Tool Calls | 47 |
| Notes | Need to fix token response |

✓ Checkpoint saved to .checkpoint.json
✓ Can resume with: /verify or continue work
```

## Related Commands

- `/verify` - Resume verification
- `/plan` - Plan implementation
