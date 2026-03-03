import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db.ts";
import { recordUsage } from "../usage.ts";
import { buildEveningRecap, ensureEveningRecapTask, EVENING_RECAP_TASK_NAME } from "../recap/index.ts";

describe("Evening Recap Feature", () => {
  const sessionId = "test:recap";

  beforeEach(() => {
    db.prepare("DELETE FROM scheduled_tasks WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM usage WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM memory WHERE session_id = ?").run(sessionId);
  });

  it("creates evening recap task once (idempotent)", () => {
    const first = ensureEveningRecapTask(sessionId, { hourLocal: 20 });
    const second = ensureEveningRecapTask(sessionId, { hourLocal: 20 });

    expect(first.success).toBe(true);
    expect(first.created).toBe(true);
    expect(second.success).toBe(true);
    expect(second.created).toBe(false);

    const count = db.prepare(
      "SELECT COUNT(*) as c FROM scheduled_tasks WHERE session_id = ? AND name = ?"
    ).get(sessionId, EVENING_RECAP_TASK_NAME) as { c: number };

    expect(count.c).toBe(1);
  });

  it("builds recap markdown with usage and pending tasks", () => {
    db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)").run(
      sessionId,
      JSON.stringify({ role: "user", content: "What did I do today?" })
    );
    db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)").run(
      sessionId,
      JSON.stringify({ role: "assistant", content: "You completed two tasks." })
    );

    recordUsage({
      sessionId,
      model: "openai/gpt-4o-mini",
      promptTokens: 50,
      completionTokens: 25,
      provider: "openai",
    });

    db.prepare(
      "INSERT INTO scheduled_tasks (name, cron_expression, session_id, prompt, enabled, last_run, next_run) VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, datetime('now', '+1 day'))"
    ).run("completed-task", "0 8 * * *", sessionId, "done");

    db.prepare(
      "INSERT INTO scheduled_tasks (name, cron_expression, session_id, prompt, enabled, last_run, next_run) VALUES (?, ?, ?, ?, 1, NULL, datetime('now', '+1 hour'))"
    ).run("pending-task", "0 9 * * *", sessionId, "pending");

    const recap = buildEveningRecap(sessionId, "manual");

    expect(recap.success).toBe(true);
    expect(recap.reportMarkdown).toContain("Evening Recap");
    expect(recap.reportMarkdown).toContain("Today's Conversation");
    expect(recap.reportMarkdown).toContain("Completed Tasks");
    expect(recap.reportMarkdown).toContain("Pending Items");
    expect(recap.reportMarkdown).toContain("pending-task");
  });
});
