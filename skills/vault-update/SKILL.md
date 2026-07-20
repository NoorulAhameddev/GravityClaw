# vault-update — Session Vault Sync Skill

## Purpose
Auto-update Obsidian vault with session summary at session end.

## When to Activate
- User says "vault", "update vault", "sync vault", "end session"
- Before session close (user triggers manually)

## Workflow

### Step 1: Get Session Context
Ask user:
- What project worked on?
- What accomplished?
- Any decisions made?
- Next steps?

### Step 2: Update Vault Files
Write to:
- `D:\Projects\Zed\1-Daily\YYYY-MM-DD.md` — session summary
- `D:\Projects\Zed\9-Decisions\sessions\[slug].md` — full session log
- Project file in `2-Projects/` — update if major milestone

### Step 3: Update Vault Context
Edit `vault-context.md`:
- Update "Last sync" timestamp
- Update active project status if changed

## Anti-Patterns to Avoid
- Skipping if "nothing major happened" — every session has value
- Writing overly long summaries — keep daily note under 10 lines
- Forgetting to update project file for big changes

## Output
When complete, you should have:
- ✅ Daily note created/updated
- ✅ Session archive created
- ✅ Vault context updated
- ✅ Confirm to user what was done
