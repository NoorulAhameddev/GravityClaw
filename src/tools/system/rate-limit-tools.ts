/**
 * Rate Limiting Tools
 * 
 * Tools for managing and monitoring rate limits:
 * - getRateLimitStatus: View current usage and remaining quota
 * - updateRateLimits: Customize personal limits
 * - getRateLimitHistory: View rate limit hits over time
 */

import { rateLimiter } from "../../middleware/rate-limit.ts";
import type { RateLimitStatus } from "../../middleware/rate-limit.ts";
import type { Tool } from "../../types/tools.ts";

/**
 * Get rate limit status tool
 * Shows current usage, remaining quota, and reset time
 */
export const getRateLimitStatusTool: Tool = {
  name: "get_rate_limit_status",
  description:
    "Get the current rate limit status for your session, including " +
    "requests made, remaining quota, and reset time. Use this to check " +
    "if you're approaching your limit.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  async execute(input: Record<string, unknown>): Promise<string> {
    const sessionId = (input.__sessionId || "unknown") as string;
    const status = rateLimiter.getStatus(sessionId);

    const resetDate = new Date(status.resetTime);
    const response = {
      success: true,
      status: {
        allowed: status.allowed,
        tokensAvailable: Math.floor(status.tokensAvailable),
        requestsThisMinute: status.requestsThisMinute,
        retryAfterSeconds: status.retryAfter,
        resetTime: resetDate.toISOString(),
        resetInSeconds: status.retryAfter,
      },
      limit: {
        requestsPerMinute: status.limit.requestsPerMinute,
        burstSize: status.limit.burstSize,
      },
      usage: {
        percentageUsed: Math.round(
          ((status.limit.requestsPerMinute - status.tokensAvailable) /
            status.limit.requestsPerMinute) *
            100
        ),
      },
      message: `You have ${Math.floor(
        status.tokensAvailable
      )} requests available out of ${
        status.limit.requestsPerMinute
      } per minute.`,
    };

    return JSON.stringify(response);
  },
};

/**
 * Update rate limits tool
 * Allows users to set custom (lower) rate limits
 */
export const updateRateLimitsTool: Tool = {
  name: "update_rate_limits",
  description:
    "Update your personal rate limit. You can only lower your limit, not increase it. " +
    "This is useful for testing or to be more conservative with API usage. " +
    "Provide a number between 1 and the default limit.",
  inputSchema: {
    type: "object",
    properties: {
      requestsPerMinute: {
        type: "number",
        description:
          "New rate limit in requests per minute (must be >= 1 and <= default limit)",
      },
    },
    required: ["requestsPerMinute"],
  },
  async execute(input: Record<string, unknown>): Promise<string> {
    const sessionId = (input.__sessionId || "unknown") as string;
    const requestsPerMinute = Number(input.requestsPerMinute);

    if (!Number.isInteger(requestsPerMinute) || requestsPerMinute < 1) {
      return JSON.stringify({
        success: false,
        error: "requestsPerMinute must be a positive integer",
      });
    }

    const success = rateLimiter.updateCustomLimit(sessionId, requestsPerMinute);

    if (success) {
      return JSON.stringify({
        success: true,
        message: `Rate limit updated to ${requestsPerMinute} requests per minute`,
        newLimit: requestsPerMinute,
      });
    } else {
      return JSON.stringify({
        success: false,
        error: "Failed to update rate limit. Check the value and try again.",
      });
    }
  },
};

/**
 * Get rate limit history tool
 * Shows the history of rate limit checks for the session
 */
export const getRateLimitHistoryTool: Tool = {
  name: "get_rate_limit_history",
  description:
    "View the history of rate limit checks in your session. Shows which tools " +
    "were used, when rate limits were exceeded, and tokens available at each check. " +
    "Useful for understanding usage patterns.",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "Number of recent entries to retrieve (default: 50, max: 500)",
      },
      sinceMinutesAgo: {
        type: "number",
        description: "Only show entries from the last N minutes (default: 60)",
      },
      toolName: {
        type: "string",
        description:
          "Filter by specific tool name (e.g., 'save_fact', 'text_to_speech')",
      },
    },
    required: [],
  },
  async execute(input: Record<string, unknown>): Promise<string> {
    const sessionId = (input.__sessionId || "unknown") as string;
    const limit = Math.min(Number(input.limit || 50), 500);
    const sinceMinutesAgo = Number(input.sinceMinutesAgo || 60);
    const toolName = (input.toolName || undefined) as string | undefined;

    const since = Date.now() - sinceMinutesAgo * 60 * 1000;
    const history = rateLimiter.getHistory(sessionId, {
      limit,
      since,
      toolName,
    });

    const summary = {
      totalChecks: history.length,
      allowed: history.filter((h: any) => h.allowed).length,
      denied: history.filter((h: any) => !h.allowed).length,
    };

    const recentEntries = history.slice(-20).map((entry: any) => ({
      timestamp: new Date(entry.timestamp).toISOString(),
      tool: entry.toolName,
      allowed: entry.allowed ? "✓" : "✗",
      tokensAvailable: Math.floor(entry.tokensAvailable),
    }));

    return JSON.stringify({
      success: true,
      sessionId,
      period: `Last ${sinceMinutesAgo} minutes`,
      summary,
      recentEntries,
      message:
        summary.denied > 0
          ? `⚠️ ${summary.denied} rate limit violations in the last ${sinceMinutesAgo} minutes`
          : `✓ No rate limit violations in the last ${sinceMinutesAgo} minutes`,
    });
  },
};

/**
 * All rate limiting tools
 */
export const rateLimitingTools = [
  getRateLimitStatusTool,
  updateRateLimitsTool,
  getRateLimitHistoryTool,
];
