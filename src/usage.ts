import { config } from "./config.ts";
import { db } from "./db.ts";
import { createLogger } from "./logger.ts";
import { calculateCost, formatCost, getModelPricing } from "./llm/pricing.ts";

const log = createLogger("usage");

// Usage schema initialization is handled by src/db/migrations/schema.ts

export interface UsageRecord {
  id: number;
  timestamp: string;
  sessionId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  latency?: number;
  provider?: string;
}

/**
 * Record a usage entry
 */
export function recordUsage(params: {
  sessionId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latency?: number;
  provider?: string;
}): void {
  const totalTokens = params.promptTokens + params.completionTokens;
  const cost = calculateCost(params.model, params.promptTokens, params.completionTokens);

  try {
    db.prepare(`
      INSERT INTO usage (session_id, model, prompt_tokens, completion_tokens, total_tokens, cost, latency_ms, provider)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      params.sessionId,
      params.model,
      params.promptTokens,
      params.completionTokens,
      totalTokens,
      cost,
      params.latency || null,
      params.provider || null
    );

    log.debug(`Recorded usage: ${totalTokens} tokens, ${formatCost(cost)} for ${params.model}`);
  } catch (err) {
    log.error("Failed to record usage", err);
  }
}

export interface UsageStats {
  totalCalls: number;
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCost: number;
  avgLatency: number | null;
  models: Array<{
    model: string;
    calls: number;
    tokens: number;
    cost: number;
  }>;
}

/**
 * Get usage statistics
 * @param sessionId - Optional session ID to filter by
 * @param since - Optional timestamp to filter from (ISO string or Date)
 * @returns Usage statistics
 */
export function getUsageStats(sessionId?: string, since?: string | Date): UsageStats {
  try {
    let query = `
      SELECT 
        COUNT(*) as total_calls,
        SUM(total_tokens) as total_tokens,
        SUM(prompt_tokens) as total_prompt_tokens,
        SUM(completion_tokens) as total_completion_tokens,
        SUM(cost) as total_cost,
        AVG(latency_ms) as avg_latency
      FROM usage
      WHERE 1=1
    `;
    
    const params: (string | number)[] = [];
    
    if (sessionId) {
      query += ` AND session_id = ?`;
      params.push(sessionId);
    }
    
    if (since) {
      const sinceStr = since instanceof Date ? since.toISOString() : since;
      query += ` AND timestamp >= ?`;
      params.push(sinceStr);
    }
    
    const row = db.prepare(query).get(...params) as {
      total_calls: number;
      total_tokens: number | null;
      total_prompt_tokens: number | null;
      total_completion_tokens: number | null;
      total_cost: number | null;
      avg_latency: number | null;
    };
    
    // Get per-model breakdown
    let modelQuery = `
      SELECT 
        model,
        COUNT(*) as calls,
        SUM(total_tokens) as tokens,
        SUM(cost) as cost
      FROM usage
      WHERE 1=1
    `;
    
    if (sessionId) {
      modelQuery += ` AND session_id = ?`;
    }
    
    if (since) {
      const sinceStr = since instanceof Date ? since.toISOString() : since;
      modelQuery += ` AND timestamp >= ?`;
    }
    
    modelQuery += ` GROUP BY model ORDER BY cost DESC`;
    
    const modelRows = db.prepare(modelQuery).all(...params) as Array<{
      model: string;
      calls: number;
      tokens: number;
      cost: number;
    }>;
    
    return {
      totalCalls: row.total_calls || 0,
      totalTokens: row.total_tokens || 0,
      totalPromptTokens: row.total_prompt_tokens || 0,
      totalCompletionTokens: row.total_completion_tokens || 0,
      totalCost: row.total_cost || 0,
      avgLatency: row.avg_latency,
      models: modelRows,
    };
  } catch (err) {
    log.error("Failed to get usage stats", err);
    return {
      totalCalls: 0,
      totalTokens: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalCost: 0,
      avgLatency: null,
      models: [],
    };
  }
}

/**
 * Get recent usage records
 * @param limit - Number of records to return
 * @param sessionId - Optional session ID filter
 * @returns Array of usage records
 */
export function getRecentUsage(limit: number = 10, sessionId?: string): UsageRecord[] {
  try {
    let query = `
      SELECT 
        id, timestamp, session_id as sessionId, model,
        prompt_tokens as promptTokens, completion_tokens as completionTokens,
        total_tokens as totalTokens, cost, latency_ms as latency, provider
      FROM usage
    `;
    
    const params: (string | number)[] = [];
    
    if (sessionId) {
      query += ` WHERE session_id = ?`;
      params.push(sessionId);
    }
    
    query += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);
    
    return db.prepare(query).all(...params) as UsageRecord[];
  } catch (err) {
    log.error("Failed to get recent usage", err);
    return [];
  }
}

/**
 * Format usage stats for display
 */
export function formatUsageStats(stats: UsageStats, title?: string): string {
  let output = "";
  
  if (title) {
    output += `📊 **${title}**\n\n`;
  } else {
    output += `📊 **Usage Statistics**\n\n`;
  }
  
  output += `🔹 **Overview**\n`;
  output += `├─ Total API calls: ${stats.totalCalls.toLocaleString()}\n`;
  output += `├─ Total tokens: ${stats.totalTokens.toLocaleString()}\n`;
  output += `│  ├─ Prompt: ${stats.totalPromptTokens.toLocaleString()}\n`;
  output += `│  └─ Completion: ${stats.totalCompletionTokens.toLocaleString()}\n`;
  output += `├─ Total cost: ${formatCost(stats.totalCost)}\n`;
  
  if (stats.avgLatency !== null) {
    output += `└─ Avg latency: ${Math.round(stats.avgLatency)}ms\n`;
  } else {
    output += `└─ Avg latency: N/A\n`;
  }
  
  if (stats.models.length > 0) {
    output += `\n🔹 **By Model**\n`;
    for (const model of stats.models) {
      output += `\n**${model.model}**\n`;
      output += `├─ Calls: ${model.calls.toLocaleString()}\n`;
      output += `├─ Tokens: ${model.tokens.toLocaleString()}\n`;
      output += `└─ Cost: ${formatCost(model.cost)}\n`;
    }
  }
  
  return output;
}

/**
 * Get usage stats for different time periods
 */
export function getUsageByPeriod(sessionId?: string) {
  const now = new Date();
  
  // Today (since midnight)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayStats = getUsageStats(sessionId, todayStart);
  
  // This week (since Monday)
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekStats = getUsageStats(sessionId, weekStart);
  
  // This month (since 1st)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStats = getUsageStats(sessionId, monthStart);
  
  // All time
  const allTimeStats = getUsageStats(sessionId);
  
  return {
    today: todayStats,
    week: weekStats,
    month: monthStats,
    allTime: allTimeStats,
  };
}

/**
 * Format period stats for display
 */
export function formatPeriodUsage(sessionId?: string): string {
  const periods = getUsageByPeriod(sessionId);
  
  let output = "📊 **Usage Report**\n\n";
  
  output += "**Today**\n";
  output += `├─ Calls: ${periods.today.totalCalls}\n`;
  output += `├─ Tokens: ${periods.today.totalTokens.toLocaleString()}\n`;
  output += `└─ Cost: ${formatCost(periods.today.totalCost)}\n\n`;
  
  output += "**This Week**\n";
  output += `├─ Calls: ${periods.week.totalCalls}\n`;
  output += `├─ Tokens: ${periods.week.totalTokens.toLocaleString()}\n`;
  output += `└─ Cost: ${formatCost(periods.week.totalCost)}\n\n`;
  
  output += "**This Month**\n";
  output += `├─ Calls: ${periods.month.totalCalls}\n`;
  output += `├─ Tokens: ${periods.month.totalTokens.toLocaleString()}\n`;
  output += `└─ Cost: ${formatCost(periods.month.totalCost)}\n\n`;
  
  output += "**All Time**\n";
  output += `├─ Calls: ${periods.allTime.totalCalls}\n`;
  output += `├─ Tokens: ${periods.allTime.totalTokens.toLocaleString()}\n`;
  output += `└─ Cost: ${formatCost(periods.allTime.totalCost)}\n`;
  
  
  return output;
}

export interface DailyLimitStatus {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if the session has exceeded its daily token or credit limit
 */
export function checkSessionDailyLimits(sessionId: string): DailyLimitStatus {
  // If no limits are configured, always allow
  if (config.LLM_DAILY_CREDIT_LIMIT === undefined && config.LLM_DAILY_TOKEN_LIMIT === undefined) {
    return { allowed: true };
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // Calculate today's usage
  const todayStats = getUsageStats(sessionId, todayStart);
  
  // Check credit limit
  if (config.LLM_DAILY_CREDIT_LIMIT !== undefined) {
    if (todayStats.totalCost >= config.LLM_DAILY_CREDIT_LIMIT) {
      return {
        allowed: false,
        reason: `Exceeded daily credit limit of ${formatCost(config.LLM_DAILY_CREDIT_LIMIT)} (current usage: ${formatCost(todayStats.totalCost)})`
      };
    }
  }
  
  // Check token limit
  if (config.LLM_DAILY_TOKEN_LIMIT !== undefined) {
    if (todayStats.totalTokens >= config.LLM_DAILY_TOKEN_LIMIT) {
      return {
        allowed: false,
        reason: `Exceeded daily token limit of ${config.LLM_DAILY_TOKEN_LIMIT.toLocaleString()} (current usage: ${todayStats.totalTokens.toLocaleString()})`
      };
    }
  }
  
  return { allowed: true };
}
