# Rate Limiting Quick Reference

## What It Is

Gravity Claw includes a built-in **Token Bucket Rate Limiter** that protects against abuse and ensures fair resource allocation:

- **Per-session limits** (100 req/min default)
- **Per-tool-category limits** (voice: 50/min, memory: 200/min, system: 500/min)
- **Burst allowance** (initial credits for immediate requests)
- **Automatic cleanup** (expired sessions removed every 5 minutes)

## Key Locations

| File | Purpose |
|------|---------|
| `src/middleware/rate-limit.ts` | Core rate limiter implementation |
| `src/tools/system/rate-limit-tools.ts` | User-facing rate limit tools |
| `src/agent.ts` | Agent-level integration |
| `src/channels/webchat.ts` | WebSocket integration |
| `src/__tests__/rate-limit.test.ts` | Test suite |
| `docs/RATE_LIMITING.md` | Full documentation |

## For Developers

### Check Rate Limit Before Tool Execution

```typescript
import { rateLimiter } from "./middleware/rate-limit.ts";

const status = rateLimiter.checkRateLimit(sessionId, toolName);
if (!status.allowed) {
    return { error: "Rate limit exceeded", retryAfter: status.retryAfter };
}
// Execute tool here
```

### Monitor Usage

```typescript
const status = rateLimiter.getStatus(sessionId);
console.log(`${status.tokensAvailable} requests available`);
```

### View History

```typescript
const history = rateLimiter.getHistory(sessionId, {
    limit: 100,
    since: Date.now() - 3600000 // Last hour
});
```

## For Users

### Check Your Quota

Use the `get_rate_limit_status` tool in chat:

```
User: "How many requests do I have left?"
Agent: Calls get_rate_limit_status()
Response: "You have 87 requests available out of 100 per minute"
```

### Customize Your Limits

Use the `update_rate_limits` tool to lower your personal limit:

```
User: "Set my rate limit to 50 requests per minute"
Agent: Calls update_rate_limits(50)
Response: "Rate limit updated to 50 requests per minute"
```

### Review History

Use the `get_rate_limit_history` tool to see your usage:

```
User: "Show me my rate limit violations"
Agent: Calls get_rate_limit_history()
Response: List of recent limit violations with timestamps
```

## Default Limits

| Category | Requests/Min | Burst | Cost |
|----------|--------------|-------|------|
| Session (global) | 100 | 10 | User quota |
| Voice tools | 50 | 5 | TTS expensive |
| Memory tools | 200 | 20 | Storage intensive |
| System tools | 500 | 50 | Local operations |
| Individual tool | 30 | 3 | Per-tool guard |

## Development Mode

Set `NODE_ENV=development` for 10x higher limits:

```bash
NODE_ENV=development npm run dev
```

Useful for testing and debugging without hitting limits.

## Error Response Format

When limit is exceeded:

```json
{
    "error": "Rate limit exceeded",
    "retryAfter": 15,
    "resetTime": 1709552790000,
    "message": "Too many requests. Try again in 15 seconds."
}
```

HTTP Headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1709552700
Retry-After: 15
```

## Troubleshooting

### "Rate limit exceeded" errors

- Use `get_rate_limit_status` to check available tokens
- Set `NODE_ENV=development` for testing
- Use `update_rate_limits` to lower your own limit if needed
- Wait for tokens to refill (available every 60 seconds)

### Custom limit not working

- Can only lower limits, not increase them
- Can't go below 1 request/minute
- Check error message for details

### Rate limit keeps resetting

- Limits are per-session
- Server restart clears in-memory limits
- WebSocket disconnects don't reset limits
- Use `get_rate_limit_history` to verify behavior

## Integration Checklist

- [x] Rate limiter middleware created
- [x] Token bucket algorithm implemented
- [x] Per-session and per-tool limits
- [x] Tool category classification
- [x] Rate limit tools for user management
- [x] Agent-level integration
- [x] WebSocket-level integration
- [x] SQLite persistence tables
- [x] Automatic cleanup scheduler
- [x] Error response formatting
- [x] Development mode support
- [x] Monitoring and history tracking
- [x] Test suite coverage
- [x] Documentation and examples

## Performance Impact

- **Time complexity**: O(1) for checks (hash table lookups)
- **Space complexity**: O(s*t) where s=sessions, t=tools
- **Overhead**: <1ms per rate limit check
- **Memory usage**: ~1KB per active session

## Future Enhancements

- [ ] Redis backend for distributed systems
- [ ] User tiers with different limits
- [ ] Daily/weekly/monthly quotas
- [ ] Rate limit sharing between tools
- [ ] Adaptive limiting based on system load
- [ ] Priority queuing for high-priority requests

## Related Files

- See `RATE_LIMITING.md` for comprehensive documentation
- See `rate-limiting-examples.ts` for usage patterns
- See `rate-limit.test.ts` for test cases
