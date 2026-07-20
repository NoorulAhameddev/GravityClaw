import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import * as cron from "node-cron";
import { db } from "../db.ts";
import { createLogger } from "../logger.ts";
import { config } from "../config.ts";
import { getProvider } from "../llm/index.ts";
import { getSessionSettings, updateSessionSetting } from "../session.ts";

const log = createLogger("recommendations");

// Recommendations schema initialization is handled by src/db/migrations/schema.ts

export interface RecommendationsProfile {
  topCommands: Array<{ command: string; count: number }>;
  topTools: Array<{ tool: string; count: number }>;
  commonQueries: Array<{ query: string; count: number }>;
}

function getDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function extractJsonArray(text: string): string[] | null {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item) => typeof item === "string").slice(0, 3);
  } catch {
    return null;
  }
}

export function getRecommendationsStatus(sessionId: string): {
  enabled: boolean;
  lastSentDate: string | null;
} {
  const settings = getSessionSettings(sessionId);
  return {
    enabled: settings.recommendationsEnabled !== false,
    lastSentDate: typeof settings.recommendationsLastSentDate === "string"
      ? settings.recommendationsLastSentDate
      : null,
  };
}

export function setRecommendationsEnabled(sessionId: string, enabled: boolean): void {
  updateSessionSetting(sessionId, "recommendationsEnabled", enabled);
}

export function shouldSendRecommendationToday(sessionId: string, dateKey = getDateKey()): boolean {
  const count = db.prepare(`
    SELECT COUNT(*) as c
    FROM recommendation_events
    WHERE session_id = ? AND date_key = ?
  `).get(sessionId, dateKey) as { c: number };

  return (count?.c || 0) < 1;
}

export function markRecommendationSent(sessionId: string, suggestions: string[], dateKey = getDateKey()): void {
  db.prepare(`
    INSERT INTO recommendation_events (session_id, date_key, suggestions_json)
    VALUES (?, ?, ?)
  `).run(sessionId, dateKey, JSON.stringify(suggestions));

  updateSessionSetting(sessionId, "recommendationsLastSentDate", dateKey);
}

export function analyzeSessionPatterns(sessionId: string, windowDays = 30): RecommendationsProfile {
  const rows = db.prepare(`
    SELECT message_json
    FROM memory
    WHERE session_id = ?
      AND timestamp >= datetime('now', ?)
    ORDER BY timestamp DESC
    LIMIT 500
  `).all(sessionId, `-${windowDays} days`) as Array<{ message_json: string }>;

  const commandCounts = new Map<string, number>();
  const queryCounts = new Map<string, number>();
  const toolCounts = new Map<string, number>();

  for (const row of rows) {
    try {
      const message = JSON.parse(row.message_json) as Record<string, unknown>;
      const role = String(message.role || "");
      const content = typeof message.content === "string" ? message.content.trim() : "";

      if (role === "user" && content) {
        if (content.startsWith("/")) {
          const cmd = content.split(/\s+/)[0]!.toLowerCase();
          commandCounts.set(cmd, (commandCounts.get(cmd) || 0) + 1);
        } else if (content.length > 8) {
          const normalized = content.toLowerCase().replace(/\s+/g, " ").slice(0, 140);
          queryCounts.set(normalized, (queryCounts.get(normalized) || 0) + 1);
        }
      }

      if (role === "assistant" && Array.isArray(message.tool_calls)) {
        for (const toolCall of message.tool_calls) {
          const toolName = String(toolCall?.function?.name || "");
          if (toolName) {
            toolCounts.set(toolName, (toolCounts.get(toolName) || 0) + 1);
          }
        }
      }
    } catch {
      // Ignore malformed rows
    }
  }

  const topCommands = [...commandCounts.entries()]
    .map(([command, count]) => ({ command, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topTools = [...toolCounts.entries()]
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const commonQueries = [...queryCounts.entries()]
    .map(([query, count]) => ({ query, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    topCommands,
    topTools,
    commonQueries,
  };
}

function getHeuristicRecommendations(profile: RecommendationsProfile): string[] {
  const suggestions: string[] = [];

  const statusCmd = profile.topCommands.find((c) => c.command === "/status");
  if (statusCmd && statusCmd.count >= 3) {
    suggestions.push("You check /status frequently. Want me to add a heartbeat check every hour?");
  }

  const usageCmd = profile.topCommands.find((c) => c.command === "/usage");
  if (usageCmd && usageCmd.count >= 2) {
    suggestions.push("You run /usage often. I can include daily cost highlights in your evening recap.");
  }

  const searchTool = profile.topTools.find((t) => t.tool.includes("search"));
  if (searchTool && searchTool.count >= 2) {
    suggestions.push("You use search tools a lot. Should I schedule a morning research digest?");
  }

  if (profile.commonQueries.length >= 3) {
    suggestions.push("You revisit similar queries. I can save a short knowledge summary for faster answers.");
  }

  if (suggestions.length === 0) {
    suggestions.push("I can set up heartbeat prompts so you get proactive updates only when something important changes.");
  }

  return suggestions.slice(0, 3);
}

export async function generateRecommendations(profile: RecommendationsProfile): Promise<string[]> {
  const fallback = getHeuristicRecommendations(profile);

  if (config.VITEST || config.NODE_ENV === "test") {
    return fallback;
  }

  try {
    const provider = getProvider();
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content:
          "You are a recommendation assistant. Return ONLY a JSON array of exactly 3 concise suggestions for proactive automation based on user behavior patterns.",
      },
      {
        role: "user",
        content: JSON.stringify(profile),
      },
    ];

    const response = await provider.chat(messages, [], { temperature: 0.2, maxTokens: 180 });
    const parsed = extractJsonArray(response.text || "");

    if (parsed && parsed.length > 0) {
      return parsed.slice(0, 3);
    }

    return fallback;
  } catch (error) {
    log.warn(`Falling back to heuristic recommendations: ${error}`);
    return fallback;
  }
}

export async function runDailyRecommendationSweep(
  sendProactiveMessage: (sessionId: string, text: string) => Promise<void>
): Promise<void> {
  const activeSessions = db.prepare(`
    SELECT DISTINCT session_id
    FROM memory
    WHERE timestamp >= datetime('now', '-14 days')
  `).all() as Array<{ session_id: string }>;

  for (const row of activeSessions) {
    const sessionId = row.session_id;
    const status = getRecommendationsStatus(sessionId);

    if (!status.enabled) {
      continue;
    }

    if (!shouldSendRecommendationToday(sessionId)) {
      continue;
    }

    const profile = analyzeSessionPatterns(sessionId);
    const suggestions = await generateRecommendations(profile);

    if (suggestions.length === 0) {
      continue;
    }

    const message = [
      "💡 **Smart Recommendations**",
      "",
      ...suggestions.map((suggestion, index) => `${index + 1}. ${suggestion}`),
      "",
      "Reply with `/recommendations off` to disable these suggestions.",
    ].join("\n");

    try {
      await sendProactiveMessage(sessionId, message);
      markRecommendationSent(sessionId, suggestions);
    } catch (error) {
      log.warn(`Failed to send recommendation for ${sessionId}: ${error}`);
    }
  }
}

export function startDailyRecommendations(
  sendProactiveMessage: (sessionId: string, text: string) => Promise<void>
): { stop: () => void; cronExpression: string } {
  const fallbackCron = "0 9 * * *";
  const cronExpression = cron.validate(config.RECOMMENDATIONS_DAILY_CRON)
    ? config.RECOMMENDATIONS_DAILY_CRON
    : fallbackCron;

  const job = cron.schedule(cronExpression, () => {
    runDailyRecommendationSweep(sendProactiveMessage).catch((error) => {
      log.error(`Daily recommendation sweep failed: ${error}`);
    });
  });

  log.info(`Daily recommendations started (${cronExpression})`);

  return {
    cronExpression,
    stop: () => {
      job.stop();
      job.destroy();
    },
  };
}
