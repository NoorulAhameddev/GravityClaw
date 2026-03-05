# Rate Limiting Implementation for Gravity Claw

## Overview

Gravity Claw implements comprehensive API rate limiting using the **Token Bucket Algorithm** to protect against abuse and ensure fair resource allocation. The rate limiter is integrated at multiple levels:

1. **Agent-level**: Before executing tools in the `runAgent()` loop
2. **WebSocket-level**: Before executing direct tool calls via WebChat
3. **Per-session limits**: Tracked individually for each user session
4. **Per-tool-category limits**: Different limits for voice, memory, system tools
5. **Per-specific-tool limits**: Granular limits on individual tool execution

## Architecture

### Token Bucket Algorithm

The implementation uses the classic token bucket algorithm with the following characteristics:

- **Tokens**: Represent the right to make a request
- **Refill**: Tokens are added at a constant rate (per minute)
- **Burst allowance**: Users can accumulate tokens up to a maximum burst size
- **Consumption**: Each request consumes 1 token

**Example**: With 100 requests/minute and burst size 10:
- User can make 10 requests immediately
- After 6 seconds, 1 new token is available
- After 60 seconds, all 100 tokens are available again

### Storage Architecture

#### In-Memory (Primary)
- Fast lookups using `Map<string, TokenBucket>`
- Automatic cleanup every 5 minutes
- Session-specific to avoid cross-session interference

#### SQLite (Optional Persistence)
- `rate_limits` table: Tracks current state for recovery
- `rate_limit_history` table: Audit trail of all rate limit checks
- Useful for distributed deployments or post-restart recovery

## Configuration

### Default Rate Limits

```typescript
// Session-wide limit - applies to all requests from a user
session: 100 requests/minute, burst 10

// Tool category limits
voice: 50 requests/minute, burst 5 (TTS is expensive)
memory: 200 requests/minute, burst 20
system: 500 requests/minute, burst 50

// Per-specific-tool limit
tool: 30 requests/minute, burst 3
```

### Tool Categories

Tools are automatically categorized for appropriate rate limiting:

**Voice Tools:**
- `text_to_speech`, `speak`, `set_voice`
- `enable_talk_mode`, `disable_talk_mode`, `wake_word`

**Memory Tools:**
- `save_fact`, `recall_facts`, `save_entity`
- `save_relationship`, `query_graph`, `search_memory_semantic`

**System Tools:**
- `run_shell`, `datetime`, `search_attachments`
- `read_file`, `write_file`, `list_files`, `delete_file`

### Development Mode

Set `NODE_ENV=development` to get 10x higher limits:
- Session: 1000 req/min (from 100)
- Voice: 500 req/min (from 50)
- Memory: 2000 req/min (from 200)
- System: 5000 req/min (from 500)

## Integration Points

### 1. Agent-Level Rate Limiting (`src/agent.ts`)

```typescript
// Before executing each tool
const rateLimitStatus = rateLimiter.checkRateLimit(sessionId, toolName);
if (!rateLimitStatus.allowed) {
    // Return rate limit error to user
    addToolResult(sessionId, toolCall.id, JSON.stringify({
        error: "Rate limit exceeded",
        retryAfter: rateLimitStatus.retryAfter,
        message: `Try again in ${rateLimitStatus.retryAfter} seconds`
    }));
    continue;
}
```

### 2. WebSocket-Level Rate Limiting (`src/channels/webchat.ts`)

```typescript
// Before executing direct tool calls from WebSocket
const rateLimitStatus = rateLimiter.checkRateLimit(sessionId, toolName);
if (!rateLimitStatus.allowed) {
    ws.send(JSON.stringify({
        type: "tool_response",
        id,
        error: "Rate limit exceeded",
        retryAfter: rateLimitStatus.retryAfter
    }));
    return;
}
```

### 3. HTTP Middleware (Optional)

```typescript
// In express routes
app.use(rateLimitMiddleware(sessionId));
```

## Rate Limit Tools

Three tools are available to users for managing their own rate limits:

### `get_rate_limit_status`

Get current usage and remaining quota:

```json
{
    "success": true,
    "status": {
        "allowed": true,
        "tokensAvailable": 87,
        "requestsThisMinute": 13,
        "retryAfterSeconds": 3,
        "resetTime": "2026-03-04T15:42:30.000Z"
    },
    "limit": {
        "requestsPerMinute": 100,
        "burstSize": 10
    },
    "usage": {
        "percentageUsed": 13
    },
    "message": "You have 87 requests available out of 100 per minute."
}
```

### `update_rate_limits`

Set a custom (lower) rate limit:

```json
{
    "requestsPerMinute": 30
}
```

Returns:
```json
{
    "success": true,
    "message": "Rate limit updated to 30 requests per minute",
    "newLimit": 30
}
```

**Note:** Users can only lower their limits, not increase them.

### `get_rate_limit_history`

View rate limit checks over time:

```json
{
    "limit": 50,
    "sinceMinutesAgo": 60,
    "toolName": "save_fact"
}
```

## Monitoring & Alerts

### Logging

Rate limit violations are logged at WARN level:

```log
⚠️ Session abc123 hit rate limit 6 times in 1 minute
⚠️ Rate limit exceeded for tool 'save_fact' in session abc123
```

### Dashboard Integration

The dashboard can display:
- Current rate limit status
- Usage graph over time
- Approaching limit warnings
- Rate limit history

### Programmatic Access

```typescript
// Get current status
const status = rateLimiter.getStatus(sessionId);
console.log(`${status.tokensAvailable} requests available`);

// Get history
const history = rateLimiter.getHistory(sessionId, {
    limit: 100,
    since: Date.now() - 3600000, // Last hour
    toolName: "save_fact"
});

// Update custom limit
rateLimiter.updateCustomLimit(sessionId, 50);

// Reset limits (admin)
rateLimiter.resetSessionLimits(sessionId);
```

## Error Responses

### Rate Limit Exceeded (429)

```typescript
{
    error: "Rate limit exceeded",
    retryAfter: 15,
    resetTime: 1709552790000,
    message: "Too many requests. Try again in 15 seconds."
}
```

### HTTP Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1709552700
Retry-After: 15
```

## Edge Cases & Behavior

### First Request
- Gets tokens immediately (no waiting)
- Token bucket is initialized with full burst size

### Token Refill Timing
- Refill happens on-demand during rate limit checks
- No background task required
- Accurate to millisecond precision

### WebSocket Disconnects
- Limits are NOT reset on disconnect
- Buckets persist for cleanup interval (5 minutes)
- This prevents abuse via repeated reconnections

### Server Restart
- In-memory limits are lost
- SQLite can persist state if enabled
- Recommended: Configure `ENABLE_METRICS_PERSISTENCE=true` for recovery

### Custom Limits
- Users can only lower their limit, not increase it
- Prevents gaming the system
- Each session has independent limits

## Database Schema

### rate_limits Table
```sql
CREATE TABLE rate_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    identifier TEXT NOT NULL,
    tokens REAL NOT NULL,
    last_refill_time INTEGER NOT NULL,
    request_count INTEGER NOT NULL,
    hit_count INTEGER NOT NULL,
    last_hit_time INTEGER,
    custom_limit_rpm INTEGER,
    updated_at INTEGER NOT NULL,
    UNIQUE(session_id, identifier)
);
```

### rate_limit_history Table
```sql
CREATE TABLE rate_limit_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    session_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    allowed INTEGER NOT NULL,
    tokens_available REAL NOT NULL,
    created_at INTEGER NOT NULL
);
```

## Usage Examples

### Example 1: User Hits Rate Limit on Voice

```
User: "Say hello world"
Agent: Text-to-speech tool call (10th this minute)
Rate Limiter: ✓ Allowed (50/min limit, 42 available)

User: "Say goodbye world"
Agent: Text-to-speech tool call (11th this minute)
Rate Limiter: ✓ Allowed

[User makes 39 more requests quickly]

User: "Say 'final message'"
Agent: Text-to-speech tool call (51st this minute)
Rate Limiter: ✗ Denied
Response: "Rate limit exceeded. Try again in 8 seconds."
```

### Example 2: Custom Rate Limit

```
User: "Update my rate limit to 20 requests per minute"
Agent: Calls update_rate_limits(20)
Result: Custom limit is now 20 req/min (can't exceed default)

User: "Update my rate limit to 1000"
Agent: Calls update_rate_limits(1000)
Result: Error - can't increase beyond default of 100
```

### Example 3: Check Status

```
User: "How many requests do I have left?"
Agent: Calls get_rate_limit_status()
Response: "You have 73 requests available out of 100 per minute (73% remaining)"
```

## Performance Considerations

### Time Complexity
- `checkRateLimit()`: O(1) - direct map lookups
- `getStatus()`: O(1)
- `getHistory()`: O(n) where n is history size (typically <100)

### Space Complexity
- In-memory buckets: O(s) where s = number of active sessions
- History: O(h) where h = `maxHistorySize` (default 10,000)
- SQLite tables: Unbounded, but can be cleaned up periodically

### Optimization Tips
- Set `maxHistorySize` lower for memory-constrained environments
- Enable cleanup interval to remove stale buckets
- For multiprocess deployments, use Redis instead of in-memory storage

## Future Enhancements

1. **Redis Backend**: For distributed rate limiting across multiple processes
2. **User Quotas**: Daily/monthly quotas in addition to per-minute limits
3. **Rate Limit Tiers**: Different limits based on user tier (free, pro, enterprise)
4. **Adaptive Rate Limiting**: Adjust limits based on system load
5. **Rate Limit Sharing**: Allow rate limit redistribution between tools
6. **Priority Queuing**: High-priority requests can exceed limits temporarily

## Testing

Rate limiting can be tested with:

```typescript
// In test files
import { rateLimiter } from "../src/middleware/rate-limit.ts";

// Check rate limit
const status = rateLimiter.checkRateLimit("test-session", "save_fact");
expect(status.allowed).toBe(true);

// Hit limit rapidly
for (let i = 0; i < 35; i++) {
    const s = rateLimiter.checkRateLimit("test-session", "save_fact");
    if (i < 30) expect(s.allowed).toBe(true);
    else expect(s.allowed).toBe(false);
}

// Reset
rateLimiter.resetSessionLimits("test-session");
```

## Troubleshooting

### Problem: "Rate limit exceeded" errors appearing unexpectedly

**Possible causes:**
1. Default limits are too low for workload - use `update_rate_limits` to adjust
2. Multiple tools competing for same token bucket
3. Rapid burst of requests exceeding burst size

**Solutions:**
- Set `NODE_ENV=development` for testing
- Use `get_rate_limit_status` to check available tokens
- Space out requests to allow refill time

### Problem: Rate limits not persisting after restart

**Solution:** Enable SQLite persistence:
- Rate limits state will be saved to `rate_limits` table
- Set environment variable or modify config

## Related Files

- `src/middleware/rate-limit.ts` - Main implementation
- `src/tools/system/rate-limit-tools.ts` - User-facing tools
- `src/agent.ts` - Agent integration
- `src/channels/webchat.ts` - WebSocket integration
- `src/config.ts` - Configuration schema
