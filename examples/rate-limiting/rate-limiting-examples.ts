/**
 * Rate Limiting Usage Examples
 * 
 * Demonstrates various ways to use and integrate rate limiting in Gravity Claw
 */

import { rateLimiter } from "../middleware/rate-limit.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("rate-limit-examples");

/**
 * Example 1: Basic Rate Limit Check
 * 
 * The most common usage - check before executing a tool
 */
export function example1_basicCheck() {
  const sessionId = "user-123";
  const toolName = "save_fact";

  const status = rateLimiter.checkRateLimit(sessionId, toolName);

  if (status.allowed) {
    log.info("✓ Request allowed, executing tool");
    // Execute the tool here
  } else {
    log.info(`✗ Rate limit exceeded`);
    log.info(`  Retry after: ${status.retryAfter} seconds`);
    log.info(`  Reset time: ${new Date(status.resetTime).toISOString()}`);
  }
}

/**
 * Example 2: Checking User's Quota Status
 * 
 * Shows current usage and remaining quota to the user
 */
export function example2_checkQuotaStatus() {
  const sessionId = "user-123";

  const status = rateLimiter.getStatus(sessionId);

  console.log(`
📊 Rate Limit Status:
  Current usage: ${status.requestsThisMinute}/${status.limit.requestsPerMinute}
  Remaining: ${Math.floor(status.tokensAvailable)} requests
  Percentage used: ${Math.round(
    ((status.limit.requestsPerMinute - status.tokensAvailable) /
      status.limit.requestsPerMinute) *
      100
  )}%
  Resets in: ${status.retryAfter} seconds
  `);

  if (status.tokensAvailable < 10) {
    console.log("⚠️ Warning: Approaching rate limit!");
  }
}

/**
 * Example 3: Handling Rate Limit in Tool Execution
 * 
 * Example of how to integrate into the agent loop
 */
export async function example3_toolExecution(
  sessionId: string,
  toolName: string
) {
  // 1. Check rate limit
  const rateLimitStatus = rateLimiter.checkRateLimit(sessionId, toolName);

  if (!rateLimitStatus.allowed) {
    // 2. Return error if limit exceeded
    return {
      error: "Rate limit exceeded",
      retryAfter: rateLimitStatus.retryAfter,
      resetTime: rateLimitStatus.resetTime,
    };
  }

  // 3. Execute tool
  log.info(`Executing tool: ${toolName}`);
  const result = "Tool execution result...";

  // 4. Return result
  return { success: true, result };
}

/**
 * Example 4: User-Defined Custom Limits
 * 
 * Allows users to set lower limits for their own session
 */
export function example4_customLimits() {
  const sessionId = "user-123";

  // Get current status
  let status = rateLimiter.getStatus(sessionId);
  console.log(`Default limit: ${status.limit.requestsPerMinute}/min`);

  // User wants to lower their limit to be more conservative
  const newLimit = 30;
  const success = rateLimiter.updateCustomLimit(sessionId, newLimit);

  if (success) {
    status = rateLimiter.getStatus(sessionId);
    console.log(`✓ Custom limit set to: ${newLimit}/min`);
  } else {
    console.log(`✗ Failed to set custom limit`);
  }

  // User tries to exceed maximum
  const tooHigh = 200;
  const failed = rateLimiter.updateCustomLimit(sessionId, tooHigh);

  if (!failed) {
    console.log(`✗ Cannot increase limit beyond default`);
  }
}

/**
 * Example 5: Monitoring Rate Limit Violations
 * 
 * Get history and identify problematic usage patterns
 */
export function example5_monitorViolations() {
  const sessionId = "user-123";

  // Get last hour of history
  const history = rateLimiter.getHistory(sessionId, {
    limit: 100,
    sinceMinutesAgo: 60,
  });

  const violations = history.filter(h => !h.allowed).length;
  const totalChecks = history.length;
  const violationRate = (violations / totalChecks) * 100;

  console.log(`
📈 Rate Limit Violations:
  Total checks: ${totalChecks}
  Violations: ${violations}
  Violation rate: ${violationRate.toFixed(2)}%
  `);

  if (violations > 5) {
    console.log("⚠️ High violation count detected");
  }

  // Show recent violations
  const recentViolations = history
    .filter(h => !h.allowed)
    .slice(-5)
    .map(h => ({
      tool: h.toolName,
      time: new Date(h.timestamp).toISOString(),
    }));

  if (recentViolations.length > 0) {
    console.log("\nRecent violations:");
    recentViolations.forEach(v => {
      console.log(`  - ${v.tool} at ${v.time}`);
    });
  }
}

/**
 * Example 6: Tool-Specific Filtering
 * 
 * Analyze which specific tools are hitting limits
 */
export function example6_toolAnalysis() {
  const sessionId = "user-123";

  // Get violations for a specific tool
  const voiceHistory = rateLimiter.getHistory(sessionId, {
    limit: 100,
    sinceMinutesAgo: 60,
    toolName: "text_to_speech",
  });

  const voiceViolations = voiceHistory.filter(h => !h.allowed).length;

  console.log(`
🎙️ Voice Tool Usage:
  Total calls: ${voiceHistory.length}
  Violations: ${voiceViolations}
  Success rate: ${(
    ((voiceHistory.length - voiceViolations) / voiceHistory.length) *
    100
  ).toFixed(2)}%
  `);

  if (voiceViolations > 2) {
    console.log("💡 Suggestion: Reduce TTS usage or upgrade account tier");
  }
}

/**
 * Example 7: Adaptive Retry Logic
 * 
 * How to implement exponential backoff with rate limit info
 */
export async function example7_adaptiveRetry(
  sessionId: string,
  toolName: string,
  maxRetries: number = 3
) {
  let attempt = 0;

  while (attempt < maxRetries) {
    const status = rateLimiter.checkRateLimit(sessionId, toolName);

    if (status.allowed) {
      log.info(`✓ Tool executed on attempt ${attempt + 1}`);
      return { success: true, attempt: attempt + 1 };
    }

    attempt++;

    if (attempt < maxRetries) {
      // Use rate limit info for smart backoff
      const backoffSeconds = Math.min(
        status.retryAfter,
        Math.pow(2, attempt)
      );
      log.info(
        `Rate limited, retrying in ${backoffSeconds}s (attempt ${attempt}/${maxRetries})`
      );

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, backoffSeconds * 1000));
    }
  }

  log.warn(`Failed after ${maxRetries} attempts`);
  const finalStatus = rateLimiter.checkRateLimit(sessionId, toolName);
  return {
    success: false,
    retryAfter: finalStatus.retryAfter,
    message: "Rate limit persists, please wait before retrying",
  };
}

/**
 * Example 8: Dashboard Display
 * 
 * How to display rate limit info in a dashboard
 */
export function example8_dashboardData() {
  const sessionId = "user-123";
  const status = rateLimiter.getStatus(sessionId);
  const history = rateLimiter.getHistory(sessionId, {
    limit: 1440, // Last day
    sinceMinutesAgo: 1440,
  });

  const violations = history.filter(h => !h.allowed).length;
  const avgRequestsPerMinute =
    history.length / Math.max(1, Math.floor(history.length / 100));

  // Data structure for dashboard display
  const dashboardData = {
    current: {
      status: status.allowed ? "OK" : "LIMITED",
      available: Math.floor(status.tokensAvailable),
      limit: status.limit.requestsPerMinute,
      percentageUsed: Math.round(
        ((status.limit.requestsPerMinute - status.tokensAvailable) /
          status.limit.requestsPerMinute) *
          100
      ),
    },
    today: {
      totalCalls: history.length,
      violations,
      averageRpm: avgRequestsPerMinute.toFixed(1),
      peakUsage: history.length, // Would track peaks in real scenario
    },
    warnings: {
      isLimited: !status.allowed,
      approachingLimit: status.tokensAvailable < 10,
      highViolationRate: violations > 5,
    },
  };

  return dashboardData;
}

/**
 * Example 9: Per-Category Tool Analysis
 * 
 * Understand which tool categories are causing issues
 */
export function example9_categoryAnalysis() {
  const sessionId = "user-123";
  const history = rateLimiter.getHistory(sessionId, {
    limit: 500,
    sinceMinutesAgo: 60,
  });

  // Group by tool category
  const categoryCounts: Record<string, { total: number; violations: number }> =
    {};

  history.forEach(h => {
    const category = getToolCategory(h.toolName);
    if (!categoryCounts[category]) {
      categoryCounts[category] = { total: 0, violations: 0 };
    }
    categoryCounts[category].total++;
    if (!h.allowed) {
      categoryCounts[category].violations++;
    }
  });

  // Display analysis
  console.log("\n📊 Tool Category Analysis (Last Hour):\n");
  Object.entries(categoryCounts).forEach(([category, counts]) => {
    const rate = ((counts.violations / counts.total) * 100).toFixed(2);
    const status = counts.violations > 0 ? "⚠️ " : "✓ ";
    console.log(
      `${status}${category}: ${counts.total} calls, ${counts.violations} violations (${rate}%)`
    );
  });
}

/**
 * Example 10: Admin Actions
 * 
 * Administrative operations like session reset
 */
export function example10_adminActions() {
  const sessionId = "user-123";

  // Check current state
  let status = rateLimiter.getStatus(sessionId);
  console.log(`Before reset: ${Math.floor(status.tokensAvailable)} tokens`);

  // Admin resets the session (e.g., for debugging or punishment)
  const success = rateLimiter.resetSessionLimits(sessionId);

  if (success) {
    status = rateLimiter.getStatus(sessionId);
    console.log(`After reset: ${Math.floor(status.tokensAvailable)} tokens`);
    console.log("✓ Session limits reset successfully");
  }
}

// Helper function to categorize tools
function getToolCategory(toolName: string): string {
  const categories: Record<string, string[]> = {
    voice: [
      "text_to_speech",
      "speak",
      "set_voice",
      "enable_talk_mode",
      "disable_talk_mode",
    ],
    memory: ["save_fact", "recall_facts", "save_entity", "save_relationship"],
    system: ["run_shell", "read_file", "write_file", "datetime"],
  };

  for (const [cat, tools] of Object.entries(categories)) {
    if (tools.includes(toolName)) return cat;
  }
  return "other";
}

/**
 * Run all examples (for demonstration)
 */
export function runAllExamples() {
  console.log("=== Rate Limiting Examples ===\n");

  console.log("1. Basic Rate Limit Check:");
  example1_basicCheck();

  console.log("\n2. Check Quota Status:");
  example2_checkQuotaStatus();

  console.log("\n4. Custom Limits:");
  example4_customLimits();

  console.log("\n8. Dashboard Data:");
  const dashData = example8_dashboardData();
  console.log(JSON.stringify(dashData, null, 2));

  console.log("\n9. Category Analysis:");
  example9_categoryAnalysis();

  console.log("\n10. Admin Actions:");
  example10_adminActions();
}
