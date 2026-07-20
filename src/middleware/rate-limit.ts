/**
 * Rate Limiting Middleware with Token Bucket Algorithm
 * 
 * Implements per-session and per-tool rate limiting using the Token Bucket algorithm.
 * Supports both in-memory and SQLite persistence for distributed systems.
 * 
 * Features:
 * - Token bucket algorithm for smooth rate limiting
 * - Per-session and per-tool limits
 * - Configurable burst allowance
 * - Automatic cleanup of expired sessions
 * - Rate limit status tracking
 * - Dashboard integration
 */

import { db } from "../db.ts";
import { createLogger } from "../logger.ts";
import { config } from "../config.ts";

const log = createLogger("rate-limit");

/**
 * Rate limit configuration per category
 */
export interface RateLimitConfig {
  requestsPerMinute: number;
  burstSize: number;
  refillInterval: number; // ms
}

/**
 * Token bucket state
 */
export interface TokenBucket {
  tokens: number;
  lastRefillTime: number;
  requestCount: number;
  hitCount: number; // Times the limit was exceeded
  lastHitTime?: number;
}

/**
 * Rate limit status response
 */
export interface RateLimitStatus {
  allowed: boolean;
  tokensAvailable: number;
  tokensRequired: number;
  requestsThisMinute: number;
  resetTime: number;
  retryAfter: number;
  limit: {
    requestsPerMinute: number;
    burstSize: number;
  };
}

/**
 * Rate limit history entry
 */
export interface RateLimitHistoryEntry {
  timestamp: number;
  sessionId: string;
  toolName: string;
  allowed: boolean;
  tokensAvailable: number;
}

/**
 * Default rate limit configurations
 */
const DEFAULT_CONFIGS: Record<string, RateLimitConfig> = {
  // Session-wide limit
  "session": {
    requestsPerMinute: 100,
    burstSize: 100,
    refillInterval: 60000, // 60 seconds
  },
  // Tool categories
  "voice": {
    requestsPerMinute: 50,
    burstSize: 5,
    refillInterval: 60000,
  },
  "memory": {
    requestsPerMinute: 200,
    burstSize: 20,
    refillInterval: 60000,
  },
  "system": {
    requestsPerMinute: 500,
    burstSize: 50,
    refillInterval: 60000,
  },
  // Per-tool limit
  "tool": {
    requestsPerMinute: 30,
    burstSize: 3,
    refillInterval: 60000,
  },
  // LLM API limit
  "llm": {
    requestsPerMinute: 60,
    burstSize: 20,
    refillInterval: 60000,
  },
  // HTTP endpoint limit
  "http": {
    requestsPerMinute: 120,
    burstSize: 30,
    refillInterval: 60000,
  },
};

/**
 * Tool categories mapping
 */
const TOOL_CATEGORIES: Record<string, string> = {
  // Voice tools
  "text_to_speech": "voice",
  "speak": "voice",
  "set_voice": "voice",
  "enable_talk_mode": "voice",
  "disable_talk_mode": "voice",
  "wake_word": "voice",
  
  // Memory tools
  "save_fact": "memory",
  "recall_facts": "memory",
  "save_entity": "memory",
  "save_relationship": "memory",
  "query_graph": "memory",
  "search_memory_semantic": "memory",
  "search_facts": "memory",
  "search_entities": "memory",
  "search_relationships": "memory",
  
  // System tools
  "run_shell": "system",
  "datetime": "system",
  "search_attachments": "system",
  "read_file": "system",
  "write_file": "system",
  "list_files": "system",
  "delete_file": "system",
  
  // LLM API
  "llm_api_call": "llm",
};

/**
 * Rate Limiter Manager
 * Handles all rate limiting operations with in-memory and SQLite backends
 */
export class RateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();
  private history: RateLimitHistoryEntry[] = [];
  private customLimitsMap: Map<string, number> = new Map();
  private maxHistorySize: number = 10000;
  private cleanupIntervalMs: number = 5 * 60 * 1000; // 5 minutes
  private isEnvironmentDev: boolean = (process.env.NODE_ENV || "development") === "development";

  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startCleanupInterval();
  }

  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Start periodic cleanup of expired buckets and old history
   */
  private startCleanupInterval(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupIntervalMs);
  }

  /**
   * Get rate limit configuration for a key
   */
  private getConfig(key: string): RateLimitConfig {
    return DEFAULT_CONFIGS[key] || DEFAULT_CONFIGS["tool"]!;
  }

  /**
   * Get tool category for rate limiting
   */
  private getToolCategory(toolName: string): string {
    return TOOL_CATEGORIES[toolName] || "tool";
  }

  /**
   * Get or create a token bucket
   */
  private getBucket(identifier: string): TokenBucket {
    let bucket = this.buckets.get(identifier);
    
    if (!bucket) {
      // Extract config category from compound keys like 'session:xyz', 'tool:xyz:voice'
      const configKey = identifier.startsWith("session:") ? "session"
        : identifier.startsWith("tool:") ? identifier.split(":").slice(2).join(":") || "tool"
        : identifier.startsWith("http:") || identifier.startsWith("webhook:") ? "http"
        : identifier;
      bucket = {
        tokens: this.getConfig(configKey).burstSize,
        lastRefillTime: Date.now(),
        requestCount: 0,
        hitCount: 0,
      };
      this.buckets.set(identifier, bucket);
    }

    return bucket;
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refillTokens(bucket: TokenBucket, config: RateLimitConfig): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefillTime;
    const refills = Math.floor(elapsed / config.refillInterval);

    if (refills > 0) {
      const tokensPerRefill = config.requestsPerMinute / (60000 / config.refillInterval);
      const newTokens = Math.min(
        config.burstSize,
        bucket.tokens + refills * tokensPerRefill
      );
      
      bucket.tokens = newTokens;
      bucket.lastRefillTime = now - (elapsed % config.refillInterval);
      bucket.requestCount = 0;
    }
  }

  /**
   * Get the time until the next token refill
   */
  private getTimeUntilRefill(bucket: TokenBucket, config: RateLimitConfig): number {
    const timeUntilRefill = config.refillInterval - (Date.now() - bucket.lastRefillTime);
    return Math.max(0, Math.ceil(timeUntilRefill / 1000)); // Return in seconds
  }

  /**
   * Check if a request should be allowed
   */
  checkRateLimit(
    sessionId: string,
    toolName: string,
    options?: { customLimitRpm?: number }
  ): RateLimitStatus {
    const toolCategory = this.getToolCategory(toolName);
    const now = Date.now();

    // Check session-level limit
    const sessionKey = `session:${sessionId}`;
    const sessionBucket = this.getBucket(sessionKey);
    const sessionConfig = this.getConfig("session");
    
    // Check if custom limit is set (from session settings)
    const effectiveSessionLimit = options?.customLimitRpm || sessionConfig.requestsPerMinute;
    const effectiveSessionConfig: RateLimitConfig = {
      ...sessionConfig,
      requestsPerMinute: effectiveSessionLimit,
    };

    this.refillTokens(sessionBucket, effectiveSessionConfig);

    // Check tool category limit
    const toolKey = `tool:${sessionId}:${toolCategory}`;
    const toolBucket = this.getBucket(toolKey);
    const toolConfig = this.getConfig(toolCategory);
    this.refillTokens(toolBucket, toolConfig);

    const tokensRequired = 1;

    // Only apply specific-tool limit for uncategorized tools
    let specificToolAllowed = true;
    let specificToolBucket: TokenBucket | undefined;
    if (toolCategory === "tool") {
      const specificToolKey = `tool:${sessionId}:${toolName}`;
      specificToolBucket = this.getBucket(specificToolKey);
      const specificToolConfig = this.getConfig("tool");
      this.refillTokens(specificToolBucket, specificToolConfig);
      specificToolAllowed = specificToolBucket.tokens >= tokensRequired;
    }


    // Determine if allowed
    const sessionAllowed = sessionBucket.tokens >= tokensRequired;
    const toolAllowed = toolBucket.tokens >= tokensRequired;
    
    const allowed = sessionAllowed && toolAllowed && specificToolAllowed;

    // Update history
    const minTokens = specificToolBucket
      ? Math.min(sessionBucket.tokens, toolBucket.tokens, specificToolBucket.tokens)
      : Math.min(sessionBucket.tokens, toolBucket.tokens);
    this.recordHistory({
      timestamp: now,
      sessionId,
      toolName,
      allowed,
      tokensAvailable: minTokens,
    });

    if (allowed) {
      // Consume tokens
      sessionBucket.tokens -= tokensRequired;
      toolBucket.tokens -= tokensRequired;
      if (specificToolBucket) specificToolBucket.tokens -= tokensRequired;
      
      sessionBucket.requestCount++;
      toolBucket.requestCount++;
      if (specificToolBucket) specificToolBucket.requestCount++;
    } else {
      // Record hit
      sessionBucket.hitCount++;
      toolBucket.hitCount++;
      if (specificToolBucket) specificToolBucket.hitCount++;
      
      sessionBucket.lastHitTime = now;
      toolBucket.lastHitTime = now;
      if (specificToolBucket) specificToolBucket.lastHitTime = now;

      // Log if too many hits
      if (sessionBucket.hitCount > 5 && (now - (sessionBucket.lastHitTime || 0)) < 60000) {
        log.warn(
          `⚠️ Session ${sessionId} hit rate limit ${sessionBucket.hitCount} times in 1 minute`
        );
      }
    }

    // Calculate reset time
    const resetTime = now + this.getTimeUntilRefill(sessionBucket, effectiveSessionConfig) * 1000;
    const retryAfter = this.getTimeUntilRefill(sessionBucket, effectiveSessionConfig);
    const tokensAvailable = specificToolBucket
      ? Math.min(sessionBucket.tokens, toolBucket.tokens, specificToolBucket.tokens)
      : Math.min(sessionBucket.tokens, toolBucket.tokens);

    return {
      allowed,
      tokensAvailable,
      tokensRequired,
      requestsThisMinute: sessionBucket.requestCount,
      resetTime,
      retryAfter,
      limit: {
        requestsPerMinute: effectiveSessionLimit,
        burstSize: sessionConfig.burstSize,
      },
    };
  }

  /**
   * Get the current rate limit status for a session
   */
  getStatus(sessionId: string, _toolName?: string): RateLimitStatus {
    const now = Date.now();
    const sessionKey = `session:${sessionId}`;
    const sessionBucket = this.getBucket(sessionKey);
    const sessionConfig = this.getConfig("session");
    const customRpm = this.customLimitsMap.get(sessionId);
    const effectiveRpm = customRpm ?? sessionConfig.requestsPerMinute;

    this.refillTokens(sessionBucket, sessionConfig);

    const resetTime = now + this.getTimeUntilRefill(sessionBucket, sessionConfig) * 1000;
    const retryAfter = this.getTimeUntilRefill(sessionBucket, sessionConfig);

    return {
      allowed: true,
      tokensAvailable: sessionBucket.tokens,
      tokensRequired: 1,
      requestsThisMinute: sessionBucket.requestCount,
      resetTime,
      retryAfter,
      limit: {
        requestsPerMinute: effectiveRpm,
        burstSize: sessionConfig.burstSize,
      },
    };
  }

  /**
   * Update custom rate limits for a session
   * Users can only lower their limits, not increase them
   */
  updateCustomLimit(sessionId: string, newLimitRpm: number): boolean {
    const defaultLimit = DEFAULT_CONFIGS["session"]!.requestsPerMinute;
    
    if (newLimitRpm < 1 || newLimitRpm > defaultLimit) {
      log.warn(
        `Invalid custom limit for ${sessionId}: ${newLimitRpm} ` +
        `(must be between 1 and ${defaultLimit})`
      );
      return false;
    }

    this.customLimitsMap.set(sessionId, newLimitRpm);

    try {
      db.prepare(`
        INSERT INTO rate_limits (
          session_id, identifier, tokens, last_refill_time, 
          request_count, hit_count, custom_limit_rpm, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id, identifier) DO UPDATE SET
          custom_limit_rpm = excluded.custom_limit_rpm,
          updated_at = excluded.updated_at
      `).run(
        sessionId,
        `session:${sessionId}`,
        newLimitRpm,
        Date.now(),
        0,
        0,
        newLimitRpm,
        Date.now()
      );

      log.info(`Custom rate limit set for ${sessionId}: ${newLimitRpm} req/min`);
      return true;
    } catch (err) {
      log.error("Failed to update custom rate limit", err);
      return false;
    }
  }

  /**
   * Get rate limit history for a session
   */
  getHistory(
    sessionId: string,
    options?: { limit?: number | undefined; since?: number | undefined; toolName?: string | undefined }
  ): RateLimitHistoryEntry[] {
    const limit = options?.limit || 100;
    const since = options?.since || Date.now() - 3600000; // 1 hour ago by default
    const toolName = options?.toolName;

    return this.history
      .filter(entry => {
        const matchesSession = entry.sessionId === sessionId;
        const matchesTime = entry.timestamp >= since;
        const matchesTool = !toolName || entry.toolName === toolName;
        return matchesSession && matchesTime && matchesTool;
      })
      .slice(-limit);
  }

  /**
   * Record a rate limit check in history
   */
  private recordHistory(entry: RateLimitHistoryEntry): void {
    this.history.push(entry);

    // Keep memory in check
    if (this.history.length > this.maxHistorySize) {
      this.history.splice(0, this.history.length - this.maxHistorySize);
    }

    // Optionally persist to SQLite (async, non-blocking)
    this.persistHistoryToDb(entry).catch(err => {
      log.debug("Failed to persist rate limit history", err);
    });
  }

  /**
   * Persist history entry to database
   */
  private async persistHistoryToDb(entry: RateLimitHistoryEntry): Promise<void> {
    try {
      db.prepare(`
        INSERT INTO rate_limit_history (
          timestamp, session_id, tool_name, allowed, tokens_available, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        entry.timestamp,
        entry.sessionId,
        entry.toolName,
        entry.allowed ? 1 : 0,
        entry.tokensAvailable,
        Date.now()
      );
    } catch (err) {
      // Silently fail for history persistence
      log.debug("Failed to save rate limit history to DB", { error: err });
    }
  }

  /**
   * Cleanup expired sessions and old history
   */
  private cleanup(): void {
    const now = Date.now();
    const oneHourAgo = now - 3600000; // 1 hour
    let removed = 0;

    // Remove in-memory buckets that haven't been used in 1 hour
    for (const [key, bucket] of this.buckets) {
      if ((bucket.lastHitTime || bucket.lastRefillTime) < oneHourAgo) {
        this.buckets.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      log.debug(`Rate limit cleanup: removed ${removed} expired buckets`);
    }

    // Clean old history from database (should not be called often)
    try {
      const result = db.prepare(`
        DELETE FROM rate_limit_history WHERE created_at < ?
      `).run(oneHourAgo);
      
      if ((result.changes || 0) > 0) {
        log.debug(`Cleaned ${result.changes} old rate limit history entries`);
      }
    } catch (err) {
      log.debug("Failed to cleanup rate limit history from DB", { error: err });
    }
  }

  /**
   * Reset all rate limits for a session (admin only)
   */
  resetSessionLimits(sessionId: string): boolean {
    try {
      // Clear in-memory buckets
      for (const key of this.buckets.keys()) {
        if (key.includes(sessionId)) {
          this.buckets.delete(key);
        }
      }
      this.customLimitsMap.delete(sessionId);

      // Clear database entries
      db.prepare("DELETE FROM rate_limits WHERE session_id = ?").run(sessionId);
      db.prepare("DELETE FROM rate_limit_history WHERE session_id = ?").run(sessionId);

      log.info(`Rate limits reset for session ${sessionId}`);
      return true;
    } catch (err) {
      log.error("Failed to reset rate limits", err);
      return false;
    }
  }

  /**
   * Get development mode status
   */
  isDevelopmentMode(): boolean {
    return this.isEnvironmentDev;
  }

  /**
   * Adjust limits for development mode (higher limits)
   */
  getDevModeConfig(category: string): RateLimitConfig {
    const baseConfig = this.getConfig(category);
    if (!this.isEnvironmentDev) {
      return baseConfig;
    }

    // 10x higher limits in development
    return {
      ...baseConfig,
      requestsPerMinute: baseConfig.requestsPerMinute * 10,
      burstSize: baseConfig.burstSize * 10,
    };
  }
}

/**
 * Global rate limiter instance
 */
export const rateLimiter = new RateLimiter();

export interface RateLimitMiddlewareOptions {
  windowMs?: number;
  maxRequests?: number;
  prefix?: string;
}

/**
 * Middleware for Express/HTTP requests
 * Returns 429 Too Many Requests if limit exceeded
 *
 * Usage:
 *   app.use(rateLimitMiddleware())              // default limits
 *   app.use(rateLimitMiddleware("session123"))   // per-session
 *   app.use(rateLimitMiddleware({ maxRequests: 100, prefix: "api" }))  // configured limits
 */
export function rateLimitMiddleware(sessionIdOrOptions?: string | RateLimitMiddlewareOptions) {
  let sessionId: string | undefined;
  let options: RateLimitMiddlewareOptions = {};

  if (typeof sessionIdOrOptions === "string") {
    sessionId = sessionIdOrOptions;
  } else if (sessionIdOrOptions) {
    options = sessionIdOrOptions;
  }

  return (req: any, res: any, next: any) => {
    const identifier = options.prefix
      ? `${options.prefix}:${req.ip || "unknown"}`
      : sessionId || req.query.sessionId || req.body?.sessionId || req.ip || "anonymous";

    const category = options.prefix ? `http:${options.prefix}` : "http_request";
    const status = rateLimiter.checkRateLimit(identifier, category);

    res.set("X-RateLimit-Limit", String(status.limit.requestsPerMinute));
    res.set("X-RateLimit-Remaining", String(Math.floor(status.tokensAvailable)));
    res.set("X-RateLimit-Reset", String(Math.floor(status.resetTime / 1000)));

    if (!status.allowed) {
      res.set("Retry-After", String(status.retryAfter));
      return res.status(429).json({
        error: "Rate limit exceeded",
        retryAfter: status.retryAfter,
        resetTime: status.resetTime,
        message: `Too many requests. Try again in ${status.retryAfter} seconds.`,
      });
    }

    next();
  };
}

/**
 * Create error response for rate limit exceeded
 */
export function createRateLimitErrorResponse(status: RateLimitStatus): {
  error: string;
  retryAfter: number;
  resetTime: number;
  message: string;
} {
  return {
    error: "Rate limit exceeded",
    retryAfter: status.retryAfter,
    resetTime: status.resetTime,
    message: `Too many requests. Try again in ${status.retryAfter} seconds.`,
  };
}

export default rateLimiter;
