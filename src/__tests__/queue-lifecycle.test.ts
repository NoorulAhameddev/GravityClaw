import { describe, expect, it } from "vitest";
import { InProcessTaskQueue } from "../queue/backends/in-process.ts";

describe("queue lifecycle", () => {
  it("claims queued tasks once and persists completion", async () => {
    const queue = new InProcessTaskQueue();
    const sessionId = `queue-test-${Date.now()}-${Math.random()}`;
    const task = await queue.enqueueToolTask({
      taskId: "queued-tool",
      sessionId,
      runId: "run-1",
      toolName: "echo_test",
      input: { value: "ok" },
      source: "agent",
      maxRetries: 1,
      userId: undefined,
      platform: undefined,
      groupId: undefined,
      isGroup: false,
      workflowId: undefined,
      workflowTaskId: undefined,
    });

    const claimed = await queue.claimNext(sessionId);
    expect(claimed?.id).toBe(task.id);
    expect(claimed?.status).toBe("processing");

    const duplicate = await queue.claimNext(sessionId);
    expect(duplicate).toBeNull();

    await queue.markSucceeded(task.id, { ok: true });
    const persisted = await queue.getTask(task.id);
    expect(persisted?.status).toBe("completed");
    expect(persisted?.resultJson).toContain("ok");
  });
});
