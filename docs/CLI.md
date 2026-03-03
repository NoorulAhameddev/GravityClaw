# Gravity Claw CLI Documentation

## Overview

The Gravity Claw CLI provides a production-grade command-line interface for managing and interacting with your AI agent. It features color-coded output, interactive commands, and comprehensive diagnostics.

## Installation

The CLI is included with Gravity Claw. After installing dependencies with `npm install`, you can use it via:

```bash
npm run cli -- [command] [options]
```

Or, after linking the package globally:

```bash
npm link
gravityclaw [command] [options]
```

## Commands Reference

### `start` - Start Services

Start all Gravity Claw services including channels (Telegram, WhatsApp, WebChat), the agent loop, and schedulers.

```bash
gravityclaw start
# or just
gravityclaw
```

This is the default command. It:
- Initializes the database
- Registers all tools
- Starts all configured channels
- Begins heartbeat monitoring
- Enables daily recommendations

### `chat` - Interactive Mode

Launch an interactive REPL (Read-Eval-Print Loop) for direct conversation with your agent.

```bash
gravityclaw chat [options]
```

**Options:**
- `--session <id>` - Use a specific session ID
- `--verbose` - Show detailed output including tool calls

**In-chat commands:**
- `clear` - Clear the current session history
- `exit` or `quit` - Exit chat mode

**Example:**

```bash
# Start a new chat
gravityclaw chat

# Resume an existing session
gravityclaw chat --session my-project-123

# Verbose mode (shows tool calls)
gravityclaw chat --verbose
```

**Features:**
- Colored output (respects `NO_COLOR` environment variable)
- Real-time agent responses
- Session persistence
- Progress indicators

### `doctor` - Health Check

Run comprehensive diagnostic checks on your Gravity Claw installation.

```bash
gravityclaw doctor
```

**Checks performed:**

1. **Environment Configuration**
   - Required environment variables
   - Optional API keys
   - Provider-specific settings

2. **Database**
   - SQLite file exists
   - Tables present
   - Session count

3. **Tools Registry**
   - Tool count
   - Registration status

4. **LLM Provider**
   - Provider configuration
   - API key validation
   - Model settings

5. **File Paths**
   - Skills directory
   - Memory files
   - Logs directory

6. **Runtime**
   - Node.js version check
   - Platform information

**Exit codes:**
- `0` - All checks passed
- `1` - Errors found (configuration required)

### `config` - View Configuration

Display your current Gravity Claw configuration.

```bash
gravityclaw config
```

**Output sections:**

1. **Core Settings**
   - LLM provider and model
   - Max iterations
   - Log level

2. **Channels**
   - Telegram status
   - WhatsApp status

3. **Features**
   - Enabled optional features
   - Provider configurations

### `tools` - List Tools

Display all registered tools organized by category.

```bash
gravityclaw tools
```

**Output:**
- Tools grouped by category (e.g., memory, voice, automation)
- Tool name and description
- Total count

**Example output:**
```
🛠️  Available Tools

Memory
  save_fact            Save a fact to long-term memory
  recall_facts         Recall saved facts
  ...

Voice
  text_to_speech       Convert text to speech
  ...

Total: 42 tools available
```

### `sessions` - Session Management

Manage conversation sessions stored in the database.

```bash
gravityclaw sessions <action> [session-id]
```

**Actions:**

#### `list` - List Sessions

Show all sessions with message counts and last activity.

```bash
gravityclaw sessions list
```

Displays the 20 most recent sessions.

#### `clear` - Clear Session

Delete all messages from a specific session.

```bash
gravityclaw sessions clear <session-id>
```

Requires confirmation before deletion.

#### `export` - Export Session

Export session messages to JSON format.

```bash
gravityclaw sessions export <session-id>

# Save to file
gravityclaw sessions export <session-id> > backup.json
```

**Export format:**
```json
{
  "sessionId": "cli-123",
  "exportDate": "2026-03-03T...",
  "messageCount": 42,
  "messages": [
    {
      "role": "user",
      "content": "Hello",
      "timestamp": "2026-03-03T..."
    },
    ...
  ]
}
```

### `version` - Show Version

Display version information and system details.

```bash
gravityclaw version
# or
gravityclaw -v
gravityclaw --version
```

**Output:**
- Package version
- Node.js version
- Platform and architecture

### `help` - Show Help

Display comprehensive help information.

```bash
gravityclaw help
# or
gravityclaw --help
gravityclaw -h
```

## Global Options

These options work with any command:

- `--help`, `-h` - Show help for the command
- `--version`, `-v` - Show version information
- `--verbose` - Enable verbose output (where supported)
- `--session <id>` - Specify session ID (for chat command)

## Examples

### Development Workflow

```bash
# Check system health
gravityclaw doctor

# View configuration
gravityclaw config

# List available tools
gravityclaw tools

# Start interactive chat
gravityclaw chat --session dev-work

# Export session for backup
gravityclaw sessions export dev-work > my-session.json
```

### Production Deployment

```bash
# Run diagnostics
gravityclaw doctor

# Start all services
gravityclaw start
```

### Session Management

```bash
# List all sessions
gravityclaw sessions list

# Export important sessions
gravityclaw sessions export important-123 > backups/important.json
gravityclaw sessions export project-456 > backups/project.json

# Clear old sessions
gravityclaw sessions clear old-session-789
```

## Color Output

The CLI uses ANSI color codes for better readability:

- 🟢 Green - Success messages
- 🔴 Red - Errors
- 🟡 Yellow - Warnings
- 🔵 Blue - Information
- 🔵 Cyan - Highlights and titles

To disable colors, set the `NO_COLOR` environment variable:

```bash
NO_COLOR=1 gravityclaw doctor
```

## Troubleshooting

### "Unknown command" error

Make sure you're using the correct command name. Run `gravityclaw help` to see all available commands.

### Database errors

Run `gravityclaw doctor` to check database connectivity. The database file `gravity.db` should exist in your project root.

### Missing API keys

Run `gravityclaw doctor` to see which API keys are missing. Configure them in your `.env` file.

### TypeScript/compilation errors

Run `npm run typecheck` to check for TypeScript errors before using the CLI.

## Advanced Usage

### Custom Session IDs

Use meaningful session IDs for better organization:

```bash
gravityclaw chat --session "project-Alpha-2026-03"
gravityclaw chat --session "research-quantum-computing"
gravityclaw chat --session "debug-issue-42"
```

### Batch Session Export

Export multiple sessions:

```bash
# PowerShell
gravityclaw sessions list | ForEach-Object { 
  if ($_ -match "Session ID: (\S+)") {
    gravityclaw sessions export $matches[1] > "exports/$($matches[1]).json"
  }
}
```

### Integration with Other Tools

Pipe CLI output to other commands:

```bash
# Count tools
gravityclaw tools | Select-String "Total:"

# Export and compress session
gravityclaw sessions export my-session | gzip > session.json.gz

# Check for errors in doctor output
gravityclaw doctor | Select-String "error" -CaseSensitive
```

## Environment Variables

The CLI respects these environment variables:

- `NO_COLOR` - Disable color output
- `LOG_LEVEL` - Set logging verbosity (debug, info, warn, error)
- All Gravity Claw configuration variables from `.env`

## See Also

- [Main README](../README.md) - Project overview
- [Configuration Guide](ENCRYPTED_SECRETS.md) - Environment setup
- [Contributing Guide](../CONTRIBUTING.md) - Development guidelines
