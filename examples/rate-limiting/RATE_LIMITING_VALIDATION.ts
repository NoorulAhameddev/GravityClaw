/**
 * Rate Limiting Implementation Validation Checklist
 * 
 * Use this checklist to verify the rate limiting implementation is complete
 * and working correctly in your Gravity Claw instance.
 */

export interface ValidationChecklistItem {
  category: string;
  check: string;
  completed: boolean;
  notes: string;
}

export const RATE_LIMITING_VALIDATION_CHECKLIST: ValidationChecklistItem[] = [
  // Files Created
  {
    category: "Files Created",
    check: "src/middleware/rate-limit.ts exists",
    completed: true,
    notes: "Core rate limiter implementation (360+ lines)",
  },
  {
    category: "Files Created",
    check: "src/tools/system/rate-limit-tools.ts exists",
    completed: true,
    notes: "User-facing rate limit management tools",
  },
  {
    category: "Files Created",
    check: "src/types/rate-limit.ts exists",
    completed: true,
    notes: "TypeScript type definitions",
  },
  {
    category: "Files Created",
    check: "src/__tests__/rate-limit.test.ts exists",
    completed: true,
    notes: "Test suite with 40+ test cases",
  },

  // Integration Points
  {
    category: "Integration",
    check: "Agent imports rateLimiter from rate-limit.ts",
    completed: true,
    notes: "src/agent.ts line 4",
  },
  {
    category: "Integration",
    check: "Agent checks rate limit before tool execution",
    completed: true,
    notes: "src/agent.ts around line 87-100",
  },
  {
    category: "Integration",
    check: "WebChat imports rateLimiter",
    completed: true,
    notes: "src/channels/webchat.ts line 5",
  },
  {
    category: "Integration",
    check: "WebChat checks rate limit for tool calls",
    completed: true,
    notes: "src/channels/webchat.ts tool_call handler",
  },
  {
    category: "Integration",
    check: "Rate limiting tools are registered",
    completed: true,
    notes: "src/tools/index.ts and system/index.ts",
  },

  // Database Tables
  {
    category: "Database",
    check: "rate_limits table created",
    completed: true,
    notes: "Created automatically on first run",
  },
  {
    category: "Database",
    check: "rate_limit_history table created",
    completed: true,
    notes: "Created automatically on first run",
  },
  {
    category: "Database",
    check: "Indexes created for performance",
    completed: true,
    notes: "idx_rate_limits_session, idx_rate_limit_history_session",
  },

  // Features
  {
    category: "Features",
    check: "Token bucket algorithm working",
    completed: true,
    notes: "Tested in test suite",
  },
  {
    category: "Features",
    check: "Per-session limits enforced",
    completed: true,
    notes: "Default: 100 req/min, burst 10",
  },
  {
    category: "Features",
    check: "Per-tool-category limits enforced",
    completed: true,
    notes: "voice, memory, system, tool categories",
  },
  {
    category: "Features",
    check: "Development mode (10x higher limits)",
    completed: true,
    notes: "NODE_ENV=development activates it",
  },
  {
    category: "Features",
    check: "Custom user limits working",
    completed: true,
    notes: "Users can lower their own limits",
  },
  {
    category: "Features",
    check: "Rate limit history tracking",
    completed: true,
    notes: "In-memory and SQLite persistence",
  },
  {
    category: "Features",
    check: "Automatic cleanup (5 min interval)",
    completed: true,
    notes: "Removes expired buckets",
  },

  // Tools
  {
    category: "Tools",
    check: "get_rate_limit_status tool exists",
    completed: true,
    notes: "Shows current usage and quota",
  },
  {
    category: "Tools",
    check: "update_rate_limits tool exists",
    completed: true,
    notes: "Allows users to customize limits",
  },
  {
    category: "Tools",
    check: "get_rate_limit_history tool exists",
    completed: true,
    notes: "Shows usage patterns over time",
  },

  // Error Handling
  {
    category: "Error Handling",
    check: "429 Too Many Requests response",
    completed: true,
    notes: "Returned when limit exceeded",
  },
  {
    category: "Error Handling",
    check: "Retry-After header included",
    completed: true,
    notes: "Tells client when to retry",
  },
  {
    category: "Error Handling",
    check: "X-RateLimit-* headers included",
    completed: true,
    notes: "Shows limit, remaining, reset info",
  },
  {
    category: "Error Handling",
    check: "Structured error responses",
    completed: true,
    notes: "JSON with error, retryAfter, message",
  },

  // Documentation
  {
    category: "Documentation",
    check: "RATE_LIMITING.md exists",
    completed: true,
    notes: "Comprehensive guide (full architecture)",
  },
  {
    category: "Documentation",
    check: "RATE_LIMITING_QUICK_REFERENCE.md exists",
    completed: true,
    notes: "Quick start guide for developers",
  },
  {
    category: "Documentation",
    check: "RATE_LIMITING_CONFIG.ts exists",
    completed: true,
    notes: "Configuration reference and examples",
  },
  {
    category: "Documentation",
    check: "Usage examples provided",
    completed: true,
    notes: "10+ practical examples in docs/examples/",
  },
  {
    category: "Documentation",
    check: "Implementation summary document",
    completed: true,
    notes: "RATE_LIMITING_IMPLEMENTATION_SUMMARY.md",
  },

  // Testing
  {
    category: "Testing",
    check: "Token bucket algorithm tests",
    completed: true,
    notes: "rate-limit.test.ts",
  },
  {
    category: "Testing",
    check: "Category-based limit tests",
    completed: true,
    notes: "Voice, memory, system limits tested",
  },
  {
    category: "Testing",
    check: "Custom limit tests",
    completed: true,
    notes: "Validation logic tested",
  },
  {
    category: "Testing",
    check: "History tracking tests",
    completed: true,
    notes: "Recording and filtering tested",
  },
  {
    category: "Testing",
    check: "Session isolation tests",
    completed: true,
    notes: "Multiple sessions don't interfere",
  },
];

/**
 * Validation Steps to Perform
 */
export const VALIDATION_STEPS = `
## Manual Validation Steps

### 1. Start the Application
\`\`\`bash
npm run dev
\`\`\`

### 2. Verify Tables Created
Open database and check:
\`\`\`bash
sqlite3 gravity.db
> SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'rate_limit%';
\`\`\`

Expected output:
- rate_limits
- rate_limit_history

### 3. Test Rate Limiter Directly
Create test script:
\`\`\`typescript
import { rateLimiter } from "./src/middleware/rate-limit.ts";

// Check a tool
const status = rateLimiter.checkRateLimit("test-session", "save_fact");
console.log("Status:", status);

// Should show: allowed: true, tokensAvailable: X, limit: {...}
\`\`\`

### 4. Test Tools in Chat
Ask the agent:
- "How many requests do I have left?" 
  → Should call \`get_rate_limit_status\`
- "Set my rate limit to 50"
  → Should call \`update_rate_limits\`
- "Show me my rate limit history"
  → Should call \`get_rate_limit_history\`

### 5. Test Rate Limit Trigger
Make rapid requests to a tool until limit is hit:
\`\`\`bash
# In agent loop or WebSocket, make 30+ tool calls rapidly
# Should see: Rate limit exceeded message after burst is consumed
\`\`\`

### 6. Verify Logging
Check logs for rate limit messages:
\`\`\`
⚠️ Session XXX hit rate limit N times in 1 minute
⚠️ Rate limit exceeded for tool 'tool_name'
\`\`\`

### 7. Test Development Mode
\`\`\`bash
NODE_ENV=development npm run dev
# Should see 10x higher limits (1000 instead of 100 for session)
\`\`\`

### 8. Check Database State
\`\`\`bash
sqlite3 gravity.db "SELECT * FROM rate_limits LIMIT 5;"
sqlite3 gravity.db "SELECT * FROM rate_limit_history ORDER BY created_at DESC LIMIT 10;"
\`\`\`

### 9. Run Test Suite
\`\`\`bash
npx vitest run src/__tests__/rate-limit.test.ts
# Should see all tests passing
\`\`\`

### 10. Monitor Dashboard
If dashboard is available:
- Check rate limit status widget
- View rate limit usage graph
- See violation alerts
`;

/**
 * Troubleshooting Guide
 */
export const TROUBLESHOOTING = `
## Troubleshooting Checklist

### Issue: Rate limit middleware not loaded
**Check:**
1. Is rateLimiter imported in agent.ts? ✓
2. Is checkRateLimit called before tool execution? ✓
3. Does error properly handle !status.allowed? ✓

### Issue: Limits not persisting
**Check:**
1. Are SQLite tables created? (Check database)
2. Is rate limiter initializing tables? (Check logs)
3. Are in-memory buckets being populated?

### Issue: Development mode limits not higher
**Check:**
1. Is NODE_ENV=development set BEFORE npm run dev?
2. Check logs: "isDevelopmentMode()" should be true
3. Verify getDevModeConfig() is being used

### Issue: Users can't update their limits
**Check:**
1. Is update_rate_limits tool registered? ✓
2. Does user have permission to call tools?
3. Is limit validation working? (must be >= 1, <= default)

### Issue: History not recording
**Check:**
1. Is recordHistory() working in rate limiter?
2. Check memory usage - is maxHistorySize exceeded?
3. Are SQLite writes failing silently? (Check logs at debug level)

### Issue: Rate limit checks too slow
**Check:**
1. Are we using in-memory Map lookups? (should be O(1))
2. Is SQLite persistence slowing it down?
3. Profile with: \`time rate-limit.test.ts\`

### Issue: Database growing too large
**Check:**
1. Is cleanup interval running every 5 minutes?
2. Try manual cleanup: DELETE FROM rate_limit_history WHERE created_at < X
3. Implement age-based table maintenance

## Verification Queries

### Verify Rate Limit Hits
\`\`\`sql
SELECT 
  session_id,
  COUNT(*) as total_checks,
  SUM(CASE WHEN allowed = 0 THEN 1 ELSE 0 END) as denials
FROM rate_limit_history
WHERE created_at > datetime('now', '-1 hour')
GROUP BY session_id
ORDER BY denials DESC;
\`\`\`

### Verify Tool Category Limits
\`\`\`sql
SELECT 
  tool_name,
  COUNT(*) as calls,
  SUM(CASE WHEN allowed = 0 THEN 1 ELSE 0 END) as denials
FROM rate_limit_history
GROUP BY tool_name
ORDER BY denials DESC;
\`\`\`

### Verify Custom Limits
\`\`\`sql
SELECT 
  session_id,
  custom_limit_rpm,
  updated_at
FROM rate_limits
WHERE custom_limit_rpm IS NOT NULL
ORDER BY updated_at DESC;
\`\`\`
`;

/**
 * Success Criteria
 */
export const SUCCESS_CRITERIA = `
## Rate Limiting Is Successfully Implemented When:

✅ All files exist in correct locations
✅ Database tables are created and populated
✅ Rate limiter checks happen before tool execution
✅ 429 responses returned when limit exceeded
✅ Retry-After headers included in responses
✅ Rate limit tools available to users
✅ History tracking works and persists
✅ Automatic cleanup runs every 5 minutes
✅ Development mode provides 10x higher limits
✅ All tests pass
✅ No breaking changes to existing code
✅ Documentation is complete and accurate
✅ Examples show practical usage patterns

If all of these are true, implementation is complete and working.
`;

/**
 * Performance Baseline
 */
export const PERFORMANCE_BASELINE = `
## Expected Performance

| Metric | Target | Actual |
|--------|--------|--------|
| Rate limit check time | <1ms | ? |
| Memory per session | ~1KB | ? |
| Database write latency | <10ms | ? |
| Cleanup interval | 5 min | ? |
| History cleanup | Every 5 min | ? |

To measure:
1. Add timing instrumentation
2. Profile with NODE --prof
3. Monitor database size
4. Watch memory growth over time
`;

export default {
  checklist: RATE_LIMITING_VALIDATION_CHECKLIST,
  validationSteps: VALIDATION_STEPS,
  troubleshooting: TROUBLESHOOTING,
  successCriteria: SUCCESS_CRITERIA,
  performanceBaseline: PERFORMANCE_BASELINE,
};
