import { describe, expect, it } from "vitest";
import type { Tool } from "../types/tools.js";
import { ToolExecutor } from "../tools/executor.ts";

function createExecutor(tool: Tool) {
  return new ToolExecutor({
    get: (name: string) => (name === tool.name ? tool : undefined),
  });
}

describe("ToolExecutor", () => {
  it("rejects invalid input before executing a tool", async () => {
    let executed = false;
    const tool: Tool = {
      name: "needs_value",
      description: "test tool",
      inputSchema: {
        type: "object",
        properties: {
          value: { type: "string" },
        },
        required: ["value"],
      },
      async execute() {
        executed = true;
        return JSON.stringify({ success: true });
      },
    };

    const result = await createExecutor(tool).execute({
      toolName: "needs_value",
      input: {},
      context: { sessionId: "test:executor" },
    });

    expect(result.success).toBe(false);
    expect(result.error?.type).toBe("validation");
    expect(executed).toBe(false);
  });

  it("requires explicit approval for tools marked requiresApproval", async () => {
    let executed = false;
    const tool: Tool = {
      name: "dangerous_test_tool",
      description: "test tool",
      inputSchema: { type: "object", properties: {}, required: [] },
      requiresApproval: true,
      async execute() {
        executed = true;
        return "executed";
      },
    };

    const result = await createExecutor(tool).execute({
      toolName: "dangerous_test_tool",
      input: {},
      context: { sessionId: "test:executor" },
    });

    expect(result.success).toBe(false);
    expect(result.error?.type).toBe("approval_required");
    expect(executed).toBe(false);
  });

  it("blocks unsafe shell commands even when approval is present", async () => {
    let executed = false;
    const tool: Tool = {
      name: "run_shell",
      description: "shell",
      inputSchema: {
        type: "object",
        properties: {
          command: { type: "string" },
        },
        required: ["command"],
      },
      requiresApproval: true,
      async execute() {
        executed = true;
        return "executed";
      },
    };

    const result = await createExecutor(tool).execute({
      toolName: "run_shell",
      input: { command: "rm -rf /" },
      context: { sessionId: "test:executor" },
      approval: { approvedBy: "test", reason: "regression" },
    });

    expect(result.success).toBe(false);
    expect(result.error?.type).toBe("security_policy");
    expect(executed).toBe(false);
  });

  it("executes approved valid tools and injects execution context", async () => {
    const tool: Tool = {
      name: "approved_test_tool",
      description: "test tool",
      inputSchema: {
        type: "object",
        properties: {
          value: { type: "string" },
        },
        required: ["value"],
      },
      requiresApproval: true,
      async execute(input) {
        return JSON.stringify({
          value: input.value,
          sessionId: input.__sessionId,
          userId: input.__userId,
        });
      },
    };

    const result = await createExecutor(tool).execute({
      toolName: "approved_test_tool",
      input: { value: "ok" },
      context: {
        sessionId: "test:executor",
        userId: "user-1",
      },
      approval: { approvedBy: "test", reason: "regression" },
    });

    expect(result.success).toBe(true);
    expect(result.result).toBe(JSON.stringify({
      value: "ok",
      sessionId: "test:executor",
      userId: "user-1",
    }));
  });
});

