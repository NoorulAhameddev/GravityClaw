# Gravity Claw Hooks

Hooks are event-driven automations that fire before or after tool executions. They enforce code quality, catch mistakes early, and automate session management.

## How Hooks Work

```
User request → Tool selection → PreToolUse hook → Tool executes → PostToolUse hook → Response → Stop hook
```

- **PreToolUse** — Runs before tool execution. Can block (exit 2) or warn.
- **PostToolUse** — Runs after tool completes. Analyzes output, cannot block.
- **Stop** — Runs after each Claude response.
- **SessionStart/SessionEnd** — Session lifecycle boundaries.
- **PreCompact** — Runs before context compaction.

## Hooks Configuration

Defined in `hooks/hooks.json`:

### PreToolUse Hooks

| Hook | Matcher | Purpose |
|------|---------|---------|
| pre-bash.js | Bash | Block dev server outside tmux, warn about long commands |
| pre-write.js | Write | Warn about non-standard file types |
| pre-compact.js | Edit/Write | Suggest manual compaction at intervals |

### PostToolUse Hooks

| Hook | Matcher | Purpose |
|------|---------|---------|
| post-bash.js | Bash | Analyze build output (async) |
| post-edit.js | Edit/Write | Quality checks after edits |

### Lifecycle Hooks

| Hook | Event | Purpose |
|------|-------|---------|
| session-start.js | SessionStart | Load previous session context |
| session-end.js | SessionEnd | Save session state |
| pre-compact.js | PreCompact | Save state before compaction |
| stop-session-summary.js | Stop | Session summary |

## Hook Scripts

All scripts in `scripts/hooks/` implement the hook protocol:

```javascript
// Receive tool input as JSON on stdin
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  const data = JSON.parse(input);
  
  // Access tool info
  const toolName = data.tool_name;
  const toolInput = data.tool_input;
  
  // Warn (non-blocking): write to stderr
  console.error('[Hook] Warning message');
  
  // Block (PreToolUse only): exit with code 2
  // process.exit(2);
  
  // Pass through original data
  console.log(input);
});
```

## Hook Input Schema

```typescript
interface HookInput {
  tool_name: string;          // "Bash", "Edit", "Write", etc.
  tool_input: {
    command?: string;         // Bash: the command
    file_path?: string;        // Edit/Write/Read: target file
    old_string?: string;      // Edit: text being replaced
    new_string?: string;      // Edit: replacement text
    content?: string;         // Write: file content
  };
  tool_output?: {
    output?: string;          // PostToolUse: command output
  };
}
```

## Runtime Controls

Environment variables control hook behavior:

```bash
# Hook strictness: minimal | standard | strict (default: standard)
export GRAVY_HOOK_PROFILE=standard

# Disable specific hooks (comma-separated)
export GRAVY_DISABLED_HOOKS="pre:bash:tmux-reminder,post:edit:typecheck"
```

### Profiles

- **minimal** — Essential lifecycle hooks only
- **standard** — Balanced quality + safety checks
- **strict** — Additional reminders and guardrails

## State File

Hooks maintain state in `.hooks-state.json`:

```json
{
  "lastSessionId": "abc123...",
  "toolCallCount": 47,
  "lastCompaction": 0,
  "pendingPatterns": []
}
```

## Extending Hooks

### Add New Hook

1. Create script in `scripts/hooks/`
2. Add entry to `hooks/hooks.json`
3. Test with actual tool usage

### Example: Warn about large files

```javascript
// scripts/hooks/pre-write-size.js
const fs = require('fs');

let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  const data = JSON.parse(input);
  const content = data.tool_input?.content || '';
  const lines = content.split('\n').length;
  
  if (lines > 800) {
    console.error(`[Hook] BLOCKED: File has ${lines} lines (max 800)`);
    process.exit(2);
  }
  
  console.log(input);
});
```

## Related

- `skills/strategic-compact/` — Strategic compaction skill
- `skills/continuous-learning/` — Pattern extraction
- `AGENTS.md` — Agent instructions
