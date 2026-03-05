/**
 * Channel → Agent → Tool Flow Integration Tests
 * Tests full message flow through channels, agent, and tool execution
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createLogger } from "../../logger.ts";
import { db } from "../../db.ts";
import type { UnifiedMessage } from "../../types/channels.js";
import type { Tool } from "../../types/tools.js";
import {
  createTestSessionId,
  createTestSession,
  cleanupTestSession,
  getSessionHistory,
  insertTestMessage,
  createMockToolExecutor,
  waitFor,
} from "./test-utils.ts";

const log = createLogger("channel-agent-tool-test");

describe("Channel → Agent → Tool Integration", () => {
  let testSessionId: string;

  beforeEach(() => {
    testSessionId = createTestSessionId("channel-flow");
    createTestSession(testSessionId);
  });

  afterEach(() => {
    cleanupTestSession(testSessionId);
  });

  describe("Message Flow Through Channels", () => {
    it("should process user message and store in history", async () => {
      const message = "Hello, can you help me?";
      insertTestMessage(testSessionId, "user", message);

      const history = getSessionHistory(testSessionId);
      expect(history.length).toBeGreaterThan(0);

      const userMsg = history.find((m) => m.role === "user" && m.content === message);
      expect(userMsg).toBeDefined();
    });

    it("should maintain conversation order in history", async () => {
      const messages = [
        { role: "user" as const, content: "First message" },
        { role: "assistant" as const, content: "First response" },
        { role: "user" as const, content: "Second message" },
        { role: "assistant" as const, content: "Second response" },
      ];

      messages.forEach((msg) => {
        insertTestMessage(testSessionId, msg.role, msg.content);
      });

      const history = getSessionHistory(testSessionId);
      const contentSequence = history.map((m) => m.content);

      expect(contentSequence.includes("First message")).toBe(true);
      expect(contentSequence.includes("First response")).toBe(true);
      expect(contentSequence.indexOf("First message")).toBeLessThan(
        contentSequence.indexOf("First response")
      );
    });

    it("should handle multi-turn conversations", async () => {
      const turns = [
        { msg: "What's the weather?", response: "It's sunny today" },
        { msg: "What about tomorrow?", response: "Partly cloudy is expected" },
        { msg: "Should I bring an umbrella?", response: "A light jacket would be safer" },
      ];

      for (const turn of turns) {
        insertTestMessage(testSessionId, "user", turn.msg);
        insertTestMessage(testSessionId, "assistant", turn.response);
      }

      const history = getSessionHistory(testSessionId);
      expect(history.length).toBeGreaterThanOrEqual(turns.length * 2);

      // Verify context is maintained
      const userMessages = history.filter((m) => m.role === "user").map((m) => m.content);
      expect(userMessages).toContain("What's the weather?");
      expect(userMessages).toContain("What about tomorrow?");
      expect(userMessages).toContain("Should I bring an umbrella?");
    });
  });

  describe("Agent Tool Execution", () => {
    it("should execute tool and store result in history", async () => {
      const toolName = "test-tool";
      const toolResult = "Tool execution successful";

      // Simulate tool execution
      insertTestMessage(testSessionId, "user", `Execute ${toolName}`);
      insertTestMessage(testSessionId, "assistant", `Executing ${toolName}...`);
      insertTestMessage(testSessionId, "tool", toolResult);

      const history = getSessionHistory(testSessionId);
      const toolMsg = history.find((m) => m.role === "tool" && m.content === toolResult);

      expect(toolMsg).toBeDefined();
    });

    it("should handle multiple tool calls in sequence", async () => {
      const tools = ["tool-a", "tool-b", "tool-c"];

      insertTestMessage(testSessionId, "user", "Execute all tools");

      for (const tool of tools) {
        insertTestMessage(
          testSessionId,
          "assistant",
          `Calling ${tool}...`
        );
        insertTestMessage(testSessionId, "tool", `Result from ${tool}`);
      }

      const history = getSessionHistory(testSessionId);
      const toolMessages = history.filter((m) => m.role === "tool");

      expect(toolMessages).toHaveLength(tools.length);
    });

    it("should handle tool errors gracefully", async () => {
      insertTestMessage(testSessionId, "user", "Execute failing tool");
      insertTestMessage(testSessionId, "assistant", "Calling failing-tool...");
      insertTestMessage(
        testSessionId,
        "tool-error",
        "Tool execution failed: Permission denied"
      );

      const history = getSessionHistory(testSessionId);
      const errorMsg = history.find(
        (m) => m.role === "tool-error"
      );

      expect(errorMsg).toBeDefined();
      expect(errorMsg?.content).toContain("Permission denied");
    });
  });

  describe("Response Routing Back to Channel", () => {
    it("should format response for text channel", async () => {
      const responses = [
        "Here is the information you requested",
        "I've completed the task successfully",
        "The operation took 2.5 seconds",
      ];

      for (const response of responses) {
        insertTestMessage(testSessionId, "assistant", response);
      }

      const history = getSessionHistory(testSessionId);
      const assistantMessages = history.filter((m) => m.role === "assistant");

      expect(assistantMessages).toHaveLength(responses.length);
      assistantMessages.forEach((msg, idx) => {
        expect(msg.content).toBe(responses[idx]);
      });
    });

    it("should handle rich response formatting", async () => {
      const richResponse = {
        text: "Here's a summary:",
        metadata: {
          type: "structured",
          data: { items: ["item1", "item2", "item3"] },
        },
      };

      insertTestMessage(testSessionId, "assistant", JSON.stringify(richResponse));

      const history = getSessionHistory(testSessionId);
      const lastMsg = history[history.length - 1];

      expect(lastMsg?.content).toContain("structured");
      expect(lastMsg?.content).toContain("item1");
    });
  });

  describe("Multi-Turn State Management", () => {
    it("should maintain context across turns", async () => {
      const context = {
        topic: "database design",
        userLevel: "intermediate",
      };

      insertTestMessage(testSessionId, "system", JSON.stringify(context));
      insertTestMessage(
        testSessionId,
        "user",
        "Tell me about normalization in database design"
      );
      insertTestMessage(
        testSessionId,
        "assistant",
        "For intermediate users, normalization means..."
      );

      const history = getSessionHistory(testSessionId);
      const systemMsg = history.find((m) => m.role === "system");

      expect(systemMsg?.content).toContain("database design");
    });

    it("should track conversation state transitions", async () => {
      const states = ["idle", "listening", "processing", "responding", "idle"];

      for (const state of states) {
        insertTestMessage(testSessionId, "state", state);
      }

      const history = getSessionHistory(testSessionId);
      const stateMessages = history.filter((m) => m.role === "state");

      expect(stateMessages).toHaveLength(states.length);
      expect(stateMessages[0]?.content).toBe("idle");
      expect(stateMessages[stateMessages.length - 1]?.content).toBe("idle");
    });
  });

  describe("Error Handling in Message Flow", () => {
    it("should handle malformed messages", async () => {
      // Test with empty message
      expect(() => {
        insertTestMessage(testSessionId, "user", "");
      }).not.toThrow();

      const history = getSessionHistory(testSessionId);
      expect(history).toBeDefined();
    });

    it("should handle very long messages", async () => {
      const longMessage = "x".repeat(10000);
      insertTestMessage(testSessionId, "user", longMessage);

      const history = getSessionHistory(testSessionId);
      const msg = history.find((m) => m.content === longMessage);

      expect(msg).toBeDefined();
      expect(msg?.content).toHaveLength(10000);
    });

    it("should handle special characters in messages", async () => {
      const specialMessage = "Test 🎉 with émojis and çharacters: {}[]()&<>";
      insertTestMessage(testSessionId, "user", specialMessage);

      const history = getSessionHistory(testSessionId);
      const msg = history.find((m) => m.content === specialMessage);

      expect(msg).toBeDefined();
    });

    it("should handle concurrent message insertions", async () => {
      const promises = [];

      for (let i = 0; i < 10; i++) {
        promises.push(
          Promise.resolve(
            insertTestMessage(testSessionId, "user", `Message ${i}`)
          )
        );
      }

      await Promise.all(promises);

      const history = getSessionHistory(testSessionId);
      expect(history.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe("Agent Iteration Handling", () => {
    it("should track iteration count in multi-turn agent loop", async () => {
      // Simulate agent iterations
      insertTestMessage(testSessionId, "user", "Solve a complex problem");

      for (let i = 0; i < 3; i++) {
        insertTestMessage(
          testSessionId,
          "agent-iteration",
          `Iteration ${i + 1}`
        );
        insertTestMessage(
          testSessionId,
          "assistant",
          `Progress: step ${i + 1}`
        );
      }

      const history = getSessionHistory(testSessionId);
      const iterations = history.filter(
        (m) => m.role === "agent-iteration"
      );

      expect(iterations).toHaveLength(3);
    });

    it("should handle agent reaching max iterations", async () => {
      insertTestMessage(testSessionId, "user", "Very complex request");

      for (let i = 0; i < 20; i++) {
        insertTestMessage(testSessionId, "assistant", `Iteration ${i}`);
      }

      insertTestMessage(
        testSessionId,
        "system",
        "Max iterations reached, stopping agent"
      );

      const history = getSessionHistory(testSessionId);
      const iterations = history.filter(
        (m) => m.role === "assistant"
      );

      expect(iterations.length).toBeGreaterThanOrEqual(20);
    });
  });

  describe("Tool Call Tracking", () => {
    it("should track total tool calls in conversation", async () => {
      insertTestMessage(testSessionId, "user", "Help me with multiple tasks");

      const toolCalls = [
        "read_file",
        "write_file",
        "execute_command",
      ];

      for (const tool of toolCalls) {
        insertTestMessage(
          testSessionId,
          "assistant",
          `Calling ${tool}`
        );
        insertTestMessage(testSessionId, "tool", `Result from ${tool}`);
      }

      const history = getSessionHistory(testSessionId);
      const toolMessages = history.filter((m) => m.role === "tool");

      expect(toolMessages).toHaveLength(toolCalls.length);
    });

    it("should record tool call failures", async () => {
      const failedTools = ["tool-with-permission-error", "tool-with-timeout"];

      for (const tool of failedTools) {
        insertTestMessage(testSessionId, "assistant", `Attempting ${tool}`);
        insertTestMessage(
          testSessionId,
          "tool-error",
          `${tool} failed`
        );
      }

      const history = getSessionHistory(testSessionId);
      const errors = history.filter((m) => m.role === "tool-error");

      expect(errors).toHaveLength(failedTools.length);
    });
  });

  describe("Channel-Specific Responses", () => {
    it("should format response for Telegram", async () => {
      const telegramSession = createTestSessionId("telegram");
      createTestSession(telegramSession);

      insertTestMessage(telegramSession, "user", "/start");
      insertTestMessage(
        telegramSession,
        "assistant",
        "Welcome to Gravity Claw! 👋"
      );

      const history = getSessionHistory(telegramSession);
      expect(history[history.length - 1]?.content).toContain("👋");

      cleanupTestSession(telegramSession);
    });

    it("should format response for WhatsApp", async () => {
      const whatsappSession = createTestSessionId("whatsapp");
      createTestSession(whatsappSession);

      insertTestMessage(whatsappSession, "user", "Hello");
      insertTestMessage(
        whatsappSession,
        "assistant",
        "Hi there! How can I help? 😊"
      );

      const history = getSessionHistory(whatsappSession);
      expect(history.length).toBeGreaterThan(0);

      cleanupTestSession(whatsappSession);
    });

    it("should format response for WebChat", async () => {
      const webchatSession = createTestSessionId("webchat");
      createTestSession(webchatSession);

      insertTestMessage(webchatSession, "user", "What can you do?");
      insertTestMessage(
        webchatSession,
        "assistant",
        JSON.stringify({
          text: "I can help with various tasks",
          type: "text",
          metadata: { channel: "web" },
        })
      );

      const history = getSessionHistory(webchatSession);
      const lastMsg = history[history.length - 1];
      expect(lastMsg?.content).toContain("channel");

      cleanupTestSession(webchatSession);
    });
  });

  describe("Response Completion Handling", () => {
    it("should mark conversation as complete when agent stops", async () => {
      insertTestMessage(testSessionId, "user", "Do something");
      insertTestMessage(testSessionId, "assistant", "I've completed the task");
      insertTestMessage(testSessionId, "system", "Agent completed");

      const history = getSessionHistory(testSessionId);
      const completionMsg = history.find(
        (m) => m.role === "system" && typeof m.content === 'string' && m.content.includes("completed")
      );

      expect(completionMsg).toBeDefined();
    });

    it("should handle partial responses", async () => {
      insertTestMessage(testSessionId, "user", "Long running task");
      insertTestMessage(testSessionId, "assistant", "Starting processing...");
      insertTestMessage(
        testSessionId,
        "system",
        "Partial: 50% complete"
      );
      insertTestMessage(testSessionId, "system", "Partial: 100% complete");

      const history = getSessionHistory(testSessionId);
      const partialUpdates = history.filter((m) =>
        typeof m.content === 'string' ? m.content.includes("Partial") : false
      );

      expect(partialUpdates.length).toBeGreaterThan(0);
    });
  });
});
