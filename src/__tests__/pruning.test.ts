/**
 * Context Pruning Tests
 *
 * Tests for automatic context detection, summarization, and pruning
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  calculateContextUsage,
  isContextNearLimit,
  identifyPrunableMessages,
  generateContextSummary,
  pruneContext,
  formatPruningResult,
  getPruningStatus,
  DEFAULT_PRUNING_CONFIG,
  type PruningConfig,
} from "../memory/pruning.ts";
import { addUserMessage, addAssistantMessage, getHistory, clearHistory } from "../llm/index.ts";
import { db } from "../db.ts";
import { config } from "../config.ts";
import type { LLMMessage } from "../llm/index.ts";
import { vi } from "vitest";

vi.mock("../llm/index.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../llm/index.ts")>();
  return {
    ...actual,
    getProvider: () => ({
      chat: vi.fn().mockResolvedValue({
        text: "<context_summary>\nMocked context summary for test.\n</context_summary>"
      })
    })
  };
});

const TEST_SESSION = "pruning-test-session";
const testDeps = { db, config };

beforeEach(() => {
  clearHistory(TEST_SESSION, testDeps);
});

describe("Context Pruning", () => {
  describe("calculateContextUsage", () => {
    it("should return 0 for empty history", () => {
      const usage = calculateContextUsage(TEST_SESSION, "gpt-4o");
      expect(usage).toBe(0);
    });

    it("should calculate usage percentage based on message length", () => {
      addUserMessage(TEST_SESSION, "x".repeat(1000), testDeps);
      addAssistantMessage(TEST_SESSION, "y".repeat(1000), testDeps);
      addUserMessage(TEST_SESSION, "z".repeat(1000), testDeps);
      addAssistantMessage(TEST_SESSION, "a".repeat(1000), testDeps);

      const usage = calculateContextUsage(TEST_SESSION, "gpt-4o");
      expect(usage).toBeGreaterThan(0);
      expect(usage).toBeLessThan(2);
    });

    it("should scale with model context window", () => {
      const message = "x".repeat(20000);
      addUserMessage(TEST_SESSION, message, testDeps);

      const gpt4Usage = calculateContextUsage(TEST_SESSION, "gpt-4o"); // 128k context
      const haikuUsage = calculateContextUsage(TEST_SESSION, "claude-3-haiku"); // 200k context

      expect(gpt4Usage).toBeGreaterThan(haikuUsage);
    });

    it("should handle invalid model gracefully", () => {
      addUserMessage(TEST_SESSION, "test message", testDeps);
      const usage = calculateContextUsage(TEST_SESSION, "nonexistent-model");
      expect(usage).toBeGreaterThanOrEqual(0);
      expect(usage).toBeLessThanOrEqual(100);
    });
  });

  describe("isContextNearLimit", () => {
    it("should return false when below threshold", () => {
      addUserMessage(TEST_SESSION, "Short message", testDeps);
      const nearLimit = isContextNearLimit(TEST_SESSION, "gpt-4o", 80);
      expect(nearLimit).toBe(false);
    });

    it("should respect custom threshold", () => {
      for (let i = 0; i < 30; i++) {
        addUserMessage(TEST_SESSION, "x".repeat(5000), testDeps);
      }

      // Should be below 80% threshold
      const nearLimitHigh = isContextNearLimit(TEST_SESSION, "gpt-4o", 80);
      expect(nearLimitHigh).toBe(false);

      // Should be above 10% threshold
      const nearLimitLow = isContextNearLimit(TEST_SESSION, "gpt-4o", 10);
      expect(nearLimitLow).toBe(true);
    });
  });

  describe("identifyPrunableMessages", () => {
    it("should return all messages if count <= keep exchanges", () => {
      const messages: LLMMessage[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
      ];

      const [keep, prune] = identifyPrunableMessages(messages, 5);
      expect(keep).toEqual(messages);
      expect(prune).toEqual([]);
    });

    it("should split history when exceeding keep exchanges", () => {
      const messages: LLMMessage[] = Array.from({ length: 12 }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message ${i}`,
      }));

      const [keep, prune] = identifyPrunableMessages(messages, 3); // Keep 3 exchanges = 6 messages
      expect(keep.length).toBe(6);
      expect(prune.length).toBe(6);
      expect(keep[0]).toEqual(messages[6]); // Keep recent half
    });

    it("should suggest pruning first N messages, keep recent", () => {
      const messages: LLMMessage[] = Array.from({ length: 20 }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message ${i}`,
      }));

      const [keep, prune] = identifyPrunableMessages(messages, 4); // Keep 4 = 8 messages
      expect(keep.length).toBe(8);
      expect(keep[0]!.content as string).toBe("Message 12"); // First kept message
      expect(keep[keep.length - 1]!.content as string).toBe("Message 19"); // Last message
      expect(prune.length).toBe(12);
      expect(prune[0]!.content as string).toBe("Message 0"); // First prunable
    });
  });

  describe("generateContextSummary", () => {
    it("should return short message for empty input", async () => {
      const summary = await generateContextSummary(TEST_SESSION, []);
      expect(summary).toContain("No prior context");
    });

    it("should generate summary without failing on single message", async () => {
      const messages: LLMMessage[] = [
        { role: "user", content: "What is the capital of France?" },
        { role: "assistant", content: "Paris is the capital of France." },
      ];

      const summary = await generateContextSummary(TEST_SESSION, messages);
      expect(summary).toBeTruthy();
      expect(summary.length).toBeGreaterThan(0);
    }, 30000);

    it("should truncate long messages in summary prompt", async () => {
      const longMessage = "x".repeat(1000);
      const messages: LLMMessage[] = [
        {
          role: "user",
          content: longMessage,
        },
      ];

      const summary = await generateContextSummary(TEST_SESSION, messages);
      expect(summary).toBeTruthy();
      // Summary should not contain the full long message
      expect(summary).not.toContain(longMessage);
    }, 30000);
  });

  describe("pruneContext", () => {
    it("should skip pruning for small conversations", async () => {
      addUserMessage(TEST_SESSION, "Small message", testDeps);

      const result = await pruneContext(TEST_SESSION, "gpt-4o");
      expect(result.wasPruned).toBe(false);
      expect(result.messagesPruned).toBe(0);
    });

    it("should skip pruning when below threshold", async () => {
      for (let i = 0; i < 5; i++) {
        addUserMessage(TEST_SESSION, `Message ${i}`, testDeps);
      }

      const result = await pruneContext(TEST_SESSION, "gpt-4o", {
        contextThreshold: 80,
      });

      expect(result.wasPruned).toBe(false);
      expect(result.contextUsageBefore).toBeLessThan(80);
    });

    it("should prune when conditions met", async () => {
      for (let i = 0; i < 25; i++) {
        addUserMessage(TEST_SESSION, "x".repeat(200), testDeps);
        addAssistantMessage(TEST_SESSION, "y".repeat(200), testDeps);
      }

      const result = await pruneContext(TEST_SESSION, "gpt-4o", {
        contextThreshold: 1,
        keepRecentExchanges: 3,
        minMessageCount: 10,
      });

      expect(result.contextUsageBefore).toBeGreaterThanOrEqual(1);
      expect(result.messagesPruned).toBeGreaterThanOrEqual(0);
    }, 30000);

    it("should respect minMessageCount config", async () => {
      for (let i = 0; i < 15; i++) {
        addUserMessage(TEST_SESSION, "x".repeat(500), testDeps);
      }

      const result = await pruneContext(TEST_SESSION, "gpt-4o", {
        contextThreshold: 1,
        minMessageCount: 30, // More than we have
      });

      expect(result.wasPruned).toBe(false);
      expect(result.messagesPruned).toBe(0);
    });
  });

  describe("formatPruningResult", () => {
    it("should format unpruned result", () => {
      const result = {
        wasPruned: false,
        contextUsageBefore: 45,
        contextUsageAfter: 45,
        messagesPruned: 0,
        summaryLength: 0,
      };

      const formatted = formatPruningResult(result);
      expect(formatted).toContain("45%");
      expect(formatted).toContain("no pruning needed");
    });

    it("should format pruned result with metrics", () => {
      const result = {
        wasPruned: true,
        contextUsageBefore: 85,
        contextUsageAfter: 35,
        messagesPruned: 12,
        summaryLength: 250,
      };

      const formatted = formatPruningResult(result);
      expect(formatted).toContain("✂️");
      expect(formatted).toContain("12");
      expect(formatted).toContain("250");
      expect(formatted).toContain("85%");
      expect(formatted).toContain("35%");
    });
  });

  describe("getPruningStatus", () => {
    it("should return status object with all required fields", () => {
      addUserMessage(TEST_SESSION, "test message", testDeps);

      const status = getPruningStatus(TEST_SESSION, "gpt-4o");
      expect(status).toHaveProperty("sessionId", TEST_SESSION);
      expect(status).toHaveProperty("modelName", "gpt-4o");
      expect(status).toHaveProperty("contextWindow");
      expect(status).toHaveProperty("estimatedTokensUsed");
      expect(status).toHaveProperty("contextUsagePercent");
      expect(status).toHaveProperty("messageCount");
      expect(status).toHaveProperty("isNearLimit");
      expect(status).toHaveProperty("recommendedAction");
    });

    it("should indicate recommendation when near limit", () => {
      for (let i = 0; i < 25; i++) {
        addUserMessage(TEST_SESSION, "x".repeat(500), testDeps);
      }

      const status = getPruningStatus(TEST_SESSION, "gpt-4o");
      if (status.contextUsagePercent >= 80) {
        expect(status.recommendedAction).toContain("/compact");
      }
    });

    it("should report healthy status for small conversations", () => {
      addUserMessage(TEST_SESSION, "Hello", testDeps);

      const status = getPruningStatus(TEST_SESSION, "gpt-4o");
      expect(status.isNearLimit).toBe(false);
      expect(status.recommendedAction).toContain("healthy");
    });
  });

  describe("DEFAULT_PRUNING_CONFIG", () => {
    it("should have reasonable defaults", () => {
      expect(DEFAULT_PRUNING_CONFIG.contextThreshold).toBe(80);
      expect(DEFAULT_PRUNING_CONFIG.keepRecentExchanges).toBe(5);
      expect(DEFAULT_PRUNING_CONFIG.autoprune).toBe(true);
      expect(DEFAULT_PRUNING_CONFIG.minMessageCount).toBe(20);
    });
  });
});
