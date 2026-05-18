import { db } from "../db.ts";
import { createLogger } from "../logger.ts";
import type { Tool } from "../tools/index.js";
import {
  parseNaturalLanguageToCron,
  scheduleTask,
  toggleTask,
} from "../scheduler/index.ts";
import { getSessionSetting, updateSessionSetting } from "../session.ts";

const log = createLogger("heartbeat");

export interface HeartbeatTask {
  id: number;
  sessionId: string;
  intervalMinutes: number;
  prompt: string;
  lastRun: string | null;
  scheduledTaskId: number;
  enabled: boolean;
  createdAt: string;
}

function deriveIntervalMinutes(schedule: string, cronExpression: string): number {
  const lower = schedule.toLowerCase().trim();
  const minutesMatch = lower.match(/every\s+(\d+)\s+minutes?/);
  if (minutesMatch && minutesMatch[1]) {
    const interval = parseInt(minutesMatch[1], 10);
    if (!Number.isNaN(interval) && interval > 0) {
      return interval;
    }
  }

  if (lower.includes("every hour")) {
    return 60;
  }

  if (lower.includes("every day") || lower.includes("every weekday") || lower.includes("every weekend")) {
    return 60 * 24;
  }

  if (cronExpression.startsWith("*/")) {
    const n = parseInt(cronExpression.slice(2).split(" ")[0] || "60", 10);
    if (!Number.isNaN(n) && n > 0) {
      return n;
    }
  }

  return getDefaultHeartbeatIntervalMinutes();
}

function getDefaultHeartbeatIntervalMinutes(): number {
  return 60;
}

export function setHeartbeatPrompt(params: {
  sessionId: string;
  schedule: string;
  prompt: string;
  createdBy?: string;
}): { success: boolean; heartbeatId?: number; taskId?: number; intervalMinutes?: number; cronExpression?: string; error?: string } {
  try {
    const cronExpression = parseNaturalLanguageToCron(params.schedule);
    if (!cronExpression) {
      return {
        success: false,
        error: `Invalid schedule: "${params.schedule}"`,
      };
    }

    const scheduleParams: {
      name: string;
      schedule: string;
      sessionId: string;
      prompt: string;
      createdBy?: string;
    } = {
      name: "heartbeat",
      schedule: params.schedule,
      sessionId: params.sessionId,
      prompt: params.prompt,
    };

    if (params.createdBy) {
      scheduleParams.createdBy = params.createdBy;
    }

    const scheduled = scheduleTask(scheduleParams);

    if (!scheduled.success || !scheduled.taskId) {
      return {
        success: false,
        error: scheduled.error || "Failed to schedule heartbeat task",
      };
    }

    const intervalMinutes = deriveIntervalMinutes(params.schedule, cronExpression);

    if (!intervalMinutes || intervalMinutes <= 0 || intervalMinutes > 525600) {
      return {
        success: false,
        error: "Invalid interval: must be between 1 minute and 1 year",
      };
    }

    const result = db.prepare(`
      INSERT INTO heartbeat_tasks (session_id, interval_minutes, prompt, scheduled_task_id, enabled)
      VALUES (?, ?, ?, ?, 1)
    `).run(params.sessionId, intervalMinutes, params.prompt, scheduled.taskId);

    updateSessionSetting(params.sessionId, "heartbeatEnabled", true);
    updateSessionSetting(params.sessionId, "heartbeatInterval", intervalMinutes);

    return {
      success: true,
      heartbeatId: result.lastInsertRowid as number,
      taskId: scheduled.taskId,
      intervalMinutes,
      cronExpression,
    };
  } catch (error: any) {
    log.error(`Failed to set heartbeat prompt: ${error?.message || error}`);
    return {
      success: false,
      error: error?.message || "Failed to set heartbeat prompt",
    };
  }
}

export function getHeartbeatStatus(sessionId: string): {
  enabled: boolean;
  intervalMinutes: number;
  taskCount: number;
  activeTaskCount: number;
  lastRun: string | null;
  nextRun: string | null;
} {
  const row = db.prepare(`
    SELECT 
      COUNT(*) as task_count,
      SUM(CASE WHEN h.enabled = 1 THEN 1 ELSE 0 END) as active_count,
      MAX(h.last_run) as last_run,
      MIN(CASE WHEN s.enabled = 1 THEN s.next_run ELSE NULL END) as next_run,
      MAX(h.interval_minutes) as interval_minutes
    FROM heartbeat_tasks h
    LEFT JOIN scheduled_tasks s ON s.id = h.scheduled_task_id
    WHERE h.session_id = ?
  `).get(sessionId) as {
    task_count: number;
    active_count: number | null;
    last_run: string | null;
    next_run: string | null;
    interval_minutes: number | null;
  };

  const enabledSetting = getSessionSetting<boolean>(sessionId, "heartbeatEnabled", true);

  return {
    enabled: Boolean(enabledSetting),
    intervalMinutes: row?.interval_minutes || getSessionSetting<number>(sessionId, "heartbeatInterval", getDefaultHeartbeatIntervalMinutes()) || getDefaultHeartbeatIntervalMinutes(),
    taskCount: row?.task_count || 0,
    activeTaskCount: row?.active_count || 0,
    lastRun: row?.last_run || null,
    nextRun: row?.next_run || null,
  };
}

export function setHeartbeatEnabled(sessionId: string, enabled: boolean): { success: boolean; affected: number; error?: string } {
  try {
    const rows = db.prepare(`
      SELECT scheduled_task_id 
      FROM heartbeat_tasks 
      WHERE session_id = ?
    `).all(sessionId) as Array<{ scheduled_task_id: number }>;

    for (const row of rows) {
      toggleTask(row.scheduled_task_id, enabled);
    }

    db.prepare(`
      UPDATE heartbeat_tasks
      SET enabled = ?
      WHERE session_id = ?
    `).run(enabled ? 1 : 0, sessionId);

    updateSessionSetting(sessionId, "heartbeatEnabled", enabled);

    return {
      success: true,
      affected: rows.length,
    };
  } catch (error: any) {
    return {
      success: false,
      affected: 0,
      error: error?.message || "Failed to toggle heartbeat",
    };
  }
}

export function isHeartbeatTask(taskId: number): boolean {
  const row = db.prepare(`
    SELECT id FROM heartbeat_tasks WHERE scheduled_task_id = ? LIMIT 1
  `).get(taskId) as { id: number } | undefined;

  return Boolean(row);
}

export function markHeartbeatRun(taskId: number): void {
  db.prepare(`
    UPDATE heartbeat_tasks
    SET last_run = CURRENT_TIMESTAMP
    WHERE scheduled_task_id = ?
  `).run(taskId);
}

export function isHeartbeatEnabledForSession(sessionId: string): boolean {
  return Boolean(getSessionSetting<boolean>(sessionId, "heartbeatEnabled", true));
}

export function isHeartbeatResponseNoteworthy(text: string): boolean {
  const normalized = text.trim();

  if (!normalized) {
    return false;
  }

  if (/^NO_UPDATE$/i.test(normalized)) {
    return false;
  }

  if (/nothing\s+noteworthy/i.test(normalized)) {
    return false;
  }

  return true;
}

export const setHeartbeatPromptTool: Tool = {
  name: "set_heartbeat_prompt",
  description:
    "Register a heartbeat prompt on a recurring schedule. Heartbeat prompts run proactively and only notify the user when noteworthy updates are detected.",
  inputSchema: {
    type: "object",
    properties: {
      schedule: {
        type: "string",
        description: "Schedule in natural language (e.g. 'every hour', 'every 30 minutes', 'every day at 9am')",
      },
      prompt: {
        type: "string",
        description: "Prompt to execute during the heartbeat run",
      },
      session_id: {
        type: "string",
        description: "Optional explicit session id. If omitted, current session is used.",
      },
      __sessionId: {
        type: "string",
        description: "Injected session id",
      },
    },
    required: ["schedule", "prompt"],
  },
  async execute(args: Record<string, unknown>): Promise<string> {
    const sessionId = String(args.__sessionId || args.session_id || "").trim();
    const schedule = String(args.schedule || "").trim();
    const prompt = String(args.prompt || "").trim();

    if (!sessionId) {
      return JSON.stringify({ success: false, error: "Session ID not found" });
    }

    if (!schedule || !prompt) {
      return JSON.stringify({ success: false, error: "Both schedule and prompt are required" });
    }

    const result = setHeartbeatPrompt({
      sessionId,
      schedule,
      prompt,
    });

    if (!result.success) {
      return JSON.stringify(result);
    }

    return JSON.stringify({
      ...result,
      message: `Heartbeat prompt set (${result.intervalMinutes} min interval).`,
    });
  },
};

export const heartbeatTools: Tool[] = [setHeartbeatPromptTool];
