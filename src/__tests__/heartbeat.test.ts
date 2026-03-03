import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db.ts";
import {
  getHeartbeatStatus,
  setHeartbeatEnabled,
  setHeartbeatPromptTool,
  isHeartbeatTask,
} from "../heartbeat/index.ts";

describe("Heartbeat Feature", () => {
  const sessionId = "test:heartbeat";

  beforeEach(() => {
    db.prepare("DELETE FROM heartbeat_tasks WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM scheduled_tasks WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM memory WHERE session_id = ?").run(sessionId);
  });

  it("creates heartbeat task via tool", async () => {
    const result = await setHeartbeatPromptTool.execute({
      __sessionId: sessionId,
      schedule: "every hour",
      prompt: "Check if there are noteworthy updates. Return NO_UPDATE if none.",
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.taskId).toBeGreaterThan(0);

    const row = db.prepare(`
      SELECT scheduled_task_id, interval_minutes
      FROM heartbeat_tasks
      WHERE session_id = ?
      LIMIT 1
    `).get(sessionId) as { scheduled_task_id: number; interval_minutes: number } | undefined;

    expect(row).toBeDefined();
    expect(row?.interval_minutes).toBe(60);
    expect(isHeartbeatTask(row!.scheduled_task_id)).toBe(true);
  });

  it("enables and disables heartbeat tasks", async () => {
    const created = JSON.parse(await setHeartbeatPromptTool.execute({
      __sessionId: sessionId,
      schedule: "every 30 minutes",
      prompt: "Heartbeat prompt",
    }));

    expect(created.success).toBe(true);

    const disabled = setHeartbeatEnabled(sessionId, false);
    expect(disabled.success).toBe(true);

    const scheduledTask = db.prepare("SELECT enabled FROM scheduled_tasks WHERE id = ?").get(created.taskId) as { enabled: number } | undefined;
    expect(scheduledTask?.enabled).toBe(0);

    const enabled = setHeartbeatEnabled(sessionId, true);
    expect(enabled.success).toBe(true);

    const scheduledTaskAgain = db.prepare("SELECT enabled FROM scheduled_tasks WHERE id = ?").get(created.taskId) as { enabled: number } | undefined;
    expect(scheduledTaskAgain?.enabled).toBe(1);
  });

  it("reports heartbeat status", async () => {
    await setHeartbeatPromptTool.execute({
      __sessionId: sessionId,
      schedule: "every hour",
      prompt: "Heartbeat prompt",
    });

    const status = getHeartbeatStatus(sessionId);
    expect(status.enabled).toBe(true);
    expect(status.taskCount).toBe(1);
    expect(status.activeTaskCount).toBe(1);
    expect(status.intervalMinutes).toBe(60);
  });
});
