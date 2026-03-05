/**
 * Rate Limiting Type Definitions
 * 
 * Exported types for use across the application
 */

/**
 * Configuration for a rate limit bucket
 */
export interface RateLimitConfig {
  /** Maximum requests allowed per minute */
  requestsPerMinute: number;
  
  /** Maximum burst size (tokens that can accumulate) */
  burstSize: number;
  
  /** Refill interval in milliseconds */
  refillInterval: number;
}

/**
 * State of a token bucket
 */
export interface TokenBucket {
  /** Current number of tokens available */
  tokens: number;
  
  /** Timestamp of last refill */
  lastRefillTime: number;
  
  /** Number of requests in current minute */
  requestCount: number;
  
  /** Number of times limit was exceeded */
  hitCount: number;
  
  /** Last time limit was exceeded */
  lastHitTime?: number;
}

/**
 * Rate limit status for a request
 */
export interface RateLimitStatus {
  /** Whether the request is allowed */
  allowed: boolean;
  
  /** Number of tokens currently available */
  tokensAvailable: number;
  
  /** Tokens required for this request */
  tokensRequired: number;
  
  /** Requests made in current minute */
  requestsThisMinute: number;
  
  /** Timestamp when tokens will be fully reset */
  resetTime: number;
  
  /** Seconds until next token available */
  retryAfter: number;
  
  /** Current rate limit configuration */
  limit: {
    requestsPerMinute: number;
    burstSize: number;
  };
}

/**
 * Entry in rate limit history
 */
export interface RateLimitHistoryEntry {
  /** Timestamp of the check */
  timestamp: number;
  
  /** Session identifier */
  sessionId: string;
  
  /** Name of the tool being called */
  toolName: string;
  
  /** Whether the request was allowed */
  allowed: boolean;
  
  /** Tokens available at time of check */
  tokensAvailable: number;
}

/**
 * Options for checking rate limits
 */
export interface RateLimitCheckOptions {
  /** Custom rate limit in requests per minute (must be lower than default) */
  customLimitRpm?: number;
}

/**
 * Options for retrieving rate limit history
 */
export interface RateLimitHistoryOptions {
  /** Maximum number of entries to retrieve */
  limit?: number;
  
  /** Unix timestamp - only include entries after this time */
  since?: number;
  
  /** Filter by specific tool name */
  toolName?: string;
}

/**
 * Error response when rate limit is exceeded
 */
export interface RateLimitError {
  /** Error code */
  error: string;
  
  /** Seconds to wait before retrying */
  retryAfter: number;
  
  /** Unix timestamp when tokens reset */
  resetTime: number;
  
  /** Human-readable message */
  message: string;
}
