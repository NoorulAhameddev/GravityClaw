import { db } from "../db.ts";
import { createLogger } from "../logger.ts";
import * as cron from "node-cron";
import type { Tool } from "../tools/index.js";

const log = createLogger("scheduler");

/**
 * Initialize scheduled_tasks table
 */
export function initScheduler(): void {
  // Database schema initialized centrally in src/db.ts
  log.info("Scheduler initialized");
  
  // Load and start all enabled tasks
  loadEnabledTasks();
}

export interface ScheduledTask {
  id: number;
  name: string;
  cronExpression: string;
  sessionId: string;
  prompt: string;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
  createdAt: string;
  createdBy: string | null;
}

/**
 * Active cron jobs registry
 * Maps task ID to cron.ScheduledTask
 */
const activeCronJobs = new Map<number, cron.ScheduledTask>();

/**
 * Task execution callback registry
 * Allows external code to register handlers for task execution
 */
type TaskExecutionHandler = (taskId: number, sessionId: string, prompt: string) => Promise<void>;
let taskExecutionHandler: TaskExecutionHandler | null = null;

// Initialize on module load (after runtime registries are ready)
initScheduler();

/**
 * Register a handler for task execution
 * This will be called when a scheduled task triggers
 */
export function registerTaskExecutionHandler(handler: TaskExecutionHandler): void {
  taskExecutionHandler = handler;
  log.info("Task execution handler registered");
}

/**
 * Parse natural language schedule to cron expression
 * Supports common patterns like:
 * - "every day at 9am" → "0 9 * * *"
 * - "every Monday" → "0 0 * * 1"
 * - "every hour" → "0 * * * *"
 * - "every 30 minutes" → "*\/30 * * * *"
 */
export function parseNaturalLanguageToCron(input: string): string | null {
  const lower = input.toLowerCase().trim();
  
  // Direct cron expression (validate)
  if (/^[\d\*\/\-,]+\s+[\d\*\/\-,]+\s+[\d\*\/\-,]+\s+[\d\*\/\-,]+\s+[\d\*\/\-,]+$/.test(lower)) {
    return cron.validate(lower) ? lower : null;
  }
  
  // Every X minutes
  const minutesMatch = lower.match(/every\s+(\d+)\s+minutes?/);
  if (minutesMatch && minutesMatch[1]) {
    const minutes = parseInt(minutesMatch[1], 10);
    if (minutes > 0 && minutes < 60) {
      return `*/${minutes} * * * *`;
    }
  }
  
  // Every hour
  if (lower.includes("every hour")) {
    return "0 * * * *";
  }
  
  // Every day at specific time
  const dailyMatch = lower.match(/every\s+day\s+at\s+(\d+)(am|pm)?/);
  if (dailyMatch && dailyMatch[1]) {
    let hour = parseInt(dailyMatch[1], 10);
    const meridiem = dailyMatch[2];
    
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    
    if (hour >= 0 && hour < 24) {
      return `0 ${hour} * * *`;
    }
  }
  
  // Every weekday
  const weekdayMap: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  
  for (const [day, num] of Object.entries(weekdayMap)) {
    if (lower.includes(`every ${day}`)) {
      return `0 0 * * ${num}`;
    }
  }
  
  // Weekdays (Monday-Friday)
  if (lower.includes("every weekday") || lower.includes("weekdays")) {
    return "0 0 * * 1-5";
  }
  
  // Weekend
  if (lower.includes("every weekend")) {
    return "0 0 * * 0,6";
  }
  
  // Every week
  if (lower.includes("every week")) {
    return "0 0 * * 0"; // Sunday midnight
  }
  
  // Every month
  if (lower.includes("every month")) {
    return "0 0 1 * *"; // First day of month
  }
  
  return null;
}

/**
 * Calculate next run time for a cron expression
 */
function calculateNextRun(cronExpression: string): Date | null {
  try {
    const schedule = cron.schedule(cronExpression, () => {});
    // Access nextDate via type assertion since it's an internal property
    const cronDate = (schedule as unknown as { nextDate: () => { toDate: () => Date } }).nextDate?.();
    schedule.stop();
    return cronDate ? cronDate.toDate() : null;
  } catch (error) {
    log.error(`Error calculating next run - cronExpression: ${cronExpression}, error: ${error}`);
    return null;
  }
}

/**
 * Execute a scheduled task
 */
async function executeTask(task: ScheduledTask): Promise<void> {
  log.info(`Executing scheduled task: ${task.name} (id: ${task.id}, session: ${task.sessionId})`);
  
  try {
    // Update last_run
    db.prepare("UPDATE scheduled_tasks SET last_run = CURRENT_TIMESTAMP WHERE id = ?").run(task.id);
    
    // Execute via registered handler
    if (taskExecutionHandler) {
      await taskExecutionHandler(task.id, task.sessionId, task.prompt);
      log.info(`Task executed: ${task.name} (id: ${task.id})`);
    } else {
      log.debug(`Task skipped (no handler): ${task.name} (id: ${task.id})`);
    }
  } catch (error) {
    log.warn(`Scheduled task failed (no handler/channel): ${task.name} (id: ${task.id}, error: ${error instanceof Error ? error.message : String(error)})`);
  }
}

/**
 * Start a cron job for a task
 */
function startCronJob(task: ScheduledTask): void {
  // Stop existing job if any
  if (activeCronJobs.has(task.id)) {
    activeCronJobs.get(task.id)?.stop();
    activeCronJobs.delete(task.id);
  }
  
  try {
    const job = cron.schedule(task.cronExpression, () => {
      executeTask(task).catch((err) => {
        log.error(`Unhandled error in task execution - taskId: ${task.id}, error: ${err}`);
      });
    });
    
    activeCronJobs.set(task.id, job);
    
    log.info(`Cron job started: ${task.name} (id: ${task.id}, cron: ${task.cronExpression})`);
  } catch (error) {
    log.error(`Failed to start cron job - id: ${task.id}, cron: ${task.cronExpression}, error: ${error}`);
  }
}

/**
 * Load and start all enabled tasks from database
 */
function loadEnabledTasks(): void {
  try {
    const tasks = db
      .prepare("SELECT * FROM scheduled_tasks WHERE enabled = 1")
      .all() as any[];
    
    for (const row of tasks) {
      const task: ScheduledTask = {
        id: row.id,
        name: row.name,
        cronExpression: row.cron_expression,
        sessionId: row.session_id,
        prompt: row.prompt,
        enabled: Boolean(row.enabled),
        lastRun: row.last_run,
        nextRun: row.next_run,
        createdAt: row.created_at,
        createdBy: row.created_by,
      };
      
      startCronJob(task);
    }
    
    log.info(`Loaded ${tasks.length} enabled scheduled tasks`);
  } catch (error) {
    log.error(`Error loading scheduled tasks - error: ${error}`);
  }
}

/**
 * Schedule a new task
 */
export function scheduleTask(params: {
  name: string;
  schedule: string;
  sessionId: string;
  prompt: string;
  createdBy?: string;
}): { success: boolean; taskId?: number; error?: string; cronExpression?: string } {
  try {
    // Parse schedule to cron expression
    const cronExpression = parseNaturalLanguageToCron(params.schedule);
    
    if (!cronExpression) {
      return {
        success: false,
        error: `Invalid schedule: "${params.schedule}". Use natural language like "every day at 9am" or cron expression like "0 9 * * *"`,
      };
    }
    
    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      return {
        success: false,
        error: `Invalid cron expression: ${cronExpression}`,
      };
    }
    
    // Calculate next run
    const nextRun = calculateNextRun(cronExpression);
    
    // Insert into database
    const result = db
      .prepare(
        `INSERT INTO scheduled_tasks (name, cron_expression, session_id, prompt, next_run, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        params.name,
        cronExpression,
        params.sessionId,
        params.prompt,
        nextRun ? nextRun.toISOString() : null,
        params.createdBy || null
      );
    
    const taskId = result.lastInsertRowid as number;
    
    // Load task and start cron job
    const task = db.prepare("SELECT * FROM scheduled_tasks WHERE id = ?").get(taskId) as any;
    
    const scheduledTask: ScheduledTask = {
      id: task.id,
      name: task.name,
      cronExpression: task.cron_expression,
      sessionId: task.session_id,
      prompt: task.prompt,
      enabled: Boolean(task.enabled),
      lastRun: task.last_run,
      nextRun: task.next_run,
      createdAt: task.created_at,
      createdBy: task.created_by,
    };
    
    startCronJob(scheduledTask);
    
    log.info(`Task scheduled: ${params.name} (id: ${taskId}, cron: ${cronExpression})`);
    
    return {
      success: true,
      taskId,
      cronExpression,
    };
  } catch (error: any) {
    log.error(`Error scheduling task - error: ${error}`);
    return {
      success: false,
      error: error.message || "Failed to schedule task",
    };
  }
}

/**
 * List all scheduled tasks (optionally filter by session)
 */
export function listTasks(sessionId?: string): ScheduledTask[] {
  try {
    const query = sessionId
      ? db.prepare("SELECT * FROM scheduled_tasks WHERE session_id = ? ORDER BY created_at DESC")
      : db.prepare("SELECT * FROM scheduled_tasks ORDER BY created_at DESC");
    
    const rows = sessionId ? query.all(sessionId) : query.all();
    
    return (rows as any[]).map((row) => ({
      id: row.id,
      name: row.name,
      cronExpression: row.cron_expression,
      sessionId: row.session_id,
      prompt: row.prompt,
      enabled: Boolean(row.enabled),
      lastRun: row.last_run,
      nextRun: row.next_run,
      createdAt: row.created_at,
      createdBy: row.created_by,
    }));
  } catch (error) {
    log.error(`Error listing tasks - error: ${error}`);
    return [];
  }
}

/**
 * Get a single task by ID
 */
export function getTask(taskId: number): ScheduledTask | null {
  try {
    const row = db.prepare("SELECT * FROM scheduled_tasks WHERE id = ?").get(taskId) as any;
    
    if (!row) return null;
    
    return {
      id: row.id,
      name: row.name,
      cronExpression: row.cron_expression,
      sessionId: row.session_id,
      prompt: row.prompt,
      enabled: Boolean(row.enabled),
      lastRun: row.last_run,
      nextRun: row.next_run,
      createdAt: row.created_at,
      createdBy: row.created_by,
    };
  } catch (error) {
    log.error(`Error getting task - taskId: ${taskId}, error: ${error}`);
    return null;
  }
}

/**
 * Pause/resume a task
 */
export function toggleTask(taskId: number, enabled: boolean): { success: boolean; error?: string } {
  try {
    const task = getTask(taskId);
    if (!task) {
      return { success: false, error: "Task not found" };
    }
    
    db.prepare("UPDATE scheduled_tasks SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, taskId);
    
    if (enabled) {
      // Start cron job
      task.enabled = true;
      startCronJob(task);
      log.info(`Task enabled: ${task.name} (id: ${taskId})`);
    } else {
      // Stop cron job
      const job = activeCronJobs.get(taskId);
      if (job) {
        job.stop();
        activeCronJobs.delete(taskId);
      }
      log.info(`Task disabled: ${task.name} (id: ${taskId})`);
    }
    
    return { success: true };
  } catch (error: any) {
    log.error(`Error toggling task - taskId: ${taskId}, enabled: ${enabled}, error: ${error}`);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a task
 */
export function deleteTask(taskId: number): { success: boolean; error?: string } {
  try {
    const task = getTask(taskId);
    if (!task) {
      return { success: false, error: "Task not found" };
    }
    
    // Stop cron job if running
    const job = activeCronJobs.get(taskId);
    if (job) {
      job.stop();
      activeCronJobs.delete(taskId);
    }
    
    // Delete from database
    db.prepare("DELETE FROM scheduled_tasks WHERE id = ?").run(taskId);
    
    log.info(`Task deleted: ${task.name} (id: ${taskId})`);
    
    return { success: true };
  } catch (error: any) {
    log.error(`Error deleting task - taskId: ${taskId}, error: ${error}`);
    return { success: false, error: error.message };
  }
}

/**
 * Tool: Schedule a task
 */
export const scheduleTaskTool: Tool = {
  name: "schedule_task",
  description:
    "Schedule a recurring task using natural language or cron expression. The task will execute the given prompt at the specified schedule. Supports patterns like 'every day at 9am', 'every Monday', 'every hour', 'every 30 minutes', or cron expressions like '0 9 * * *'.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Descriptive name for the task (e.g., 'Daily morning briefing')",
      },
      schedule: {
        type: "string",
        description:
          "Schedule in natural language or cron format. Examples: 'every day at 9am', 'every Monday', '0 9 * * *', 'every 30 minutes'",
      },
      prompt: {
        type: "string",
        description:
          "The prompt to execute when the task triggers (e.g., 'Summarize today's news'). The agent will process this prompt and send results to the session.",
      },
    },
    required: ["name", "schedule", "prompt"],
  },
  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      const name = args.name as string;
      const schedule = args.schedule as string;
      const prompt = args.prompt as string;
      const sessionId = (args.__sessionId as string) || (args.session_id as string); // Injected by tool executor
      
      if (!name || !schedule || !prompt) {
        return JSON.stringify({
          success: false,
          error: "Missing required parameters: name, schedule, and prompt are required",
        });
      }
      
      const result = scheduleTask({
        name,
        schedule,
        sessionId: sessionId || "unknown",
        prompt,
      });
      
      if (result.success) {
        return JSON.stringify({
          success: true,
          taskId: result.taskId,
          name,
          cronExpression: result.cronExpression,
          message: `Task "${name}" scheduled successfully with cron expression: ${result.cronExpression}`,
        });
      } else {
        return JSON.stringify({
          success: false,
          error: result.error,
        });
      }
    } catch (error: any) {
      log.error(`Error in schedule_task tool - error: ${error}`);
      return JSON.stringify({
        success: false,
        error: error.message || "Failed to schedule task",
      });
    }
  },
};

/**
 * Tool: List all scheduled tasks
 */
export const listTasksTool: Tool = {
  name: "list_tasks",
  description:
    "List all scheduled tasks for the current session. Shows task ID, name, schedule (cron expression), enabled status, last run time, and next run time.",
  inputSchema: {
    type: "object",
    properties: {
      all_sessions: {
        type: "boolean",
        description:
          "If true, list tasks from all sessions (default: false, only current session)",
      },
    },
    required: [],
  },
  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      const allSessions = args.all_sessions as boolean;
      const sessionId = (args.__sessionId as string) || (args.session_id as string); // Injected by tool executor
      
      const tasks = listTasks(allSessions ? undefined : sessionId);
      
      if (tasks.length === 0) {
        return JSON.stringify({
          success: true,
          tasks: [],
          count: 0,
          message: "No scheduled tasks found",
        });
      }
      
      return JSON.stringify({
        success: true,
        tasks: tasks.map((task) => ({
          id: task.id,
          name: task.name,
          schedule: task.cronExpression,
          prompt: task.prompt,
          enabled: task.enabled,
          lastRun: task.lastRun,
          nextRun: task.nextRun,
          createdAt: task.createdAt,
        })),
        count: tasks.length,
      });
    } catch (error: any) {
      log.error(`Error in list_tasks tool - error: ${error}`);
      return JSON.stringify({
        success: false,
        error: error.message || "Failed to list tasks",
      });
    }
  },
};

/**
 * Tool: Pause or resume a task
 */
export const toggleTaskTool: Tool = {
  name: "toggle_task",
  description:
    "Enable or disable a scheduled task. Disabled tasks will not execute until re-enabled.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: {
        type: "number",
        description: "The ID of the task to enable/disable",
      },
      enabled: {
        type: "boolean",
        description: "true to enable the task, false to disable it",
      },
    },
    required: ["task_id", "enabled"],
  },
  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      const taskId = args.task_id as number;
      const enabled = args.enabled as boolean;
      
      if (typeof taskId !== "number" || typeof enabled !== "boolean") {
        return JSON.stringify({
          success: false,
          error: "Invalid parameters: task_id must be a number, enabled must be a boolean",
        });
      }
      
      const result = toggleTask(taskId, enabled);
      
      if (result.success) {
        const task = getTask(taskId);
        return JSON.stringify({
          success: true,
          taskId,
          enabled,
          taskName: task?.name,
          message: `Task ${enabled ? "enabled" : "disabled"} successfully`,
        });
      } else {
        return JSON.stringify({
          success: false,
          error: result.error,
        });
      }
    } catch (error: any) {
      log.error(`Error in toggle_task tool - error: ${error}`);
      return JSON.stringify({
        success: false,
        error: error.message || "Failed to toggle task",
      });
    }
  },
};

/**
 * Tool: Delete a scheduled task
 */
export const deleteTaskTool: Tool = {
  name: "delete_task",
  description:
    "Permanently delete a scheduled task. This action cannot be undone. The task will stop executing and be removed from the database.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: {
        type: "number",
        description: "The ID of the task to delete",
      },
    },
    required: ["task_id"],
  },
  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      const taskId = args.task_id as number;
      
      if (typeof taskId !== "number") {
        return JSON.stringify({
          success: false,
          error: "Invalid parameter: task_id must be a number",
        });
      }
      
      const task = getTask(taskId);
      const result = deleteTask(taskId);
      
      if (result.success) {
        return JSON.stringify({
          success: true,
          taskId,
          taskName: task?.name,
          message: `Task "${task?.name || taskId}" deleted successfully`,
        });
      } else {
        return JSON.stringify({
          success: false,
          error: result.error,
        });
      }
    } catch (error: any) {
      log.error(`Error in delete_task tool - error: ${error}`);
      return JSON.stringify({
        success: false,
        error: error.message || "Failed to delete task",
      });
    }
  },
};

/**
 * Export all scheduler tools
 */
export const schedulerTools: Tool[] = [
  scheduleTaskTool,
  listTasksTool,
  toggleTaskTool,
  deleteTaskTool,
];
