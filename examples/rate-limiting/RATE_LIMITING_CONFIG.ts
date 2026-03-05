/**
 * Rate Limiting Configuration Reference
 * 
 * Detailed configuration guide for customizing rate limits
 */

/**
 * DEFAULT RATE LIMIT CONFIGURATIONS
 * 
 * These are the built-in defaults defined in src/middleware/rate-limit.ts
 * To modify, edit the DEFAULT_CONFIGS object in rate-limit.ts
 */

export const RATE_LIMIT_DEFAULTS = {
  session: {
    requestsPerMinute: 100,
    burstSize: 10,
    refillInterval: 60000, // milliseconds
    description:
      "Overall limit per user session. Includes all tools and operations.",
  },

  voice: {
    requestsPerMinute: 50,
    burstSize: 5,
    refillInterval: 60000,
    description:
      "Text-to-speech, voice synthesis, and audio generation. Limited due to API costs.",
    tools:
      "text_to_speech, speak, set_voice, enable_talk_mode, disable_talk_mode",
  },

  memory: {
    requestsPerMinute: 200,
    burstSize: 20,
    refillInterval: 60000,
    description:
      "Fact storage, entity relationships, semantic search. Higher limit for knowledge work.",
    tools: "save_fact, recall_facts, save_entity, save_relationship, query_graph, search_memory_semantic",
  },

  system: {
    requestsPerMinute: 500,
    burstSize: 50,
    refillInterval: 60000,
    description:
      "Shell commands, file operations, system utilities. Highest limit for local operations.",
    tools: "run_shell, datetime, read_file, write_file, list_files, delete_file",
  },

  tool: {
    requestsPerMinute: 30,
    burstSize: 3,
    refillInterval: 60000,
    description:
      "Per-specific-tool limit. Prevents abuse of individual tools even within category limits.",
    tools: "All unmapped tools",
  },
};

/**
 * ENVIRONMENT-BASED CONFIGURATION
 * 
 * The rate limiter automatically adjusts based on:
 * 1. NODE_ENV - Development mode gets 10x higher limits
 * 2. LOG_LEVEL - Debug logging for rate limit checks
 */

export const ENV_CONFIGURATION = {
  NODE_ENV: {
    description:
      "Environment setting. Set to 'development' for 10x higher limits.",
    values: {
      development:
        "Development mode - 10x higher limits for testing (100->1000, 50->500, etc.)",
      production:
        "Production mode - standard limits apply",
    },
    example: "NODE_ENV=development npm run dev",
  },

  LOG_LEVEL: {
    description: "Controls verbosity of rate limiting logs.",
    values: {
      debug: "Detailed rate limit checks are logged",
      info: "Only rate limit violations are logged",
      warn: "Only warnings and errors are logged",
      error: "Only errors are logged",
    },
    example: "LOG_LEVEL=debug npm start",
  },
};

/**
 * DATABASE CONFIGURATION
 * 
 * Rate limit state can be persisted to SQLite
 */

export const DATABASE_CONFIGURATION = {
  tables: {
    rate_limits: {
      description:
        "Stores current rate limit bucket state for recovery after restarts",
      columns: [
        "id - Primary key",
        "session_id - User session identifier",
        "identifier - Bucket key (e.g., 'session:uuid', 'tool:uuid:name')",
        "tokens - Current token count",
        "last_refill_time - Unix timestamp of last refill",
        "request_count - Requests in current minute",
        "hit_count - Times limit was exceeded",
        "last_hit_time - Last violation time",
        "custom_limit_rpm - User's custom limit (if set)",
        "updated_at - Last update timestamp",
      ],
      indexed: ["session_id", "identifier"],
    },

    rate_limit_history: {
      description: "Audit trail of all rate limit checks",
      columns: [
        "id - Primary key",
        "timestamp - Check time",
        "session_id - User session",
        "tool_name - Tool that was checked",
        "allowed - Whether request was allowed",
        "tokens_available - Available tokens at check time",
        "created_at - Record timestamp",
      ],
      indexed: ["session_id", "timestamp", "tool_name"],
      note:
        "This table can grow large. Implement cleanup jobs to purge old entries beyond 30 days.",
    },
  },

  cleanup: {
    memoryBuckets: {
      interval: "5 minutes",
      criteria: "Remove buckets not used in last 1 hour",
    },
    historyRecords: {
      interval: "Manual (on cleanup call)",
      criteria: "Remove records older than 1 hour",
      command:
        "DELETE FROM rate_limit_history WHERE created_at < (current_timestamp - 3600000)",
    },
  },
};

/**
 * CUSTOMIZATION GUIDE
 * 
 * How to modify rate limits for your deployment
 */

export const CUSTOMIZATION_GUIDE = {
  approach1_modifyDefaults: {
    description: "Edit default configs in rate-limit.ts (global change)",
    steps: [
      "1. Open src/middleware/rate-limit.ts",
      "2. Locate DEFAULT_CONFIGS object",
      "3. Modify requestsPerMinute, burstSize, refillInterval as needed",
      "4. Restart the application",
    ],
    pros: ["Simple, applies to all users"],
    cons: ["Requires restart, global change"],
    example: `
      const DEFAULT_CONFIGS = {
        session: {
          requestsPerMinute: 200,  // Increased from 100
          burstSize: 20,           // Increased from 10
          refillInterval: 60000,
        },
        // ... other configs
      };
    `,
  },

  approach2_devMode: {
    description:
      "Use NODE_ENV=development for testing (10x higher limits)",
    steps: [
      "1. Set NODE_ENV=development",
      "2. Start application",
      "3. Rate limits are automatically 10x higher",
      "4. No code changes needed",
    ],
    pros: [
      "No code changes, no restart needed (set before start)",
      "Easy to test",
    ],
    cons: ["Only for development, not for production"],
    example: "NODE_ENV=development npm run dev",
  },

  approach3_userCustom: {
    description:
      "Let users set their own lower limits via update_rate_limits tool",
    steps: [
      "1. User calls update_rate_limits(newLimit)",
      "2. Limit is validated (must be >= 1 and <= default)",
      "3. Custom limit is stored in database",
      "4. Applied on next request",
    ],
    pros: [
      "User control, no admin intervention needed",
      "Stored in database",
    ],
    cons: [
      "Users can only lower limits, not increase",
      "Requires tool execution",
    ],
    example: 'User message: "Set my rate limit to 30 requests per minute"',
  },

  approach4_middleware: {
    description: "Add express middleware to REST endpoints (optional)",
    steps: [
      "1. Import rateLimitMiddleware from rate-limit.ts",
      "2. Add to express app: app.use(rateLimitMiddleware())",
      "3. Automatically rate limits all HTTP requests",
    ],
    pros: ["Protects all HTTP endpoints"],
    cons: ["Requires code modification"],
    example: `
      import { rateLimitMiddleware } from "./middleware/rate-limit.ts";
      app.use(rateLimitMiddleware(sessionId));
    `,
  },
};

/**
 * TOOL CATEGORY MAPPING
 * 
 * How tools are categorized for rate limiting
 * This determines which limit is applied
 */

export const TOOL_CATEGORIES = {
  voice: {
    limit: "50 req/min, burst 5",
    reason: "TTS API calls are expensive",
    tools: [
      "text_to_speech",
      "speak",
      "set_voice",
      "enable_talk_mode",
      "disable_talk_mode",
      "wake_word",
    ],
  },

  memory: {
    limit: "200 req/min, burst 20",
    reason: "Storage and semantic search operations",
    tools: [
      "save_fact",
      "recall_facts",
      "save_entity",
      "save_relationship",
      "query_graph",
      "search_memory_semantic",
      "search_facts",
      "search_entities",
      "search_relationships",
    ],
  },

  system: {
    limit: "500 req/min, burst 50",
    reason: "Local operations, lower resource impact",
    tools: [
      "run_shell",
      "datetime",
      "search_attachments",
      "read_file",
      "write_file",
      "list_files",
      "delete_file",
    ],
  },

  tool: {
    limit: "30 req/min, burst 3",
    reason: "Per-tool limit for unmapped tools",
    tools: ["All tools not explicitly categorized"],
  },
};

/**
 * MONITORING & OBSERVABILITY
 * 
 * How to monitor rate limiting in production
 */

export const MONITORING = {
  databaseQueries: {
    checkViolations: `
      SELECT 
        session_id,
        COUNT(*) as violation_count,
        MAX(timestamp) as last_violation
      FROM rate_limit_history
      WHERE allowed = 0 
        AND created_at > datetime('now', '-1 hour')
      GROUP BY session_id
      HAVING violation_count > 5
      ORDER BY violation_count DESC;
    `,

    topViolatingTools: `
      SELECT 
        tool_name,
        COUNT(*) as total_calls,
        SUM(CASE WHEN allowed = 0 THEN 1 ELSE 0 END) as violations,
        ROUND(100.0 * SUM(CASE WHEN allowed = 0 THEN 1 ELSE 0 END) / COUNT(*), 2) as violation_rate
      FROM rate_limit_history
      WHERE created_at > datetime('now', '-1 hour')
      GROUP BY tool_name
      ORDER BY violations DESC;
    `,

    userTrendsLastDay: `
      SELECT 
        session_id,
        COUNT(*) as total_calls,
        SUM(CASE WHEN allowed = 0 THEN 1 ELSE 0 END) as violations,
        COUNT(DISTINCT tool_name) as unique_tools,
        MIN(timestamp) as first_call,
        MAX(timestamp) as last_call
      FROM rate_limit_history
      WHERE created_at > datetime('now', '-1 day')
      GROUP BY session_id
      ORDER BY total_calls DESC;
    `,
  },

  logPatterns: {
    watchFor: [
      "⚠️ Session XXX hit rate limit N times in 1 minute",
      "Rate limit exceeded for tool",
      "Failed to check rate limit",
    ],
    alertConditions: [
      "Same session hits limit 5+ times per hour",
      "Same tool causes >10% violation rate",
      "Database errors during rate limit checks",
    ],
  },
};

/**
 * SCALING CONSIDERATIONS
 * 
 * For high-traffic deployments
 */

export const SCALING = {
  inMemory: {
    description: "Fast but not distributed",
    pros: ["< 1ms per check", "No network latency"],
    cons: ["Limits lost on restart", "Not shared across processes"],
    suitable: "Single process or development environments",
  },

  withSQLite: {
    description: "Persistent but slower than in-memory",
    pros: ["Survives restarts", "Audit trail"],
    cons: ["Disk I/O overhead", "Still not distributed"],
    suitable: "Single server deployments that need persistence",
  },

  withRedis: {
    description:
      "Distributed rate limiting (recommended for production)",
    pros: ["Shared across processes", "Fast", "Survives restarts"],
    cons: ["Requires Redis infrastructure", "Network latency"],
    suitable: "High-traffic, multi-process, or serverless deployments",
    implementation: "Future enhancement - replace Map with Redis client",
  },
};

/**
 * EXAMPLE CONFIGURATIONS
 * 
 * Pre-configured setups for different scenarios
 */

export const EXAMPLE_CONFIGS = {
  development: {
    description: "Development setup - high limits, detailed logging",
    NODE_ENV: "development",
    LOG_LEVEL: "debug",
    note: "Automatically gets 10x higher rate limits",
  },

  testing: {
    description:
      "Testing setup - only in-memory, fast cleanup, 5x higher limits",
    modifications: {
      DEFAULT_CONFIGS: {
        session: { requestsPerMinute: 500, burstSize: 50 },
        voice: { requestsPerMinute: 250, burstSize: 25 },
        memory: { requestsPerMinute: 1000, burstSize: 100 },
        system: { requestsPerMinute: 2500, burstSize: 250 },
      },
    },
    NODE_ENV: "development",
  },

  production: {
    description:
      "Production setup - normal limits, persistence enabled, error logging",
    NODE_ENV: "production",
    LOG_LEVEL: "warn",
    database: "SQLite persistence enabled",
    cleanup: "Every 5 minutes",
    monitoring: "Query rate_limit_history table hourly",
  },

  restrictive: {
    description:
      "Restrictive setup - lower limits for testing quota enforcement",
    modifications: {
      DEFAULT_CONFIGS: {
        session: { requestsPerMinute: 10, burstSize: 2 },
        voice: { requestsPerMinute: 5, burstSize: 1 },
        memory: { requestsPerMinute: 20, burstSize: 3 },
        system: { requestsPerMinute: 50, burstSize: 5 },
      },
    },
  },
};

/**
 * TROUBLESHOOTING CONFIGURATION ISSUES
 */

export const TROUBLESHOOTING = {
  symptom1: {
    issue: "All users hitting limits immediately",
    causes: [
      "Burst size is too small",
      "requestsPerMinute is too low",
      "Clock sync issues between processes",
    ],
    solutions: [
      "Check DEFAULT_CONFIGS values",
      "Increase burst size and requestsPerMinute",
      "Verify server time synchronization",
    ],
  },

  symptom2: {
    issue: "Limits not working at all",
    causes: [
      "Rate limit check is not in code path",
      "Tool category mapping is wrong",
      "Rate limiter instance is not initialized",
    ],
    solutions: [
      "Verify rate limit check in agent.ts and webchat.ts",
      "Check TOOL_CATEGORIES mapping",
      "Ensure rateLimiter is imported and initialized at startup",
    ],
  },

  symptom3: {
    issue: "Database growing too large",
    causes: ["history records not being cleaned up"],
    solutions: [
      "Stop application",
      "Manually clean old records",
      "Verify cleanup interval runs every 5 minutes",
    ],
  },
};
