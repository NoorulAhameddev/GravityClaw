# Gravity Claw API Reference

Complete API documentation for Gravity Claw, covering tool APIs, WebSocket protocol, REST endpoints, and error handling.

---

## Table of Contents

1. [Tool API Reference](#tool-api-reference)
2. [WebSocket Protocol](#websocket-protocol)
3. [REST API Endpoints](#rest-api-endpoints)
4. [Error Codes & Handling](#error-codes--handling)
5. [Authentication & Session Management](#authentication--session-management)
6. [Rate Limits & Quotas](#rate-limits--quotas)

---

## Tool API Reference

All tools follow a standard interface:

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

Tools are centrally registered in the **ToolRegistry** (`src/tools/index.ts`) and exposed via the LLM as OpenAI-compatible function definitions. All tool results are returned as JSON strings.

### Context Injection

When the agent calls a tool, these fields are automatically injected alongside user-supplied arguments:

```typescript
__sessionId: string       // Current session identifier
__userId?: string         // Current user (if available)
__platform?: string       // Channel platform (telegram, whatsapp, etc.)
__groupId?: string        // Group identifier (if applicable)
__isGroup?: boolean       // Whether this is a group conversation
```

---

### Category: Voice Tools

#### `transcribe_audio`

**Description**: Transcribe audio file to text using OpenAI Whisper API

**Supported Formats**: mp3, mp4, mpeg, mpga, m4a, wav, webm (max 25MB)

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to audio file to transcribe"
    },
    "language": {
      "type": "string",
      "description": "Optional ISO-639-1 language code (e.g., 'en', 'es')"
    }
  },
  "required": ["file_path"]
}
```

**Example Request**:
```json
{
  "file_path": "/path/to/audio.mp3",
  "language": "en"
}
```

**Example Response** (Success):
```json
{
  "success": true,
  "text": "Hello, this is a transcribed message.",
  "filePath": "/path/to/audio.mp3",
  "characterCount": 42
}
```

**Example Response** (Error):
```json
{
  "error": "File not found: /path/to/audio.mp3"
}
```

---

#### `speak_text`

**Description**: Convert text to speech and play audio (or save to file)

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "text": {
      "type": "string",
      "description": "Text to convert to speech"
    },
    "voice": {
      "type": "string",
      "description": "Voice ID (default: from config ELEVENLABS_VOICE_ID or 'bella')"
    },
    "output_file": {
      "type": "string",
      "description": "Optional file path to save audio (if not specified, plays immediately)"
    },
    "rate": {
      "type": "number",
      "description": "Speech rate (0.25-4.0, default: 1.0)"
    }
  },
  "required": ["text"]
}
```

**Example Request**:
```json
{
  "text": "The quick brown fox jumps over the lazy dog",
  "voice": "james",
  "rate": 1.2
}
```

**Example Response** (Success):
```json
{
  "success": true,
  "characterCount": 44,
  "estimatedDuration": 8.5,
  "provider": "elevenlabs"
}
```

---

#### `set_voice_mode`

**Description**: Enable/disable voice mode for current session

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "mode": {
      "type": "string",
      "enum": ["off", "transcribe", "full"],
      "description": "Voice mode: off (no voice), transcribe (transcribe audio to text), full (transcribe + TTS)"
    }
  },
  "required": ["mode"]
}
```

**Example Response** (Success):
```json
{
  "success": true,
  "mode": "full",
  "message": "Voice mode enabled (transcribe + TTS)"
}
```

---

### Category: TTS (Text-to-Speech) Tools

#### `get_tts_voices`

**Description**: List available text-to-speech voices

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "provider": {
      "type": "string",
      "enum": ["openai", "elevenlabs"],
      "description": "TTS provider (default: configured provider)"
    }
  }
}
```

**Example Response**:
```json
{
  "success": true,
  "provider": "elevenlabs",
  "voices": [
    {
      "id": "bella",
      "name": "Bella",
      "preview_url": "https://..."
    },
    {
      "id": "james",
      "name": "James",
      "preview_url": "https://..."
    }
  ],
  "count": 11
}
```

---

### Category: Memory Tools

#### `save_fact`

**Description**: Save a fact to the session's memory vault

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "content": {
      "type": "string",
      "description": "The fact to remember"
    },
    "category": {
      "type": "string",
      "description": "Optional category (e.g., 'personal', 'work', 'preferences')"
    }
  },
  "required": ["content"]
}
```

**Example Request**:
```json
{
  "content": "User prefers dark mode interfaces",
  "category": "preferences"
}
```

**Example Response**:
```json
{
  "success": true,
  "id": 42,
  "message": "Fact saved to memory"
}
```

---

#### `recall_facts`

**Description**: Retrieve saved facts for the current session

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "category": {
      "type": "string",
      "description": "Optional category filter"
    },
    "limit": {
      "type": "number",
      "description": "Maximum facts to return (default: 50)"
    }
  }
}
```

**Example Response**:
```json
{
  "success": true,
  "facts": [
    {
      "id": 1,
      "content": "User prefers dark mode",
      "category": "preferences",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "count": 1
}
```

---

#### `save_entity`

**Description**: Save an entity (person, place, etc.) to the knowledge graph

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Entity name"
    },
    "type": {
      "type": "string",
      "description": "Entity type (person, place, thing, etc.)"
    },
    "description": {
      "type": "string",
      "description": "Description of the entity"
    },
    "properties": {
      "type": "object",
      "description": "Additional key-value properties"
    }
  },
  "required": ["name", "type"]
}
```

**Example Request**:
```json
{
  "name": "Alice",
  "type": "person",
  "description": "Project lead",
  "properties": {
    "email": "alice@example.com",
    "team": "Engineering"
  }
}
```

**Example Response**:
```json
{
  "success": true,
  "entityId": "alice-001",
  "message": "Entity saved to knowledge graph"
}
```

---

#### `save_relationship`

**Description**: Create a relationship between two entities in the knowledge graph

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "source_entity": {
      "type": "string",
      "description": "Source entity name/ID"
    },
    "relationship_type": {
      "type": "string",
      "description": "Type of relationship (works_with, manages, knows, etc.)"
    },
    "target_entity": {
      "type": "string",
      "description": "Target entity name/ID"
    },
    "strength": {
      "type": "number",
      "description": "Relationship strength (0-1)"
    }
  },
  "required": ["source_entity", "relationship_type", "target_entity"]
}
```

**Example Response**:
```json
{
  "success": true,
  "relationshipId": "rel-001",
  "message": "Relationship created"
}
```

---

#### `query_graph`

**Description**: Query the knowledge graph for entities and relationships

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "entity_name": {
      "type": "string",
      "description": "Search for entity by name"
    },
    "relationship_type": {
      "type": "string",
      "description": "Filter relationships by type"
    }
  }
}
```

**Example Response**:
```json
{
  "success": true,
  "entities": [
    {
      "id": "alice-001",
      "name": "Alice",
      "type": "person",
      "description": "Project lead"
    }
  ],
  "relationships": [
    {
      "source": "alice-001",
      "type": "works_with",
      "target": "bob-002"
    }
  ]
}
```

---

#### `search_memory`

**Description**: Semantic search over session memory and facts

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Search query"
    },
    "limit": {
      "type": "number",
      "description": "Maximum results (default: 10)"
    },
    "threshold": {
      "type": "number",
      "description": "Similarity threshold (0-1)"
    }
  },
  "required": ["query"]
}
```

**Example Response**:
```json
{
  "success": true,
  "results": [
    {
      "id": 1,
      "content": "User prefers dark mode",
      "similarity": 0.92,
      "type": "fact"
    }
  ],
  "count": 1
}
```

---

### Category: System Tools

#### `get_datetime`

**Description**: Get current date/time in ISO 8601 and Unix formats

**Input Schema**:
```json
{
  "type": "object",
  "properties": {}
}
```

**Example Response**:
```json
{
  "iso": "2024-01-15T10:30:45.123Z",
  "local": "Mon Jan 15 2024 10:30:45 GMT+0000 (Coordinated Universal Time)",
  "unix": 1705318245
}
```

---

#### `shell`

**Description**: Execute shell commands (with safeguards)

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "Shell command to execute"
    },
    "timeout": {
      "type": "number",
      "description": "Execution timeout in milliseconds (default: 30000)"
    },
    "cwd": {
      "type": "string",
      "description": "Working directory (must be in PATH_ALLOWLIST)"
    }
  },
  "required": ["command"]
}
```

**Example Request**:
```json
{
  "command": "ls -la /path/to/directory",
  "timeout": 5000
}
```

**Example Response** (Success):
```json
{
  "success": true,
  "stdout": "total 24\ndrwxr-xr-x  5 user  staff  160 Jan 15 10:30 .\n",
  "stderr": "",
  "exitCode": 0
}
```

**Example Response** (Error):
```json
{
  "success": false,
  "error": "Command timed out after 5000ms"
}
```

---

### Category: Admin/Dashboard Tools

#### `listGroupsForUser`

**Description**: List all groups where the user is an admin

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Session ID for context"
    }
  },
  "required": ["sessionId"]
}
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "groups": [
      {
        "platform": "telegram",
        "groupId": "-1001234567890",
        "botUsername": "gravity_claw_bot",
        "voiceMode": "full",
        "thinkingLevel": "medium",
        "disabledToolCount": 2,
        "enabledToolCount": 45
      }
    ],
    "total": 1
  }
}
```

---

#### `get_group_settings`

**Description**: Retrieve settings for a specific group

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "platform": {
      "type": "string",
      "description": "Platform (telegram, whatsapp, etc.)"
    },
    "group_id": {
      "type": "string",
      "description": "Group identifier"
    }
  },
  "required": ["platform", "group_id"]
}
```

**Example Response**:
```json
{
  "success": true,
  "settings": {
    "platform": "telegram",
    "groupId": "-1001234567890",
    "botUsername": "gravity_claw_bot",
    "voiceMode": "full",
    "thinkingLevel": "medium",
    "temperature": 0.7,
    "maxTokens": 2000,
    "disabledTools": ["shell"],
    "enabledTools": ["save_fact", "recall_facts", ...]
  }
}
```

---

### Category: Communication Tools

#### `sessions_list`

**Description**: List all active agent sessions

**Input Schema**:
```json
{
  "type": "object",
  "properties": {}
}
```

**Example Response**:
```json
{
  "success": true,
  "sessions": [
    {
      "id": "telegram:12345",
      "active": true,
      "lastActivity": "2024-01-15T10:30:00Z",
      "allowMessages": true
    }
  ],
  "count": 1,
  "message": "..."
}
```

---

#### `sessions_history`

**Description**: Read message history from another session (with permission)

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session ID"
    },
    "limit": {
      "type": "number",
      "description": "Maximum messages to return"
    }
  },
  "required": ["session_id"]
}
```

**Example Response**:
```json
{
  "success": true,
  "messages": [
    {
      "id": 1,
      "fromSessionId": "telegram:111",
      "toSessionId": "telegram:222",
      "content": "Hello from another session",
      "timestamp": "2024-01-15T10:30:00Z"
    }
  ],
  "count": 1
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Session telegram:222 does not allow message reading"
}
```

---

### Category: UI/Dashboard Tools

#### `getDashboardState`

**Description**: Get current state for dashboard refresh

**Input Schema**:
```json
{
  "type": "object",
  "properties": {}
}
```

**Example Response**:
```json
{
  "success": true,
  "dashboard": {
    "stats": {
      "sessions": 5,
      "activeTasks": 2,
      "webhooks": 3
    },
    "recentMessages": [
      {
        "sessionId": "telegram:123",
        "timestamp": "2024-01-15T10:30:00Z",
        "preview": "What's the weather..."
      }
    ]
  }
}
```

---

---

## WebSocket Protocol

The WebChat channel exposes a WebSocket server for real-time bidirectional communication. Clients connect to `ws://localhost:PORT` (default PORT=3000).

### Message Types

#### 1. **User Message**

Client sends a chat message to the agent.

**Direction**: Client → Server

**Payload**:
```json
{
  "type": "message",
  "text": "What's the weather like today?"
}
```

**Server Response** (when processed):
```json
{
  "type": "message",
  "text": "Here's the weather forecast...",
  "isBot": true
}
```

---

#### 2. **Typing Indicator**

Server notifies client that the agent is thinking/processing.

**Direction**: Server → Client

**Payload**:
```json
{
  "type": "typing"
}
```

**Use Case**: Sent periodically while the agent is iterating on tool calls.

---

#### 3. **Tool Call** (Client Initiated)

Client can directly invoke a tool via WebSocket (for advanced clients).

**Direction**: Client → Server

**Payload**:
```json
{
  "type": "tool_call",
  "id": "call-123",
  "tool": "get_datetime",
  "args": {}
}
```

---

#### 4. **Tool Response**

Server returns the result of a tool execution.

**Direction**: Server → Client

**Payload** (Success):
```json
{
  "type": "tool_response",
  "id": "call-123",
  "result": {
    "iso": "2024-01-15T10:30:45.123Z",
    "unix": 1705318245
  }
}
```

**Payload** (Error):
```json
{
  "type": "tool_response",
  "id": "call-123",
  "error": "Tool execution failed: ..."
}
```

---

### Connection Lifecycle

```
1. Client connects to ws://localhost:3000
   ↓ Server logs: "📡 [WebChat] New WebSocket client connected"
   ↓ Keep-alive mechanism initialized (ping/pong every 30s)

2. Client sends message
   ↓ Server routes to agent.runAgent()
   ↓ Agent iterates on tool calls

3. Server sends typing indicators (optional)
   ↓ Client displays "Agent is thinking..."

4. Agent completes with final text
   ↓ Server sends message response

5. Client sends tool_call (optional)
   ↓ Server executes tool
   ↓ Server sends tool_response

6. Client closes connection
   ↓ Server logs: "🔌 [WebChat] Client disconnected"
   ↓ Cleanup performed
```

### Error Handling

**WebSocket Errors**:

```json
{
  "type": "message",
  "text": "⚠️ Error: Failed to process your message. Please try again.",
  "isBot": true,
  "error": true
}
```

**Connection Loss**: automatically reconnect with exponential backoff

**Timeout**: if no pong received within 30s, connection is terminated

---

### Example: Chat Flow

**Step 1: Connect**
```javascript
const ws = new WebSocket('ws://localhost:3000');
ws.onopen = () => console.log('Connected');
```

**Step 2: Send message**
```javascript
ws.send(JSON.stringify({
  type: 'message',
  text: 'What time is it?'
}));
```

**Step 3: Receive typing indicator**
```javascript
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'typing') {
    console.log('Agent is thinking...');
  }
};
```

**Step 4: Receive response**
```javascript
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'message' && msg.isBot) {
    console.log('Agent:', msg.text);
  }
};
```

---

---

## REST API Endpoints

All REST endpoints are served on `http://localhost:PORT/api/*` (default PORT=3000).

### `GET /api/health`

**Description**: Server health check

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "uptime": 1234.567,
  "server": {
    "listening": true,
    "port": 3000,
    "wsClients": 3
  }
}
```

**Status Code**: `200 OK`

---

### `GET /api/tools`

**Description**: List all registered tools with names and descriptions

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "name": "transcribe_audio",
      "description": "Transcribe audio file to text using OpenAI Whisper API..."
    },
    {
      "name": "save_fact",
      "description": "Save a fact to the session's memory vault"
    },
    {
      "name": "get_datetime",
      "description": "Returns current date/time..."
    }
  ],
  "count": 47
}
```

**Status Code**: `200 OK`

---

### `GET /api/memory`

**Description**: Get conversation history and session information

**Query Parameters**:
- `session` (optional): Session ID to filter by
- `limit` (optional, default: 50, max: 200): Number of records to return

**Response** (all sessions):
```json
{
  "success": true,
  "data": [
    {
      "session_id": "telegram:123456",
      "message_count": 45,
      "last_active": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**Response** (specific session):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "session_id": "telegram:123456",
      "timestamp": "2024-01-15T10:20:00Z",
      "message_json": "{\"role\": \"user\", \"content\": \"What's the weather?\"}"
    }
  ]
}
```

**Status Code**: `200 OK` | `500` on error

---

### `GET /api/usage`

**Description**: Get token usage statistics across all sessions

**Response**:
```json
{
  "success": true,
  "data": {
    "byPeriod": {
      "today": {
        "requests": 123,
        "tokens": 45678,
        "cost": 0.45
      },
      "week": {
        "requests": 856,
        "tokens": 342123,
        "cost": 3.42
      },
      "allTime": {
        "requests": 5234,
        "tokens": 2031456,
        "cost": 20.31
      }
    },
    "models": {
      "gpt-4": {
        "calls": 234,
        "tokens": 45000,
        "cost": 0.45
      },
      "claude-3-sonnet": {
        "calls": 156,
        "tokens": 32000,
        "cost": 0.32
      }
    },
    "avgLatency": 1234
  }
}
```

**Status Code**: `200 OK`

---

### `GET /api/stats`

**Description**: Dashboard statistics — counts of key resources

**Response**:
```json
{
  "success": true,
  "data": {
    "sessions": 42,
    "activeTasks": 5,
    "webhooks": 8,
    "swarms": 2,
    "workflows": 3,
    "memorySessions": 35,
    "heartbeats": 4
  }
}
```

**Status Code**: `200 OK`

---

### `GET /api/sessions`

**Description**: List all sessions with message counts

**Query Parameters**:
- `limit` (optional, default: 100): Max sessions to return

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "telegram:123456",
      "allow_messages": true,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "message_count": 127
    }
  ]
}
```

**Status Code**: `200 OK`

---

### `GET /api/scheduler/tasks`

**Description**: List scheduled tasks

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "session_id": "telegram:123456",
      "pattern": "0 9 * * *",
      "description": "Daily summary",
      "enabled": true,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

**Status Code**: `200 OK`

---

### `GET /api/webhooks`

**Description**: List registered webhooks (secrets masked)

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "github_push",
      "session_id": "telegram:123456",
      "created_at": "2024-01-01T00:00:00Z",
      "created_by": "user_id_123"
    }
  ]
}
```

**Status Code**: `200 OK`

---

### `POST /webhook/:session_id/:hook_name`

**Description**: Receives webhook payloads from external services

**Headers** (if webhook has secret):
```
X-Webhook-Signature: hmac_sha256_signature
```

**Body**: Any JSON payload

**Response** (Success):
```json
{
  "success": true,
  "message": "Webhook received",
  "webhook": {
    "name": "github_push",
    "session_id": "telegram:123456"
  },
  "payload": { ... }
}
```

**Status Codes**:
- `200 OK` - Webhook accepted
- `404 Not Found` - Webhook not found
- `401 Unauthorized` - Invalid signature
- `500 Internal Server Error` - Processing failed

---

### `GET /api/swarms`

**Description**: List agent swarms

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "session_id": "telegram:123456",
      "goal": "Organize quarterly report",
      "status": "completed",
      "agents_count": 3,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

**Status Code**: `200 OK`

---

### `GET /api/workflows`

**Description**: List workflows and their progress

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "session_id": "telegram:123456",
      "goal": "Analyze market trends",
      "status": "in_progress",
      "progress": 65,
      "created_at": "2024-01-01T00:00:00Z",
      "completed_at": null
    }
  ]
}
```

**Status Code**: `200 OK`

---

### `GET /api/heartbeats`

**Description**: List heartbeat tasks

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "session_id": "telegram:123456",
      "interval_minutes": 30,
      "enabled": true,
      "last_run": "2024-01-15T10:00:00Z",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

**Status Code**: `200 OK`

---

### `GET /api/ws-info`

**Description**: Diagnostic info about WebSocket server (internal use)

**Response**:
```json
{
  "status": "ok",
  "websocket": {
    "server_exists": true,
    "handlers_registered": true,
    "connected_clients": 5,
    "ready_for_connections": true
  }
}
```

---

---

## Error Codes & Handling

### HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| `200` | Success | Tool executed, data retrieved |
| `400` | Bad Request | Missing required parameters |
| `401` | Unauthorized | Invalid webhook signature |
| `404` | Not Found | Hook/session doesn't exist |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Server Error | Tool execution failed |
| `503` | Service Unavailable | External API down |

---

### Tool Error Response Format

All tool errors follow this pattern:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "errorCode": "TOOL_NOT_FOUND",
  "details": {
    "toolName": "unknown_tool",
    "inputSchema": "..."
  }
}
```

---

### Common Error Codes

#### Tool Execution Errors

```typescript
"TOOL_NOT_FOUND"           // Tool doesn't exist
"INVALID_INPUT"            // Schema validation failed
"MISSING_PARAMETER"        // Required field missing
"EXECUTION_TIMEOUT"        // Tool took too long
"FILE_NOT_FOUND"           // File operation failed
"PERMISSION_DENIED"        // File path not in allowlist
"API_ERROR"                // External API failed
"INVALID_SIGNATURE"        // Webhook signature invalid
```

#### Agent Errors

```typescript
"MAX_ITERATIONS_EXCEEDED"  // Hit AGENT_MAX_ITERATIONS limit
"NO_VALID_RESPONSE"        // LLM returned empty response
"SESSION_NOT_FOUND"        // Session ID invalid
"MEMORY_CORRUPTED"         // Conversation history corrupted
```

---

### Handling Timeouts

Tools have these timeout defaults:

- **Shell commands**: 30 seconds (configurable via `timeout` parameter)
- **LLM calls**: 60 seconds
- **Voice transcription**: 120 seconds (depends on file size)
- **WebSocket connection**: 30 seconds (ping/pong)

**Handling in client code**:

```javascript
// Example: Timeout wrapper for fetch
async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

// Usage
try {
  const response = await fetchWithTimeout('http://localhost:3000/api/memory', {}, 5000);
} catch (error) {
  if (error.name === 'AbortError') {
    console.error('Request timeout');
  }
}
```

---

### Handling Rate Limits (429)

When receiving a `429 Too Many Requests`:

```typescript
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429) {
        const delayMs = Math.pow(2, i) * 1000; // Exponential backoff
        console.log(`Rate limited. Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        throw error;
      }
    }
  }
  
  throw new Error(`Failed after ${maxRetries} retries`);
}

// Usage
await retryWithBackoff(() => fetch('/api/memory'));
```

---

### Retry Strategy

**Recommended retry logic**:

```
1. Immediate retry for transient errors (500, 502, 503, 504)
2. Token bucket backoff for rate limits (429)
3. Don't retry for permanent errors (400, 401, 404)
4. Exponential backoff: delay = baseDelay * (2 ^ attemptNumber)
5. Max retries: 3-5 attempts
6. Max total time: 30-60 seconds
```

---

---

## Authentication & Session Management

### Session Identification

Sessions are identified by a compound key derived from the **channel** and **chat**:

```typescript
sessionId = `${channelId}:${chatId}`

// Examples:
"telegram:123456789"        // Telegram user
"whatsapp:1-5551234567"     // WhatsApp contact
"webchat-session"           // Web chat (global session)
```

The agent maintains a **conversation history per session** stored in SQLite:

```sql
CREATE TABLE memory (
  id INTEGER PRIMARY KEY,
  session_id TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  message_json TEXT,           -- Full OpenAI-format message
  settings TEXT,               -- Session settings as JSON
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);
```

---

### Session Settings

Settings are stored as JSON in the `memory` table's `settings` column and control agent behavior per session:

```typescript
interface SessionSettings {
  provider?: string;           // LLM provider (openai, anthropic, etc.)
  model?: string;              // Model name
  thinkingLevel?: "off" | "low" | "medium" | "high";
  voiceMode?: "off" | "transcribe" | "full";
  ttsProvider?: "openai" | "elevenlabs";
  temperature?: number;        // 0.0 - 2.0
  maxTokens?: number;
  heartbeatInterval?: number;  // minutes
  heartbeatEnabled?: boolean;
  recapHourLocal?: number;     // 0-23
  customSystemPrompt?: string;
  [key: string]: unknown;      // Additional custom settings
}
```

**Retrieving settings**:

```typescript
import { getSessionSettings } from './session.ts';

const settings = getSessionSettings("telegram:123456");
console.log(settings.model);  // e.g., "claude-3-5-sonnet-20241022"
```

**Updating settings**:

```typescript
import { updateSessionSetting } from './session.ts';

// Single setting
updateSessionSetting("telegram:123456", "model", "gpt-4");

// Multiple settings
setSessionSettings("telegram:123456", {
  provider: "openai",
  model: "gpt-4-turbo",
  temperature: 0.7
});
```

---

### Session Lifecycle

```
1. User sends first message on a channel (e.g., Telegram)
   → sessionId created: "telegram:123456"
   → Initial system message inserted into memory table
   → Empty settings JSON

2. Agent processes message
   → Stores user message, assistant response, any tool results
   → Settings can be updated via /model command

3. Session persists across all subsequent messages
   → Full history maintained
   → Settings inherited from previous state

4. User runs /reset command
   → All memory for session deleted
   → Settings reset to defaults

5. User doesn't interact for long time
   → Session record remains in DB
   → Can be queried via /api/sessions endpoint
```

---

### Context Injected into Tools

When a tool is called, these fields are automatically added to the input:

```typescript
// Automatically injected by agent.runAgent()
const toolInput = {
  ...userSuppliedInput,
  __sessionId: "telegram:123456",
  __userId: "user_123",          // If available
  __platform: "telegram",
  __groupId: "-1001234567890",   // If group chat
  __isGroup: true
};
```

Tools can access context to customize behavior:

```typescript
execute(input: Record<string, unknown>) {
  const sessionId = input.__sessionId as string;
  const isGroup = input.__isGroup as boolean;
  
  if (isGroup) {
    // Different behavior for group chats
  }
}
```

---

---

## Rate Limits & Quotas

### Token Bucket Algorithm

Gravity Claw implements **soft rate limiting** via token buckets. Each session has a bucket that refills at a configurable rate.

**Conceptual model**:

```
Bucket capacity:     1000 tokens
Refill rate:         100 tokens/minute
Time window:         1 minute

Each request costs tokens based on input + output size:
  Input:  1 token per 4 characters
  Output: 1 token per 4 characters
  
If bucket depleted → HTTP 429 (Too Many Requests)
Retry-After header:  Time until next refill
```

---

### Current Rate Limits

| Resource | Limit | Window | Notes |
|----------|-------|--------|-------|
| Requests/session | 100 | 1 minute | Soft limit; advisory |
| Tokens/session | 100,000 | 1 day | Across all models |
| File upload | 25 MB | Per request | Audio format |
| Concurrent WS | 1000 | Server-wide | Per server instance |
| Tool calls/request | `AGENT_MAX_ITERATIONS` | Per request | Default: 10 |

---

### Recommended Limits (For Production)

To protect your deployment, consider these settings in `.env`:

```bash
# Limit agent iterations to reduce runaway loops
AGENT_MAX_ITERATIONS=5

# Set API timeouts
OPENROUTER_TIMEOUT_MS=30000
OPENAI_TIMEOUT_MS=30000

# Port binding
PORT=3000
```

---

### How Limits Are Enforced

1. **Token counting**: Each LLM call records tokens via `recordUsage()`

```typescript
recordUsage({
  sessionId: "telegram:123456",
  model: "gpt-4-turbo",
  promptTokens: 450,
  completionTokens: 230,
  latency: 1234
});
```

2. **Quota checks**: Available in `/api/usage` endpoint

```json
{
  "byPeriod": {
    "today": {
      "tokens": 45678,     // Current day usage
      "cost": 0.45
    }
  }
}
```

3. **Advisory warnings**: Log when approaching limits

```
⚠️ Session telegram:123456 has used 95% of daily quota
```

---

### Handling Rate Limit Responses

**When receiving 429**:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 45
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 2024-01-15T10:31:30Z

{
  "success": false,
  "error": "Rate limit exceeded",
  "retryAfter": 45
}
```

**Client response**:

```typescript
async function handleRateLimit(error) {
  if (error.status === 429) {
    const retryAfter = error.headers.get('Retry-After');
    const delayMs = parseInt(retryAfter) * 1000;
    
    console.log(`Rate limited. Retrying in ${delayMs}ms...`);
    await new Promise(r => setTimeout(r, delayMs));
    
    return retryRequest();
  }
  
  throw error;
}
```

---

### Quota Cleanup

Old usage records are periodically purged:

```sql
-- Archive/delete records older than 90 days
DELETE FROM usage 
WHERE timestamp < datetime('now', '-90 days');
```

To manually check quotas:

```bash
curl http://localhost:3000/api/usage | jq '.data.byPeriod'
```

---

---

## Appendix: Common Implementation Patterns

### Pattern: Tool Error Handling

```typescript
export const myTool: Tool = {
  name: "my_tool",
  description: "...",
  inputSchema: { /* ... */ },
  async execute(input: Record<string, unknown>): Promise<string> {
    try {
      const requiredField = input.required_field;
      if (!requiredField) {
        return JSON.stringify({
          success: false,
          error: "Missing required_field parameter"
        });
      }
      
      // Do work
      const result = await someAsyncWork(requiredField);
      
      return JSON.stringify({
        success: true,
        data: result
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`my_tool failed: ${message}`);
      
      return JSON.stringify({
        success: false,
        error: message
      });
    }
  }
};
```

---

### Pattern: Session-Aware Tool

```typescript
export const sessionAwareTool: Tool = {
  name: "session_aware",
  description: "...",
  inputSchema: { /* ... */ },
  async execute(input: Record<string, unknown>): Promise<string> {
    const sessionId = input.__sessionId as string;
    const settings = getSessionSettings(sessionId);
    
    // Use session context
    const model = settings.model || 'default-model';
    
    // ... tool logic using context
    
    return JSON.stringify({ success: true, /* ... */ });
  }
};
```

---

### Pattern: WebSocket Message Handling

```typescript
ws.onmessage = async (event) => {
  try {
    const message = JSON.parse(event.data);
    
    switch (message.type) {
      case 'message':
        await handleChatMessage(message.text);
        break;
      
      case 'tool_call':
        await handleToolCall(message.id, message.tool, message.args);
        break;
      
      case 'typing':
        console.log('Agent is typing...');
        break;
      
      default:
        console.warn(`Unknown message type: ${message.type}`);
    }
  } catch (error) {
    console.error('Failed to parse message:', error);
  }
};
```

---

### Pattern: Retry with Exponential Backoff

```typescript
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (response.ok) {
        return response;
      }
      
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '1');
        throw { status: 429, retryAfter };
      }
      
      if (response.status >= 500) {
        throw { status: response.status, retry: true };
      }
      
      throw { status: response.status, retry: false };
    } catch (error) {
      lastError = error;
      
      if (!error.retry && error.status !== 429) {
        throw error; // Don't retry permanent errors
      }
      
      if (attempt < maxRetries - 1) {
        const delayMs = error.retryAfter 
          ? error.retryAfter * 1000
          : Math.pow(2, attempt) * 1000;
        
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  throw lastError;
}
```

---

---

**Last Updated**: January 2024  
**Gravity Claw Version**: 1.0.0+  
**API Stability**: Beta (subject to change)
