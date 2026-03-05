# GravityClaw Tools Reference

**Complete catalog of all 80+ tools available in GravityClaw**

---

## Overview

Tools are the agent's capabilities — functions the LLM can invoke to perform actions. All tools follow a standard interface and return results as strings (usually JSON). Tools are organized into categories based on their functionality.

### Tool Interface

Every tool implements:

```typescript
interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
  execute(input: Record<string, unknown>): Promise<string>;
}
```

### Context Injection

All tools automatically receive these fields:

- `__sessionId` - Current conversation session ID
- `__userId` - User identifier (if available)
- `__platform` - Channel platform (telegram, whatsapp, webchat)
- `__groupId` - Group identifier for group chats
- `__isGroup` - Boolean indicating group conversation

---

## Tool Categories

- [System Tools](#system-tools) - Core system operations
- [Memory Tools](#memory-tools) - Knowledge persistence
- [Voice & TTS Tools](#voice--tts-tools) - Audio processing
- [Browser Automation](#browser-automation) - Web interaction
- [Communication Tools](#communication-tools) - Messaging
- [Multi-Agent Tools](#multi-agent-tools) - Agent coordination
- [Dashboard & UI Tools](#dashboard--ui-tools) - Web interface
- [Security Tools](#security-tools) - Security operations
- [Backup Tools](#backup-tools) - Data backup/restore
- [Export Tools](#export-tools) - Data export
- [Scheduler Tools](#scheduler-tools) - Task scheduling
- [Webhook Tools](#webhook-tools) - External integration
- [MCP Tools](#mcp-bridge-tools) - Model Context Protocol
- [Skills Tools](#skills-tools) - Skill management
- [Heartbeat Tools](#heartbeat-tools) - Proactive updates
- [Observability Tools](#observability-tools) - Monitoring
- [Rate Limiting Tools](#rate-limiting-tools) - Rate management
- [Admin Tools](#admin-tools) - Administrative functions

---

## System Tools

### `get_current_datetime`

Get current date and time with timezone support.

**Input Schema:**
```json
{
  "timezone": "string (optional, e.g., 'America/New_York')"
}
```

**Returns:** Current timestamp, date, time, day of week, timezone

### `execute_shell_command`

Execute shell commands with safety restrictions.

**Input Schema:**
```json
{
  "command": "string (required)",
  "timeout_ms": "number (optional, default: 30000)"
}
```

**Returns:** Command output, exit code, and execution time

**Security**: Commands are validated; dangerous operations require confirmation.

### `file_read`

Read file contents.

**Input Schema:**
```json
{
  "file_path": "string (required)"
}
```

**Returns:** File contents or error

**Security**: Path must be within allowed directories (see `PATH_ALLOWLIST`).

### `file_write`

Write content to file.

**Input Schema:**
```json
{
  "file_path": "string (required)",
  "content": "string (required)",
  "mode": "'overwrite' | 'append' (optional, default: 'overwrite')"
}
```

**Returns:** Success confirmation with file size

### `file_delete`

Delete a file.

**Input Schema:**
```json
{
  "file_path": "string (required)"
}
```

**Returns:** Success confirmation

### `file_list`

List files in directory.

**Input Schema:**
```json
{
  "directory_path": "string (required)",
  "recursive": "boolean (optional, default: false)"
}
```

**Returns:** Array of files and directories

### `search_attachments`

Search uploaded attachments (images, documents, audio).

**Input Schema:**
```json
{
  "query": "string (optional, searches by filename)",
  "type": "'image' | 'document' | 'audio' | 'all' (optional)",
  "session_id": "string (optional, defaults to current session)"
}
```

**Returns:** List of matching attachments with paths and metadata

---

## Memory Tools

### `save_memory_fact`

Store a long-term fact in markdown memory.

**Input Schema:**
```json
{
  "category": "string (required, e.g., 'preferences', 'contacts')",
  "fact": "string (required, the fact to store)"
}
```

**Returns:** Confirmation of storage

**Example:**
```json
{
  "category": "preferences",
  "fact": "User prefers dark mode and TypeScript over JavaScript"
}
```

### `recall_memory_facts`

Retrieve facts from markdown memory.

**Input Schema:**
```json
{
  "category": "string (optional, filter by category)",
  "query": "string (optional, search term)"
}
```

**Returns:** Matching facts from memory

### `save_entity`

Store an entity in the knowledge graph.

**Input Schema:**
```json
{
  "name": "string (required, entity name)",
  "type": "string (required, e.g., 'person', 'company', 'project')",
  "attributes": "object (optional, key-value pairs)"
}
```

**Returns:** Entity ID and confirmation

### `save_relationship`

Create a relationship between entities.

**Input Schema:**
```json
{
  "from_entity": "string (required, entity name)",
  "relationship_type": "string (required, e.g., 'works_for', 'created')",
  "to_entity": "string (required, entity name)"
}
```

**Returns:** Relationship confirmation

### `query_graph`

Query the knowledge graph with Cypher-like syntax.

**Input Schema:**
```json
{
  "query": "string (required, e.g., 'MATCH (p:person) WHERE p.role = engineer RETURN p')"
}
```

**Returns:** Query results

### `search_memory_semantic`

Semantic search across conversation history using embeddings.

**Input Schema:**
```json
{
  "query": "string (required)",
  "limit": "number (optional, default: 5)",
  "threshold": "number (optional, 0-1, default: 0.7)"
}
```

**Returns:** Relevant past conversations and context

**Requires**: OpenAI API key for embeddings

### `web_search`

Search the web using configured provider (DuckDuckGo, SerpAPI, or Brave).

**Input Schema:**
```json
{
  "query": "string (required)",
  "num_results": "number (optional, default: 5)"
}
```

**Returns:** Search results with titles, URLs, and snippets

**Configuration**: Set `SEARCH_PROVIDER` in .env

### `supabase_sync`

Sync memory to Supabase cloud storage.

**Input Schema:**
```json
{
  "operation": "'push' | 'pull' | 'status' (required)"
}
```

**Returns:** Sync status and confirmation

**Requires**: `SUPABASE_URL` and `SUPABASE_KEY` configured

---

## Voice & TTS Tools

### `transcribe_audio`

Transcribe audio file to text using OpenAI Whisper.

**Input Schema:**
```json
{
  "file_path": "string (required)",
  "language": "string (optional, ISO-639-1 code, e.g., 'en', 'es')"
}
```

**Returns:** Transcribed text

**Supported Formats**: mp3, mp4, mpeg, mpga, m4a, wav, webm (max 25MB)

### `text_to_speech`

Convert text to speech using OpenAI TTS.

**Input Schema:**
```json
{
  "text": "string (required, max 4096 chars)",
  "voice": "'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' (optional)"
}
```

**Returns:** Audio file path

### `elevenlabs_tts`

High-quality TTS using ElevenLabs.

**Input Schema:**
```json
{
  "text": "string (required)",
  "voice_id": "string (optional, default from ELEVENLABS_VOICE_ID)"
}
```

**Returns:** Audio file path

**Requires**: `ELEVENLABS_API_KEY` configured

### `list_elevenlabs_voices`

List available ElevenLabs voices.

**Input Schema:** None

**Returns:** Array of voice objects with IDs and names

### `set_voice_settings`

Configure voice preferences per session.

**Input Schema:**
```json
{
  "provider": "'openai' | 'elevenlabs' (optional)",
  "voice_id": "string (optional)",
  "auto_tts": "boolean (optional, auto-generate speech for responses)"
}
```

**Returns:** Updated settings

### `wake_word_enable`

Enable wake word detection (desktop only).

**Input Schema:**
```json
{
  "wake_phrase": "string (optional, default: 'hey claw')",
  "threshold": "number (optional, 0-1, default: 0.75)"
}
```

**Returns:** Status confirmation

**Note**: Requires microphone access, works only on desktop environments.

### `wake_word_disable`

Disable wake word detection.

**Input Schema:** None

**Returns:** Status confirmation

### `talk_mode_enable`

Enable continuous voice conversation mode.

**Input Schema:** None

**Returns:** Status confirmation

**Note**: Automatically transcribes audio messages and generates TTS responses.

### `talk_mode_disable`

Disable talk mode.

**Input Schema:** None

**Returns:** Status confirmation

---

## Browser Automation

### `browser_navigate`

Navigate to a URL in headless browser.

**Input Schema:**
```json
{
  "url": "string (required)"
}
```

**Returns:** Page title and load status

### `browser_get_content`

Extract text content from current page.

**Input Schema:**
```json
{
  "selector": "string (optional, CSS selector for specific element)"
}
```

**Returns:** Page text content

### `browser_click`

Click an element on the page.

**Input Schema:**
```json
{
  "selector": "string (required, CSS selector)"
}
```

**Returns:** Click status

### `browser_fill_form`

Fill form fields.

**Input Schema:**
```json
{
  "selector": "string (required, form selector)",
  "data": "object (required, field names and values)"
}
```

**Returns:** Fill status

### `browser_screenshot`

Take a screenshot of the page.

**Input Schema:**
```json
{
  "full_page": "boolean (optional, default: false)"
}
```

**Returns:** Screenshot file path

---

## Communication Tools

### `send_message`

Send a message through a channel.

**Input Schema:**
```json
{
  "channel": "'telegram' | 'whatsapp' | 'webchat' (required)",
  "recipient": "string (required, user/chat ID)",
  "message": "string (required)"
}
```

**Returns:** Send status

### `broadcast_message`

Send message to multiple recipients.

**Input Schema:**
```json
{
  "channels": "array of strings (required)",
  "recipients": "array of strings (required)",
  "message": "string (required)"
}
```

**Returns:** Broadcast status with delivery count

---

## Multi-Agent Tools

### `spawn_agent`

Create a new agent instance for parallel execution.

**Input Schema:**
```json
{
  "role": "string (required, e.g., 'researcher', 'writer', 'analyst')",
  "task": "string (required, task description)",
  "context": "object (optional, shared context)"
}
```

**Returns:** Agent ID and status

**Use Cases**: Parallel research, multi-perspective analysis, complex workflows

### `aggregate_results`

Combine results from multiple agents.

**Input Schema:**
```json
{
  "agent_ids": "array of strings (required)",
  "aggregation_strategy": "'summarize' | 'merge' | 'compare' (optional)"
}
```

**Returns**: Aggregated results

---

## Dashboard & UI Tools

### `dashboard_create_widget`

Create a widget on the web dashboard.

**Input Schema:**
```json
{
  "type": "'chart' | 'table' | 'text' | 'metric' (required)",
  "title": "string (required)",
  "data": "object (required, widget-specific data)"
}
```

**Returns:** Widget ID

### `dashboard_update_widget`

Update existing widget.

**Input Schema:**
```json
{
  "widget_id": "string (required)",
  "data": "object (required)"
}
```

**Returns:** Update status

### `canvas_push`

Push live HTML/JS widget to Canvas interface.

**Input Schema:**
```json
{
  "html": "string (required)",
  "css": "string (optional)",
  "js": "string (optional)"
}
```

**Returns:** Push status

**See**: [docs/CANVAS.md](CANVAS.md) for Canvas system details

### `ui_admin_create_user`

Create dashboard user account.

**Input Schema:**
```json
{
  "username": "string (required)",
  "role": "'admin' | 'user' | 'viewer' (optional, default: 'user')"
}
```

**Returns:** User ID and credentials

---

## Security Tools

### `get_security_audit_log`

Retrieve security audit logs.

**Input Schema:**
```json
{
  "event_type": "'secret_access' | 'file_access' | 'all' (optional)",
  "limit": "number (optional, default: 100)",
  "since": "string (optional, ISO timestamp)"
}
```

**Returns:** Audit log entries

### `get_security_status`

Get overall security posture.

**Input Schema:** None

**Returns:** Security configuration status, enabled features, recommendations

### `rotate_secrets`

Trigger secret rotation for encrypted secrets.

**Input Schema:**
```json
{
  "secret_name": "string (optional, rotates specific secret or all if omitted)"
}
```

**Returns:** Rotation status

### `validate_path_access`

Check if path access is allowed.

**Input Schema:**
```json
{
  "path": "string (required)"
}
```

**Returns:** Validation result with allowed status

---

## Backup Tools

### `create_backup`

Create database backup.

**Input Schema:**
```json
{
  "compress": "boolean (optional, default: true)",
  "encrypt": "boolean (optional, default: false)"
}
```

**Returns:** Backup file path and metadata

### `restore_backup`

Restore from backup file.

**Input Schema:**
```json
{
  "backup_path": "string (required)"
}
```

**Returns:** Restore status

**Warning**: This overwrites the current database.

### `list_backups`

List available backups.

**Input Schema:**
```json
{
  "sort_by": "'date' | 'size' (optional, default: 'date')"
}
```

**Returns:** Array of backup files with metadata

### `delete_backup`

Delete a backup file.

**Input Schema:**
```json
{
  "backup_path": "string (required)"
}
```

**Returns:** Deletion status

### `get_backup_status`

Get backup system status.

**Input Schema:** None

**Returns:** Schedule, last backup time, storage usage

### `verify_backup`

Verify backup integrity.

**Input Schema:**
```json
{
  "backup_path": "string (required)"
}
```

**Returns:** Verification result

---

## Export Tools

### `export_chat_history`

Export conversation history.

**Input Schema:**
```json
{
  "session_id": "string (optional, defaults to current)",
  "format": "'json' | 'markdown' | 'txt' (optional, default: 'json')",
  "output_path": "string (optional)"
}
```

**Returns:** Export file path

### `export_memory`

Export markdown memory to file.

**Input Schema:**
```json
{
  "category": "string (optional, exports all if omitted)",
  "format": "'markdown' | 'json' (optional, default: 'markdown')",
  "output_path": "string (optional)"
}
```

**Returns:** Export file path

### `export_usage_stats`

Export usage statistics.

**Input Schema:**
```json
{
  "format": "'json' | 'csv' (optional, default: 'json')",
  "period": "'day' | 'week' | 'month' | 'all' (optional, default: 'all')"
}
```

**Returns:** Export file path with stats

### `export_graph`

Export knowledge graph.

**Input Schema:**
```json
{
  "format": "'json' | 'cypher' | 'graphml' (optional, default: 'json')",
  "output_path": "string (optional)"
}
```

**Returns:** Export file path

---

## Scheduler Tools

### `schedule_task`

Schedule recurring task using cron expressions or natural language.

**Input Schema:**
```json
{
  "name": "string (required)",
  "schedule": "string (required, cron expression or 'every day at 9am')",
  "prompt": "string (required, task to execute)"
}
```

**Returns:** Task ID and next run time

**Examples**:
- `"every day at 9am"` → Daily at 9 AM
- `"every Monday"` → Weekly on Monday
- `"0 */6 * * *"` → Every 6 hours

### `list_scheduled_tasks`

List all scheduled tasks.

**Input Schema:**
```json
{
  "include_disabled": "boolean (optional, default: false)"
}
```

**Returns:** Array of scheduled tasks

### `cancel_scheduled_task`

Cancel/delete a scheduled task.

**Input Schema:**
```json
{
  "task_id": "number (required)"
}
```

**Returns:** Cancellation status

### `enable_scheduled_task`

Enable a disabled task.

**Input Schema:**
```json
{
  "task_id": "number (required)"
}
```

**Returns:** Enable status

### `disable_scheduled_task`

Disable a task without deleting it.

**Input Schema:**
```json
{
  "task_id": "number (required)"
}
```

**Returns:** Disable status

---

## Webhook Tools

### `webhook_create`

Create webhook endpoint.

**Input Schema:**
```json
{
  "name": "string (required)",
  "method": "'GET' | 'POST' | 'PUT' | 'DELETE' (optional, default: 'POST')",
  "action": "string (required, prompt to execute on webhook trigger)"
}
```

**Returns:** Webhook URL and ID

### `webhook_list`

List all webhooks.

**Input Schema:** None

**Returns:** Array of webhook configurations

### `webhook_delete`

Delete a webhook.

**Input Schema:**
```json
{
  "webhook_id": "string (required)"
}
```

**Returns:** Deletion status

### `webhook_trigger_history`

Get webhook trigger history.

**Input Schema:**
```json
{
  "webhook_id": "string (required)",
  "limit": "number (optional, default: 20)"
}
```

**Returns:** Trigger history with timestamps and payloads

---

## MCP Bridge Tools

### `mcp_list_servers`

List connected MCP servers.

**Input Schema:** None

**Returns:** Array of MCP servers with status

### `mcp_list_tools`

List tools exposed by MCP servers.

**Input Schema:**
```json
{
  "server_name": "string (optional, filters by server)"
}
```

**Returns:** Array of available MCP tools

### `mcp_call_tool`

Invoke an MCP tool.

**Input Schema:**
```json
{
  "tool_name": "string (required)",
  "arguments": "object (required)"
}
```

**Returns:** Tool execution result

### `mcp_server_reconnect`

Reconnect to an MCP server.

**Input Schema:**
```json
{
  "server_name": "string (required)"
}
```

**Returns:** Reconnection status

---

## Skills Tools

### `skill_load`

Load a skill file.

**Input Schema:**
```json
{
  "skill_name": "string (required, filename without .md)"
}
```

**Returns:** Load status and skill metadata

### `skill_list`

List all available skills.

**Input Schema:** None

**Returns:** Array of skill names and descriptions

### `skill_unload`

Unload a skill.

**Input Schema:**
```json
{
  "skill_name": "string (required)"
}
```

**Returns:** Unload status

**See**: [docs/SKILLS_GUIDE.md](SKILLS_GUIDE.md) for creating skills

---

## Heartbeat Tools

### `heartbeat_enable`

Enable proactive heartbeat check-ins.

**Input Schema:**
```json
{
  "interval_minutes": "number (optional, default: 60)"
}
```

**Returns:** Enable status

### `heartbeat_disable`

Disable heartbeat.

**Input Schema:** None

**Returns:** Disable status

### `heartbeat_trigger_now`

Manually trigger a heartbeat check.

**Input Schema:** None

**Returns:** Heartbeat response

**See**: [docs/PROACTIVE_FEATURES.md](PROACTIVE_FEATURES.md) for details

---

## Observability Tools

### `get_metrics`

Get system metrics.

**Input Schema:**
```json
{
  "metric_type": "'summary' | 'tools' | 'messages' | 'database' | 'memory' (optional, default: 'summary')"
}
```

**Returns:** Metrics data

**Available Metrics**:
- `summary`: Overview of all metrics
- `tools`: Tool execution statistics
- `messages`: Message counts by channel
- `database`: Database query performance
- `memory`: Memory usage and cache stats

---

## Rate Limiting Tools

### `rate_limit_status`

Check rate limit status for current user.

**Input Schema:** None

**Returns:** Current usage, limits, reset time

### `rate_limit_set_limit`

Configure rate limits (admin only).

**Input Schema:**
```json
{
  "user_id": "string (required)",
  "tier": "'free' | 'basic' | 'premium' | 'unlimited' (required)"
}
```

**Returns:** Updated limit configuration

---

## Admin Tools

### `user_list`

List all users.

**Input Schema:**
```json
{
  "include_inactive": "boolean (optional, default: false)"
}
```

**Returns:** Array of users with metadata

### `user_set_permissions`

Update user permissions.

**Input Schema:**
```json
{
  "user_id": "string (required)",
  "permissions": "object (required, permission flags)"
}
```

**Returns:** Updated permissions

### `session_list`

List active sessions.

**Input Schema:** None

**Returns:** Array of sessions with metadata

### `session_terminate`

Force-terminate a session.

**Input Schema:**
```json
{
  "session_id": "string (required)"
}
```

**Returns:** Termination status

### `system_stats`

Get system statistics.

**Input Schema:** None

**Returns:** Uptime, resource usage, request counts

---

## Tool Development

### Creating Custom Tools

1. Define tool structure:

```typescript
import type { Tool } from "../types/tools.js";

export const myCustomTool: Tool = {
  name: "my_custom_tool",
  description: "Description of what the tool does",
  inputSchema: {
    type: "object",
    properties: {
      param1: {
        type: "string",
        description: "Parameter description"
      }
    },
    required: ["param1"]
  },
  async execute(input) {
    // Tool logic here
    const result = doSomething(input.param1 as string);
    return JSON.stringify({ success: true, result });
  }
};
```

2. Register in `src/tools/index.ts`:

```typescript
import { myCustomTool } from "./category/my-tool.ts";

export function registerBuiltInTools(): void {
  // ... existing registrations
  registry.register(myCustomTool);
}
```

3. Test the tool:

```bash
npm run test
```

### Tool Best Practices

- **Always return strings** (use `JSON.stringify()` for structured data)
- **Validate inputs** at the start of `execute()`
- **Handle errors gracefully** with try/catch
- **Log operations** for debugging
- **Document side effects** in description
- **Keep tools focused** - one clear responsibility
- **Use context fields** (`__sessionId`, etc.) when needed

---

## Troubleshooting

### Tool Not Found

**Issue**: "Tool X not found in registry"

**Solution**: 
1. Check tool is registered in `src/tools/index.ts`
2. Verify tool name matches exactly (case-sensitive)
3. Restart the agent if you added a new tool

### Permission Denied

**Issue**: "Permission denied" or "Unauthorized operation"

**Solution**:
1. Check user permissions with `user_list`
2. Verify API keys are configured (for external tools)
3. For file operations, check `PATH_ALLOWLIST` configuration

### Tool Timeout

**Issue**: Tool execution times out

**Solution**:
1. Increase timeout in tool configuration
2. Check network connectivity for external API tools
3. Verify external services are operational

### Rate Limit Exceeded

**Issue**: "Rate limit exceeded" error

**Solution**:
1. Check current limits with `rate_limit_status`
2. Wait for rate limit reset
3. Contact admin to adjust limits if needed

---

## See Also

- [API Reference](API.md) - REST and WebSocket API documentation
- [Architecture](ARCHITECTURE.md) - System design and data flow
- [Plugin Development](../src/plugins/README.md) - Creating tool plugins
- [Skills Guide](SKILLS_GUIDE.md) - Creating skill definitions
- [Multi-Agent Systems](MULTI_AGENT_SYSTEMS.md) - Agent coordination

