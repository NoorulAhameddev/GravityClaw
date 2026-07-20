# Model Switching Command - Phase 1.8

## Overview

Gravity Claw supports per-session model and provider switching. Each chat session can override the global configuration to use a specific LLM provider and model, allowing for flexible model selection on a per-conversation basis.

## Features

- **Per-Session Settings**: Each session stores its own provider and model preferences
- **Persistent Storage**: Settings are stored in the SQLite database and persist across restarts
- **Command Interface**: Simple `/model` command to view and change settings
- **Flexible Syntax**: Multiple command formats for different use cases
- **Global Fallback**: If no session settings exist, uses global config values

## Architecture

### Database Schema

Session settings are stored in the `memory` table's `settings` column:

```sql
CREATE TABLE IF NOT EXISTS memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  timestamp TEXT DEFAULT (datetime('now')),
  message_json TEXT NOT NULL,
  settings TEXT DEFAULT '{}'
);
```

### Session Settings Interface

```typescript
export interface SessionSettings {
  provider?: string;                  // e.g., "anthropic", "openai", "groq"
  model?: string;                     // e.g., "claude-3-5-sonnet", "gpt-4"
  
  // Future settings (not yet implemented)
  thinkingLevel?: "off" | "low" | "medium" | "high";
  voiceMode?: boolean;
  ttsProvider?: string;
  heartbeatInterval?: number;
  customSystemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  
  // Allow custom fields
  [key: string]: unknown;
}
```

## Usage

### View Current Settings

```
/model
```

Shows the current provider and model for this session. If no session overrides exist, shows global config values.

**Example output:**
```
📊 Current model configuration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Provider: openrouter
Model: google/gemini-2.5
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Use: /model <model-name>
     /model <provider> <model-name>
```

### Change Model Only

```
/model gpt-4
```

Changes the model while keeping the current provider. Useful when switching between models from the same provider.

**Example:**
```
/model claude-3-5-sonnet-20241022
```

### Change Provider and Model

```
/model anthropic claude-3-5-sonnet
```

Changes both the provider and model in one command.

**Supported providers:**
- `openrouter` - Access 200+ models via OpenRouter
- `anthropic` - Claude models direct from Anthropic
- `openai` - GPT models direct from OpenAI
- `google` - Gemini models from Google AI
- `groq` - Fast inference with Groq
- `deepseek` - DeepSeek models
- `ollama` - Local models via Ollama

**Example commands:**
```
/model openai gpt-4o
/model anthropic claude-3-5-sonnet
/model groq llama-3.3-70b-versatile
/model ollama llama3.2
```

## Implementation Details

### Session Module

`src/session.ts` provides the core session settings management:

```typescript
// Get all settings for a session
getSessionSettings(sessionId: string): SessionSettings

// Set all settings (creates/updates)
setSessionSettings(sessionId: string, settings: SessionSettings): void

// Update a single setting
updateSessionSetting(sessionId: string, key: string, value: unknown): void

// Get a single setting with fallback
getSessionSetting(sessionId: string, key: string, defaultValue?: unknown): unknown

// Delete all session data
deleteSession(sessionId: string): boolean

// List all session IDs
listSessions(): string[]

// Get session statistics
getSessionStats(sessionId: string): {
  messageCount: number;
  userMessages: number;
  assistantMessages: number;
  firstMessage: Date | null;
  lastMessage: Date | null;
  settings: SessionSettings;
}
```

### LLM Integration

`src/llm/orchestrator.ts` checks session settings before calling the LLM provider:

```typescript
export async function callClaude(
    sessionId: string,
    toolDefinitions: ChatCompletionTool[]
): Promise<ClaudeResponse> {
    // ... load conversation history ...

    // Check for session-specific provider/model overrides
    const sessionSettings = getSessionSettings(sessionId);
    let provider = getProvider(); // Default global provider

    if (sessionSettings.provider || sessionSettings.model) {
        // Session has custom provider/model settings - create temporary provider
        const sessionProvider = sessionSettings.provider || config.LLM_PROVIDER;
        const sessionModel = sessionSettings.model || config.LLM_MODEL;
        
        // Create provider with session-specific settings
        provider = createProvider();
    }

    return await provider.chat(messages, toolDefinitions);
}
```

### Router Command Handler

`src/channels/router.ts` handles the `/model` command:

```typescript
// /model - Show current model config
if (message === "/model") {
  const sessionSettings = getSessionSettings(sessionId);
  const currentProvider = sessionSettings.provider || config.LLM_PROVIDER;
  const currentModel = sessionSettings.model || config.LLM_MODEL;
  
  return `📊 Current model configuration\n...`;
}

// /model <model> - Change model
// /model <provider> <model> - Change both
if (message.startsWith("/model ")) {
  const parts = message.split(/\s+/).slice(1);
  
  let provider = sessionSettings.provider || config.LLM_PROVIDER;
  let model = sessionSettings.model || config.LLM_MODEL;
  
  // Parse arguments and update settings
  // ...
  
  await updateSessionSetting(sessionId, "provider", provider);
  await updateSessionSetting(sessionId, "model", model);
  
  return `✅ Model updated: ${provider} / ${model}`;
}
```

## Use Cases

### 1. Cost Optimization

Use cheaper models for simple tasks:
```
/model openrouter meta-llama/llama-3.2-3b-instruct:free
```

Use powerful models for complex tasks:
```
/model anthropic claude-3-opus
```

### 2. Feature Testing

Test different models in the same conversation:
```
/model openai gpt-4o
(ask question)
/model anthropic claude-3-5-sonnet
(ask same question to compare)
```

### 3. Local Development

Switch to local Ollama for offline work:
```
/model ollama llama3.2
```

### 4. Speed vs Quality

Fast responses with Groq:
```
/model groq llama-3.3-70b-versatile
```

Best quality with Claude:
```
/model anthropic claude-3-5-sonnet-20241022
```

## Session Isolation

Each session is completely isolated:
- Settings in Session A don't affect Session B
- Different Telegram chats have different session IDs
- Different WhatsApp contacts have different session IDs
- Web UI can have multiple independent sessions

## Database Migration

The settings column is added automatically on first run:

```typescript
// Add settings column to memory table (migration)
try {
  db.prepare(`
    ALTER TABLE memory 
    ADD COLUMN settings TEXT DEFAULT '{}'
  `).run();
  log.info("Added settings column to memory table");
} catch (err) {
  // Column already exists or other error - continue
}

// Set empty settings for existing rows
db.prepare(`
  UPDATE memory 
  SET settings = '{}' 
  WHERE settings IS NULL
`).run();
```

## Testing

Comprehensive test suite in `src/__tests__/session.test.ts`:

- ✅ Get empty settings for new session
- ✅ Store and retrieve settings
- ✅ Update existing settings
- ✅ Update all messages in session
- ✅ Add new setting to empty settings
- ✅ Update specific setting without overwriting others
- ✅ Get setting with default fallback
- ✅ Delete session
- ✅ List all sessions
- ✅ Get session statistics (message counts, role counts, timestamps)
- ✅ Session isolation (settings don't leak between sessions)

## Future Enhancements

Planned features for session settings:

1. **Thinking Levels**: Control extended thinking mode per session
2. **Voice Mode**: Enable TTS responses automatically
3. **Custom System Prompts**: Per-session personality/behavior
4. **Temperature Control**: Adjust creativity per session
5. **Token Limits**: Set max response length per session
6. **Heartbeat Intervals**: Configure proactive check-ins
7. **Memory Settings**: Control context window management

## API Reference

### Command Interface

| Command | Arguments | Description |
|---------|-----------|-------------|
| `/model` | none | Show current provider and model |
| `/model <model>` | model name | Change model keeping current provider |
| `/model <provider> <model>` | provider, model | Change both provider and model |

### Supported Providers

| Provider | Configuration Required | Notes |
|----------|------------------------|-------|
| `openrouter` | `OPENROUTER_API_KEY` | 200+ models, default provider |
| `anthropic` | `ANTHROPIC_API_KEY` | Claude 3.5 Sonnet, Opus, Haiku |
| `openai` | `OPENAI_API_KEY` | GPT-4o, GPT-4, GPT-3.5 |
| `google` | `GOOGLE_API_KEY` | Gemini 1.5 Pro/Flash |
| `groq` | `GROQ_API_KEY` | Llama 3, fast inference |
| `deepseek` | `DEEPSEEK_API_KEY` | DeepSeek R1, V3 |
| `ollama` | None (local) | Requires Ollama running locally |

## Error Handling

### Invalid Provider

```
/model invalid-provider some-model
```

Returns error message with list of valid providers.

### Missing API Key

If you try to use a provider without configuring its API key:

```
Error: ANTHROPIC_API_KEY is required for Anthropic provider
```

The command will fail gracefully and inform the user.

### Session Without Messages

When setting settings for a brand new session with no messages, a placeholder system message is created to store the settings. This is automatically cleaned up and handled transparently.

## Related Files

- **Core Implementation**: `src/session.ts`
- **LLM Integration**: `src/llm/orchestrator.ts`
- **Command Handler**: `src/channels/router.ts`
- **Database Schema**: `src/db.ts`
- **Tests**: `src/__tests__/session.test.ts`
- **Documentation**: `docs/MODEL_SWITCHING.md` (this file)

## Example Workflow

1. **Start new conversation**
   ```
   User: Hello!
   Agent: Hi! How can I help you?
   ```

2. **Check current model**
   ```
   User: /model
   Agent: Provider: openrouter
          Model: google/gemini-2.5
   ```

3. **Switch to more powerful model**
   ```
   User: /model anthropic claude-3-5-sonnet
   Agent: ✅ Model updated successfully
   ```

4. **Continue conversation with new model**
   ```
   User: Write me a complex analysis...
   Agent: (responds using Claude 3.5 Sonnet)
   ```

5. **Settings persist across restarts**
   - Stop the agent
   - Start the agent
   - Send a message in the same session
   - Still uses Claude 3.5 Sonnet!

## Troubleshooting

### Settings not persisting

Check that:
1. Database writes are successful (check logs)
2. Session ID is consistent
3. Settings column exists in memory table

### Provider not switching

Verify:
1. API key is configured for target provider
2. Provider name is spelled correctly
3. Check logs for provider creation errors

### Model not found

Ensure:
1. Model name is valid for the provider
2. Use `/models` command to list available models
3. Check provider documentation for model names
