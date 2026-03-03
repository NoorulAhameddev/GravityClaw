import { db } from "../db.ts";
import { getUsageStats } from "../usage.ts";
import { config } from "../config.ts";
import { scheduleTask } from "../scheduler/index.ts";

export const EVENING_RECAP_TASK_NAME = "evening_recap";
export const EVENING_RECAP_PROMPT = "Summarize today's conversations, tasks completed, and pending items";

export interface RecapReport {
  success: boolean;
  sessionId: string;
  trigger: "manual" | "scheduled";
  generatedAt: string;
  reportMarkdown?: string;
  error?: string;
}

function toLocalTodayStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function normalizeHour(hour: number): number {
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
    return 20;
  }
  return Math.floor(hour);
}

export function ensureEveningRecapTask(
  sessionId: string,
  options?: { hourLocal?: number }
): { success: boolean; created: boolean; taskId?: number; cronExpression: string; error?: string } {
  const hour = normalizeHour(options?.hourLocal ?? config.RECAP_HOUR_LOCAL);
  const cronExpression = `0 ${hour} * * *`;

  const existing = db.prepare(`
    SELECT id
    FROM scheduled_tasks
    WHERE session_id = ? AND name = ?
    LIMIT 1
  `).get(sessionId, EVENING_RECAP_TASK_NAME) as { id: number } | undefined;

  if (existing?.id) {
    return {
      success: true,
      created: false,
      taskId: existing.id,
      cronExpression,
    };
  }

  const result = scheduleTask({
    name: EVENING_RECAP_TASK_NAME,
    schedule: cronExpression,
    sessionId,
    prompt: EVENING_RECAP_PROMPT,
  });

  if (!result.success || !result.taskId) {
    return {
      success: false,
      created: false,
      cronExpression,
      error: result.error || "Failed to schedule evening recap",
    };
  }

  return {
    success: true,
    created: true,
    taskId: result.taskId,
    cronExpression,
  };
}

export function buildEveningRecap(sessionId: string, trigger: "manual" | "scheduled"): RecapReport {
  try {
    const since = toLocalTodayStart();

    const messageStats = db.prepare(`
      SELECT
        COUNT(*) as total_messages,
        SUM(CASE WHEN json_extract(message_json, '$.role') = 'user' THEN 1 ELSE 0 END) as user_messages,
        SUM(CASE WHEN json_extract(message_json, '$.role') = 'assistant' THEN 1 ELSE 0 END) as assistant_messages
      FROM memory
      WHERE session_id = ? AND timestamp >= ?
    `).get(sessionId, since.toISOString()) as {
      total_messages: number;
      user_messages: number | null;
      assistant_messages: number | null;
    };

    const todayUsage = getUsageStats(sessionId, since);

    const completedTasks = db.prepare(`
      SELECT id, name, last_run
      FROM scheduled_tasks
      WHERE session_id = ?
        AND enabled = 1
        AND last_run IS NOT NULL
        AND date(last_run, 'localtime') = date('now', 'localtime')
      ORDER BY last_run DESC
      LIMIT 8
    `).all(sessionId) as Array<{ id: number; name: string; last_run: string }>;

    const pendingTasks = db.prepare(`
      SELECT id, name, next_run
      FROM scheduled_tasks
      WHERE session_id = ?
        AND enabled = 1
        AND (
          last_run IS NULL
          OR date(last_run, 'localtime') < date('now', 'localtime')
        )
      ORDER BY next_run ASC
      LIMIT 8
    `).all(sessionId) as Array<{ id: number; name: string; next_run: string | null }>;

    const reportMarkdown = [
      "🌙 **Evening Recap**",
      "",
      `Date: ${new Date().toLocaleString()}`,
      "",
      "### Today's Conversation",
      `- Total messages: ${messageStats?.total_messages || 0}`,
      `- Your messages: ${messageStats?.user_messages || 0}`,
      `- Assistant messages: ${messageStats?.assistant_messages || 0}`,
      "",
      "### Usage",
      `- API calls: ${todayUsage.totalCalls}`,
      `- Tokens: ${todayUsage.totalTokens.toLocaleString()}`,
      `- Estimated cost: $${todayUsage.totalCost.toFixed(4)}`,
      "",
      "### Completed Tasks",
      ...(completedTasks.length > 0
        ? completedTasks.map((task) => `- ${task.name}`)
        : ["- No scheduled tasks completed today"]),
      "",
      "### Pending Items",
      ...(pendingTasks.length > 0
        ? pendingTasks.map((task) => `- ${task.name}${task.next_run ? ` (next: ${task.next_run})` : ""}`)
        : ["- No pending scheduled tasks"]),
    ].join("\n");

    return {
      success: true,
      sessionId,
      trigger,
      generatedAt: new Date().toISOString(),
      reportMarkdown,
    };
  } catch (error: any) {
    return {
      success: false,
      sessionId,
      trigger,
      generatedAt: new Date().toISOString(),
      error: error?.message || "Failed to build recap",
    };
  }
}
