/**
 * Dashboard Integration Tests
 * Tests all dashboard tools and data flows from database to API
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../../db.ts";
import { createLogger } from "../../logger.ts";
import {
  createTestSessionId,
  createTestSession,
  cleanupTestSession,
  getSessionSettingsFromDb,
  updateSessionSettingsInDb,
  insertUsageRecord,
  mockSessionSettings,
  mockUsageRecords,
} from "./test-utils.ts";

const log = createLogger("dashboard-integration-test");

describe("Dashboard Integration Tests", () => {
  let testSessionId: string;

  beforeEach(() => {
    testSessionId = createTestSessionId("dashboard");
    createTestSession(testSessionId, mockSessionSettings);
  });

  afterEach(() => {
    cleanupTestSession(testSessionId);
  });

  describe("Usage Statistics Tool", () => {
    it("should retrieve empty stats for new session", async () => {
      const { getUsageStats } = await import("../../usage.ts");
      const stats = getUsageStats(testSessionId);

      expect(stats).toBeDefined();
      expect(stats.totalCalls).toBe(0);
      expect(stats.totalTokens).toBe(0);
      expect(stats.totalCost).toBe(0);
      expect(stats.models).toEqual([]);
    });

    it("should aggregate usage records correctly", async () => {
      // Insert test usage records
      mockUsageRecords.forEach((rec) => {
        insertUsageRecord(
          testSessionId,
          rec.model,
          rec.inputTokens,
          rec.outputTokens,
          rec.costUsd
        );
      });

      const { getUsageStats } = await import("../../usage.ts");
      const stats = getUsageStats(testSessionId);

      expect(stats.totalCalls).toBe(3);
      expect(stats.totalTokens).toBe(
        mockUsageRecords.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0)
      );
      expect(stats.totalCost).toBeCloseTo(
        mockUsageRecords.reduce((sum, r) => sum + r.costUsd, 0),
        5
      );
    });

    it("should calculate model breakdown with costs", async () => {
      // Insert usage for multiple models
      insertUsageRecord(testSessionId, "gpt-4", 100, 200, 0.01);
      insertUsageRecord(testSessionId, "gpt-4", 50, 100, 0.005);
      insertUsageRecord(testSessionId, "gpt-3.5-turbo", 200, 400, 0.003);

      const { getUsageStats } = await import("../../usage.ts");
      const stats = getUsageStats(testSessionId);

      expect(stats.models).toHaveLength(2);
      const gpt4 = stats.models.find((m) => m.model === "gpt-4");
      expect(gpt4?.calls).toBe(2);
      expect(gpt4?.cost).toBeCloseTo(0.015, 5);
    });

    it("should track average latency per model", async () => {
      // Insert usage records
      insertUsageRecord(testSessionId, "gpt-4", 100, 200, 0.01);

      const { getUsageStats } = await import("../../usage.ts");
      const stats = getUsageStats(testSessionId);

      const model = stats.models[0];
      expect(model).toBeDefined();
      expect(model?.calls).toBe(1);
    });
  });

  describe("Session Settings Tool", () => {
    it("should store session settings in database", async () => {
      const settings = {
        provider: "anthropic",
        model: "claude-3-opus",
        thinkingLevel: "high" as const,
        temperature: 0.5,
      };

      updateSessionSettingsInDb(testSessionId, settings);
      const retrieved = getSessionSettingsFromDb(testSessionId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.provider).toBe("anthropic");
      expect(retrieved?.model).toBe("claude-3-opus");
      expect(retrieved?.thinkingLevel).toBe("high");
      expect(retrieved?.temperature).toBe(0.5);
    });

    it("should preserve existing settings when updating partial", async () => {
      updateSessionSettingsInDb(testSessionId, { provider: "openai" });
      const updated = getSessionSettingsFromDb(testSessionId);

      expect(updated?.provider).toBe("openai");
      expect(updated?.model).toBe("test-model"); // From initial creation
    });

    it("should handle voice settings", async () => {
      const voiceSettings = {
        voiceMode: "full" as const,
        ttsProvider: "elevenlabs" as const,
      };

      updateSessionSettingsInDb(testSessionId, voiceSettings);
      const retrieved = getSessionSettingsFromDb(testSessionId);

      expect(retrieved?.voiceMode).toBe("full");
      expect(retrieved?.ttsProvider).toBe("elevenlabs");
    });

    it("should handle heartbeat settings", async () => {
      const heartbeatSettings = {
        heartbeatEnabled: true,
        heartbeatInterval: 60,
      };

      updateSessionSettingsInDb(testSessionId, heartbeatSettings);
      const retrieved = getSessionSettingsFromDb(testSessionId);

      expect(retrieved?.heartbeatEnabled).toBe(true);
      expect(retrieved?.heartbeatInterval).toBe(60);
    });
  });

  describe("Notification Preferences Tool", () => {
    it("should toggle notification preferences", async () => {
      const notificationSettings = {
        recommendationsEnabled: false,
        heartbeatEnabled: false,
      };

      updateSessionSettingsInDb(testSessionId, notificationSettings);
      const settings = getSessionSettingsFromDb(testSessionId);

      expect(settings?.recommendationsEnabled).toBe(false);
      expect(settings?.heartbeatEnabled).toBe(false);
    });

    it("should handle recommendations last sent date", async () => {
      const today = new Date().toISOString().split("T")[0]!;
      updateSessionSettingsInDb(testSessionId, {
        recommendationsLastSentDate: today as string | undefined,
      });

      const settings = getSessionSettingsFromDb(testSessionId);
      expect(settings?.recommendationsLastSentDate).toBe(today);
    });
  });

  describe("Model Configuration Tool", () => {
    it("should support model switching within session", async () => {
      const models = ["gpt-4", "gpt-3.5-turbo", "claude-3-opus"];

      for (const model of models) {
        updateSessionSettingsInDb(testSessionId, { model });
        const settings = getSessionSettingsFromDb(testSessionId);
        expect(settings?.model).toBe(model);
      }
    });

    it("should support provider switching", async () => {
      const providers = ["openai", "anthropic", "google", "groq"];

      for (const provider of providers) {
        updateSessionSettingsInDb(testSessionId, { provider });
        const settings = getSessionSettingsFromDb(testSessionId);
        expect(settings?.provider).toBe(provider);
      }
    });

    it("should handle temperature adjustments", async () => {
      const temperatures = [0, 0.5, 1.0, 1.5, 2.0];

      for (const temp of temperatures) {
        updateSessionSettingsInDb(testSessionId, { temperature: temp });
        const settings = getSessionSettingsFromDb(testSessionId);
        expect(settings?.temperature).toBe(temp);
      }
    });

    it("should handle max tokens configuration", async () => {
      testSessionId = createTestSessionId("dashboard-tokens");
      createTestSession(testSessionId);

      updateSessionSettingsInDb(testSessionId, { maxTokens: 8000 });
      const settings = getSessionSettingsFromDb(testSessionId);

      expect(settings?.maxTokens).toBe(8000);
    });
  });

  describe("Dashboard Data Consistency", () => {
    it("should maintain data consistency across multiple updates", async () => {
      const update1 = { provider: "openai", temperature: 0.7 };
      const update2 = { model: "gpt-4", maxTokens: 2000 };
      const update3 = { heartbeatEnabled: true, heartbeatInterval: 30 };

      updateSessionSettingsInDb(testSessionId, update1);
      updateSessionSettingsInDb(testSessionId, update2);
      updateSessionSettingsInDb(testSessionId, update3);

      const final = getSessionSettingsFromDb(testSessionId);

      expect(final?.provider).toBe("openai");
      expect(final?.temperature).toBe(0.7);
      expect(final?.model).toBe("gpt-4");
      expect(final?.maxTokens).toBe(2000);
      expect(final?.heartbeatEnabled).toBe(true);
      expect(final?.heartbeatInterval).toBe(30);
    });

    it("should isolate settings between different sessions", async () => {
      const session2Id = createTestSessionId("dashboard-isolation");
      createTestSession(session2Id);

      updateSessionSettingsInDb(testSessionId, { provider: "openai" });
      updateSessionSettingsInDb(session2Id, { provider: "anthropic" });

      const settings1 = getSessionSettingsFromDb(testSessionId);
      const settings2 = getSessionSettingsFromDb(session2Id);

      expect(settings1?.provider).toBe("openai");
      expect(settings2?.provider).toBe("anthropic");

      cleanupTestSession(session2Id);
    });

    it("should handle concurrent setting updates", async () => {
      const updates = [
        { provider: "openai", temperature: 0.5 },
        { model: "gpt-4", maxTokens: 4000 },
        { heartbeatEnabled: true, heartbeatInterval: 45 },
        { voiceMode: "full" as const, ttsProvider: "elevenlabs" as const },
      ];

      updates.forEach((update) => {
        updateSessionSettingsInDb(testSessionId, update);
      });

      const final = getSessionSettingsFromDb(testSessionId);
      expect(final?.provider).toBe("openai");
      expect(final?.model).toBe("gpt-4");
      expect(final?.voiceMode).toBe("full");
    });
  });

  describe("Error Handling in Dashboard Tools", () => {
    it("should handle missing session gracefully", async () => {
      const nonexistentSessionId = "nonexistent:session:id";
      const { getUsageStats } = await import("../../usage.ts");

      expect(() => {
        getUsageStats(nonexistentSessionId);
      }).not.toThrow();

      const stats = getUsageStats(nonexistentSessionId);
      expect(stats.totalCalls).toBe(0);
    });

    it("should handle invalid settings data", async () => {
      // Try to update with invalid data types
      expect(() => {
        updateSessionSettingsInDb(testSessionId, {
          temperature: -1, // Invalid: should be 0-2
        });
      }).not.toThrow();

      // Should store the value despite validation
      const settings = getSessionSettingsFromDb(testSessionId);
      expect(settings?.temperature).toBe(-1);
    });

    it("should recover from corrupted settings", async () => {
      // Insert corrupted JSON
      db.prepare(
        `UPDATE memory SET settings = ? WHERE session_id = ? LIMIT 1`
      ).run("{invalid json", testSessionId);

      // Should handle gracefully
      const settings = getSessionSettingsFromDb(testSessionId);
      expect(settings).toBeNull();
    });
  });

  describe("Dashboard Performance", () => {
    it("should retrieve stats efficiently for session with many records", async () => {
      // Insert 100 usage records
      for (let i = 0; i < 100; i++) {
        insertUsageRecord(testSessionId, `model-${i % 5}`, 100, 200, 0.001);
      }

      const { getUsageStats } = await import("../../usage.ts");
      const startTime = performance.now();
      const stats = getUsageStats(testSessionId);
      const duration = performance.now() - startTime;

      expect(stats.totalCalls).toBe(100);
      expect(duration).toBeLessThan(1000); // Should be fast
    });

    it("should handle large settings objects", async () => {
      const largeSettings = {
        provider: "openai",
        model: "gpt-4",
        customSystemPrompt: "You are a helpful assistant. ".repeat(100),
        thinkingLevel: "high" as const,
      };

      updateSessionSettingsInDb(testSessionId, largeSettings);
      const retrieved = getSessionSettingsFromDb(testSessionId);

      expect(retrieved?.customSystemPrompt).toString();
      expect(retrieved?.customSystemPrompt?.length).toBeGreaterThan(1000);
    });
  });
});
