/**
 * Stats command - display usage statistics and metrics.
 */

import { createLogger } from "../../logger.ts";
import { db } from "../../db.ts";
import { getUsageStats } from "../../usage.ts";
import type { UsageStats } from "../../usage.ts";
import { success, error, info, title, section, printTable, dim, bold } from "../utils.ts";

const log = createLogger("stats");

/**
 * Format large numbers with commas
 */
function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Format duration from milliseconds
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours % 24 > 0) parts.push(`${hours % 24}h`);
  if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
  if (seconds % 60 > 0 || parts.length === 0) parts.push(`${seconds % 60}s`);
  
  return parts.join(" ");
}

/**
 * Get basic stats from memory table
 */
function getMemoryStats(): {
  totalSessions: number;
  totalMessages: number;
  activeSessions: number;
} {
  // Get distinct session count from memory table
  const sessionResult = db.prepare(
    `SELECT COUNT(DISTINCT session_id) as count FROM memory`
  ).get() as { count: number };
  
  // Get total message count
  const messageResult = db.prepare(
    `SELECT COUNT(*) as count FROM memory`
  ).get() as { count: number };
  
  // Get sessions with activity in last hour (active sessions)
  const activeResult = db.prepare(
    `SELECT COUNT(DISTINCT session_id) as count FROM memory WHERE timestamp > datetime('now', '-1 hour')`
  ).get() as { count: number };
  
  return {
    totalSessions: sessionResult.count,
    totalMessages: messageResult.count,
    activeSessions: activeResult.count,
  };
}

export async function statsCommand(options: { period?: string; verbose?: boolean } = {}): Promise<void> {
  const { period = "all", verbose = false } = options;
  
  title("📊 GravityClaw Usage Statistics");
  
  // Determine time range
  let timeCondition = "";
  let timeLabel = "All Time";
  
  if (period === "day") {
    timeCondition = "AND timestamp >= datetime('now', '-1 day')";
    timeLabel = "Last 24 Hours";
  } else if (period === "week") {
    timeCondition = "AND timestamp >= datetime('now', '-7 days')";
    timeLabel = "Last 7 Days";
  } else if (period === "month") {
    timeCondition = "AND timestamp >= datetime('now', '-30 days')";
    timeLabel = "Last 30 Days";
  }
  
  try {
    // Get memory-based stats
    const memoryStats = getMemoryStats();
    
    // Get usage stats from usage table
    const usageStats: UsageStats = getUsageStats(undefined, period !== "all" ? new Date(Date.now() - (period === "day" ? 24*60*60*1000 : period === "week" ? 7*24*60*60*1000 : 30*24*60*60*1000)) : undefined);
    
    // Get tool usage from memory by parsing message_json for tool calls
    let toolUsage: Array<{ tool: string; count: number }> = [];
    try {
      const toolResults = db.prepare(`
        SELECT message_json FROM memory
        WHERE message_json LIKE '%tool_calls%'
        ${timeCondition}
      `).all() as Array<{ message_json: string }>;

      const toolCounts = new Map<string, number>();
      for (const row of toolResults) {
        try {
          const msg = JSON.parse(row.message_json);
          if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
            for (const call of msg.tool_calls) {
              const name = call.function?.name || call.name || "unknown";
              toolCounts.set(name, (toolCounts.get(name) || 0) + 1);
            }
          }
        } catch {
          // Skip invalid JSON - this is expected for non-tool messages
        }
      }
      toolUsage = Array.from(toolCounts.entries())
        .map(([tool, count]) => ({ tool, count }))
        .sort((a, b) => b.count - a.count);
    } catch (e) {
      log.debug("Tool usage tracking not available: " + String(e));
    }
    
    // Calculate uptime (approximate from oldest session)
    let uptimeStr = "Unknown";
    try {
      const oldestResult = db.prepare(
        `SELECT MIN(timestamp) as oldest FROM memory`
      ).get() as { oldest: string | null };
      
      if (oldestResult.oldest) {
        const oldest = new Date(oldestResult.oldest);
        const now = new Date();
        const diffMs = now.getTime() - oldest.getTime();
        uptimeStr = formatDuration(diffMs);
      }
    } catch (e) {
      log.debug("Could not calculate uptime");
    }
    
    // Main statistics table
    section("Overview");
    printTable([
      ["Sessions", formatNumber(memoryStats.totalSessions)],
      ["Messages", formatNumber(memoryStats.totalMessages)],
      ["Active Sessions (1h)", formatNumber(memoryStats.activeSessions)],
      ["Uptime", uptimeStr],
    ], [
      { header: "Metric", width: 20 },
      { header: "Value", width: 20 },
    ]);
    
    console.log();
    
    // Usage statistics (if available)
    if (usageStats.totalCalls > 0) {
      section("LLM Usage (" + timeLabel + ")");
      printTable([
        ["Total Calls", formatNumber(usageStats.totalCalls)],
        ["Total Tokens", formatNumber(usageStats.totalTokens)],
        ["Prompt Tokens", formatNumber(usageStats.totalPromptTokens)],
        ["Completion Tokens", formatNumber(usageStats.totalCompletionTokens)],
        ["Total Cost", `$${usageStats.totalCost.toFixed(4)}`],
        ["Avg Latency", usageStats.avgLatency ? `${usageStats.avgLatency.toFixed(0)}ms` : "N/A"],
      ], [
        { header: "Metric", width: 20 },
        { header: "Value", width: 20 },
      ]);
      
      console.log();
      
      // Model breakdown
      if (usageStats.models.length > 0) {
        section("Model Usage");
        const modelRows = usageStats.models.map(model => [
          model.model,
          formatNumber(model.calls),
          formatNumber(model.tokens),
          `$${model.cost.toFixed(4)}`
        ]);
        printTable(modelRows, [
          { header: "Model", width: 20 },
          { header: "Calls", width: 10, align: "right" },
          { header: "Tokens", width: 15, align: "right" },
          { header: "Cost", width: 10, align: "right" },
        ]);
      }
    } else {
      section("LLM Usage");
      info("No usage data recorded yet. Start chatting to generate statistics.");
    }
    
    console.log();
    
    // Tool usage (if available)
    if (verbose && toolUsage.some(t => t.count > 0)) {
      section("Tool Usage");
      const toolRows = toolUsage
        .filter(t => t.count > 0)
        .sort((a, b) => b.count - a.count)
        .map(t => [t.tool, formatNumber(t.count)]);
      
      if (toolRows.length > 0) {
        printTable(toolRows, [
          { header: "Tool", width: 25 },
          { header: "Calls", width: 15, align: "right" },
        ]);
      } else {
        info("No tool usage data available.");
      }
    }
    
    // Tips
    section("Tips");
    info("Use --period day|week|month to filter by time period");
    info("Use --verbose for detailed tool usage");
    info("Run 'gravityclaw doctor' for system health check");
    
  } catch (err) {
    error(`Failed to generate stats: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}