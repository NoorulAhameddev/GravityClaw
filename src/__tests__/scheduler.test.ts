import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  schedulerTools,
  parseNaturalLanguageToCron,
  scheduleTask,
  listTasks,
  toggleTask,
  deleteTask,
  getTask,
  registerTaskExecutionHandler,
} from "../scheduler/index.ts";
import { db } from "../db.ts";

describe("Scheduler Module", () => {
  // Clean up scheduled_tasks table before each test
  beforeEach(() => {
    db.exec("DELETE FROM scheduled_tasks");
  });

  afterEach(() => {
    db.exec("DELETE FROM scheduled_tasks");
  });

  describe("Tool Metadata", () => {
    it("should export exactly 4 tools", () => {
      expect(schedulerTools).toHaveLength(4);
    });

    it("should have correct tool names", () => {
      const toolNames = schedulerTools.map((t) => t.name);
      expect(toolNames).toEqual([
        "schedule_task",
        "list_tasks",
        "toggle_task",
        "delete_task",
      ]);
    });

    it("should have descriptions for all tools", () => {
      schedulerTools.forEach((tool) => {
        expect(tool.description).toBeTruthy();
        expect(tool.description.length).toBeGreaterThan(20);
      });
    });

    it("should have valid parameter schemas", () => {
      schedulerTools.forEach((tool) => {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
        expect(tool.inputSchema.properties).toBeDefined();
      });
    });
  });

  describe("Natural Language Parsing", () => {
    it("should parse 'every day at 9am' to cron", () => {
      const result = parseNaturalLanguageToCron("every day at 9am");
      expect(result).toBe("0 9 * * *");
    });

    it("should parse 'every day at 5pm' to cron", () => {
      const result = parseNaturalLanguageToCron("every day at 5pm");
      expect(result).toBe("0 17 * * *");
    });

    it("should parse 'every Monday' to cron", () => {
      const result = parseNaturalLanguageToCron("every Monday");
      expect(result).toBe("0 0 * * 1");
    });

    it("should parse 'every hour' to cron", () => {
      const result = parseNaturalLanguageToCron("every hour");
      expect(result).toBe("0 * * * *");
    });

    it("should parse 'every 30 minutes' to cron", () => {
      const result = parseNaturalLanguageToCron("every 30 minutes");
      expect(result).toBe("*/30 * * * *");
    });

    it("should parse 'every weekday' to cron", () => {
      const result = parseNaturalLanguageToCron("every weekday");
      expect(result).toBe("0 0 * * 1-5");
    });

    it("should parse 'every weekend' to cron", () => {
      const result = parseNaturalLanguageToCron("every weekend");
      expect(result).toBe("0 0 * * 0,6");
    });

    it("should accept valid cron expressions directly", () => {
      const result = parseNaturalLanguageToCron("0 9 * * *");
      expect(result).toBe("0 9 * * *");
    });

    it("should return null for invalid schedules", () => {
      const result = parseNaturalLanguageToCron("invalid schedule");
      expect(result).toBeNull();
    });

    it("should handle case-insensitive input", () => {
      const result = parseNaturalLanguageToCron("EVERY DAY AT 9AM");
      expect(result).toBe("0 9 * * *");
    });
  });

  describe("schedule_task tool", () => {
    const scheduleTool = schedulerTools.find((t) => t.name === "schedule_task")!;

    it("should require name, schedule, and prompt parameters", () => {
      expect(scheduleTool.inputSchema.required).toContain("name");
      expect(scheduleTool.inputSchema.required).toContain("schedule");
      expect(scheduleTool.inputSchema.required).toContain("prompt");
    });

    it("should schedule a task with natural language", async () => {
      const result = await scheduleTool.execute({
        name: "Daily briefing",
        schedule: "every day at 9am",
        prompt: "Summarize today's news",
        session_id: "test-session",
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.taskId).toBeGreaterThan(0);
      expect(parsed.cronExpression).toBe("0 9 * * *");
      expect(parsed.name).toBe("Daily briefing");
    });

    it("should schedule a task with cron expression", async () => {
      const result = await scheduleTool.execute({
        name: "Hourly check",
        schedule: "0 * * * *",
        prompt: "Check system status",
        session_id: "test-session",
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.cronExpression).toBe("0 * * * *");
    });

    it("should reject invalid schedules", async () => {
      const result = await scheduleTool.execute({
        name: "Bad task",
        schedule: "invalid schedule string",
        prompt: "Do something",
        session_id: "test-session",
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("Invalid schedule");
    });

    it("should reject missing parameters", async () => {
      const result = await scheduleTool.execute({
        name: "Incomplete task",
        session_id: "test-session",
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("required");
    });

    it("should save task to database", async () => {
      await scheduleTool.execute({
        name: "Test task",
        schedule: "every hour",
        prompt: "Test prompt",
        session_id: "test-session",
      });

      const tasks = listTasks("test-session");
      expect(tasks).toHaveLength(1);
      expect(tasks[0]!.name).toBe("Test task");
      expect(tasks[0]!.cronExpression).toBe("0 * * * *");
      expect(tasks[0]!.prompt).toBe("Test prompt");
    });
  });

  describe("list_tasks tool", () => {
    const listTool = schedulerTools.find((t) => t.name === "list_tasks")!;

    it("should not require any parameters", () => {
      expect(listTool.inputSchema.required).toHaveLength(0);
    });

    it("should return empty list when no tasks exist", async () => {
      const result = await listTool.execute({
        session_id: "test-session",
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.tasks).toHaveLength(0);
      expect(parsed.count).toBe(0);
    });

    it("should list tasks for current session", async () => {
      // Create tasks
      scheduleTask({
        name: "Task 1",
        schedule: "every hour",
        sessionId: "session-1",
        prompt: "Prompt 1",
      });
      scheduleTask({
        name: "Task 2",
        schedule: "every day at 9am",
        sessionId: "session-1",
        prompt: "Prompt 2",
      });
      scheduleTask({
        name: "Task 3",
        schedule: "every Monday",
        sessionId: "session-2",
        prompt: "Prompt 3",
      });

      const result = await listTool.execute({
        session_id: "session-1",
        all_sessions: false,
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(2);
      const taskNames = parsed.tasks.map((t: any) => t.name);
      expect(taskNames).toContain("Task 1");
      expect(taskNames).toContain("Task 2");
    });

    it("should list tasks from all sessions when requested", async () => {
      scheduleTask({
        name: "Task 1",
        schedule: "every hour",
        sessionId: "session-1",
        prompt: "Prompt 1",
      });
      scheduleTask({
        name: "Task 2",
        schedule: "every hour",
        sessionId: "session-2",
        prompt: "Prompt 2",
      });

      const result = await listTool.execute({
        session_id: "session-1",
        all_sessions: true,
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(2);
    });

    it("should include task details in response", async () => {
      scheduleTask({
        name: "Detailed task",
        schedule: "every day at 9am",
        sessionId: "test-session",
        prompt: "Check weather",
      });

      const result = await listTool.execute({
        session_id: "test-session",
      });

      const parsed = JSON.parse(result);
      expect(parsed.tasks[0]).toHaveProperty("id");
      expect(parsed.tasks[0]).toHaveProperty("name");
      expect(parsed.tasks[0]).toHaveProperty("schedule");
      expect(parsed.tasks[0]).toHaveProperty("prompt");
      expect(parsed.tasks[0]).toHaveProperty("enabled");
      expect(parsed.tasks[0]).toHaveProperty("lastRun");
      expect(parsed.tasks[0]).toHaveProperty("nextRun");
    });
  });

  describe("toggle_task tool", () => {
    const toggleTool = schedulerTools.find((t) => t.name === "toggle_task")!;

    it("should require task_id and enabled parameters", () => {
      expect(toggleTool.inputSchema.required).toContain("task_id");
      expect(toggleTool.inputSchema.required).toContain("enabled");
    });

    it("should disable a task", async () => {
      const { taskId } = scheduleTask({
        name: "Test task",
        schedule: "every hour",
        sessionId: "test-session",
        prompt: "Test",
      });

      const result = await toggleTool.execute({
        task_id: taskId,
        enabled: false,
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.enabled).toBe(false);

      const task = getTask(taskId!);
      expect(task?.enabled).toBe(false);
    });

    it("should enable a disabled task", async () => {
      const { taskId } = scheduleTask({
        name: "Test task",
        schedule: "every hour",
        sessionId: "test-session",
        prompt: "Test",
      });

      // Disable first
      toggleTask(taskId!, false);

      // Then enable
      const result = await toggleTool.execute({
        task_id: taskId,
        enabled: true,
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.enabled).toBe(true);

      const task = getTask(taskId!);
      expect(task?.enabled).toBe(true);
    });

    it("should fail for non-existent task", async () => {
      const result = await toggleTool.execute({
        task_id: 99999,
        enabled: true,
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("not found");
    });

    it("should reject invalid parameters", async () => {
      const result = await toggleTool.execute({
        task_id: "not-a-number",
        enabled: "not-a-boolean",
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("Invalid");
    });
  });

  describe("delete_task tool", () => {
    const deleteTool = schedulerTools.find((t) => t.name === "delete_task")!;

    it("should require task_id parameter", () => {
      expect(deleteTool.inputSchema.required).toContain("task_id");
    });

    it("should delete a task", async () => {
      const { taskId } = scheduleTask({
        name: "Task to delete",
        schedule: "every hour",
        sessionId: "test-session",
        prompt: "Test",
      });

      const result = await deleteTool.execute({
        task_id: taskId,
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.taskId).toBe(taskId);

      const task = getTask(taskId!);
      expect(task).toBeNull();
    });

    it("should fail for non-existent task", async () => {
      const result = await deleteTool.execute({
        task_id: 99999,
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("not found");
    });

    it("should reject invalid parameters", async () => {
      const result = await deleteTool.execute({
        task_id: "not-a-number",
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("Invalid");
    });

    it("should remove task from database", async () => {
      const { taskId } = scheduleTask({
        name: "Test task",
        schedule: "every hour",
        sessionId: "test-session",
        prompt: "Test",
      });

      await deleteTool.execute({ task_id: taskId });

      const tasks = listTasks("test-session");
      expect(tasks).toHaveLength(0);
    });
  });

  describe("Result Format Consistency", () => {
    it("should return success/error format for all tools", async () => {
      for (const tool of schedulerTools) {
        let params: any = { session_id: "test" };
        if (tool.name === "schedule_task") {
          params = { name: "Test", schedule: "every hour", prompt: "Test", session_id: "test" };
        }
        if (tool.name === "toggle_task") params = { task_id: 1, enabled: true };
        if (tool.name === "delete_task") params = { task_id: 1 };

        const result = await tool.execute(params);
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty("success");
        if (parsed.success) {
          expect(parsed.error).toBeUndefined();
        } else {
          expect(parsed.error).toBeDefined();
        }
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle very long task names", async () => {
      const longName = "A".repeat(500);
      const { taskId } = scheduleTask({
        name: longName,
        schedule: "every hour",
        sessionId: "test-session",
        prompt: "Test",
      });

      const task = getTask(taskId!);
      expect(task?.name).toBe(longName);
    });

    it("should handle very long prompts", async () => {
      const longPrompt = "Test ".repeat(1000);
      const { taskId } = scheduleTask({
        name: "Long prompt task",
        schedule: "every hour",
        sessionId: "test-session",
        prompt: longPrompt,
      });

      const task = getTask(taskId!);
      expect(task?.prompt).toBe(longPrompt);
    });

    it("should handle special characters in task names", async () => {
      const specialName = "Task with émojis 🚀 and symbols !@#$%";
      const { taskId } = scheduleTask({
        name: specialName,
        schedule: "every hour",
        sessionId: "test-session",
        prompt: "Test",
      });

      const task = getTask(taskId!);
      expect(task?.name).toBe(specialName);
    });

    it("should handle 12am/12pm edge cases", async () => {
      const noon = parseNaturalLanguageToCron("every day at 12pm");
      expect(noon).toBe("0 12 * * *");

      const midnight = parseNaturalLanguageToCron("every day at 12am");
      expect(midnight).toBe("0 0 * * *");
    });

    it("should handle invalid minute intervals", async () => {
      const result = parseNaturalLanguageToCron("every 70 minutes");
      expect(result).toBeNull();
    });

    it("should handle multiple tasks with same name", async () => {
      scheduleTask({
        name: "Duplicate",
        schedule: "every hour",
        sessionId: "session-1",
        prompt: "Test 1",
      });
      scheduleTask({
        name: "Duplicate",
        schedule: "every day at 9am",
        sessionId: "session-1",
        prompt: "Test 2",
      });

      const tasks = listTasks("session-1");
      expect(tasks).toHaveLength(2);
      expect(tasks.every((t) => t.name === "Duplicate")).toBe(true);
    });
  });

  describe("Database Integration", () => {
    it("should persist tasks across function calls", async () => {
      const { taskId } = scheduleTask({
        name: "Persistent task",
        schedule: "every hour",
        sessionId: "test-session",
        prompt: "Test",
      });

      // Get task through different function
      const task = getTask(taskId!);
      expect(task).not.toBeNull();
      expect(task?.name).toBe("Persistent task");

      // List tasks through different function
      const tasks = listTasks("test-session");
      expect(tasks).toHaveLength(1);
      expect(tasks[0]!.id).toBe(taskId);
    });

    it("should maintain task state after toggle", async () => {
      const { taskId } = scheduleTask({
        name: "Toggle test",
        schedule: "every hour",
        sessionId: "test-session",
        prompt: "Test",
      });

      toggleTask(taskId!, false);
      const disabled = getTask(taskId!);
      expect(disabled?.enabled).toBe(false);

      toggleTask(taskId!, true);
      const enabled = getTask(taskId!);
      expect(enabled?.enabled).toBe(true);
    });

    it("should clean up after deletion", async () => {
      const { taskId: id1 } = scheduleTask({
        name: "Task 1",
        schedule: "every hour",
        sessionId: "test-session",
        prompt: "Test",
      });
      const { taskId: id2 } = scheduleTask({
        name: "Task 2",
        schedule: "every hour",
        sessionId: "test-session",
        prompt: "Test",
      });

      deleteTask(id1!);

      const tasks = listTasks("test-session");
      expect(tasks).toHaveLength(1);
      expect(tasks[0]!.id).toBe(id2);
    });
  });

  describe("Task Execution Handler", () => {
    it("should allow registering an execution handler", () => {
      const handler = vi.fn();
      registerTaskExecutionHandler(handler);
      // If this doesn't throw, registration succeeded
      expect(true).toBe(true);
    });

    it("should accept async handler functions", () => {
      const handler = async (taskId: number, sessionId: string, prompt: string) => {
        // Async handler
        await Promise.resolve();
      };
      registerTaskExecutionHandler(handler);
      expect(true).toBe(true);
    });
  });

  describe("Cron Expression Validation", () => {
    it("should accept valid 5-field cron expressions", () => {
      const valid = [
        "0 9 * * *",
        "*/15 * * * *",
        "0 0 1 * *",
        "0 0 * * 0",
        "30 2 * * 1-5",
      ];

      valid.forEach((expr) => {
        const result = parseNaturalLanguageToCron(expr);
        expect(result).toBe(expr);
      });
    });

    it("should reject invalid cron expressions", () => {
      const invalid = [
        "0 25 * * *", // Invalid hour
        "60 * * * *", // Invalid minute
        "* * * * * *", // 6 fields (seconds not supported)
        "invalid",
      ];

      invalid.forEach((expr) => {
        const result = parseNaturalLanguageToCron(expr);
        expect(result).toBeNull();
      });
    });
  });

  describe("Multiple Sessions", () => {
    it("should isolate tasks between sessions", async () => {
      scheduleTask({
        name: "Session 1 task",
        schedule: "every hour",
        sessionId: "session-1",
        prompt: "Test",
      });
      scheduleTask({
        name: "Session 2 task",
        schedule: "every hour",
        sessionId: "session-2",
        prompt: "Test",
      });

      const session1Tasks = listTasks("session-1");
      const session2Tasks = listTasks("session-2");

      expect(session1Tasks).toHaveLength(1);
      expect(session2Tasks).toHaveLength(1);
      expect(session1Tasks[0]!.name).toBe("Session 1 task");
      expect(session2Tasks[0]!.name).toBe("Session 2 task");
    });

    it("should allow same task name in different sessions", async () => {
      scheduleTask({
        name: "Daily check",
        schedule: "every day at 9am",
        sessionId: "session-1",
        prompt: "Prompt 1",
      });
      scheduleTask({
        name: "Daily check",
        schedule: "every day at 10am",
        sessionId: "session-2",
        prompt: "Prompt 2",
      });

      const allTasks = listTasks();
      expect(allTasks).toHaveLength(2);
      expect(allTasks.every((t) => t.name === "Daily check")).toBe(true);
    });
  });
});
