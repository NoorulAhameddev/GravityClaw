/**
 * Session Management Integration Tests
 * Tests session creation, settings persistence, and multi-session isolation
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createLogger } from "../../logger.ts";
import {
  createTestSessionId,
  createTestSession,
  cleanupTestSession,
  updateSessionSettingsInDb,
  getSessionSettingsFromDb,
  insertTestMessage,
  getSessionHistory,
  mockSessionSettings,
} from "./test-utils.ts";
import { db } from "../../db.ts";
import type { SessionSettings } from "../../session.ts";

const log = createLogger("session-management-test");

describe("Session Management Integration Tests", () => {
  let testSessionId: string;

  beforeEach(() => {
    testSessionId = createTestSessionId("session");
    createTestSession(testSessionId);
  });

  afterEach(() => {
    cleanupTestSession(testSessionId);
  });

  describe("Session Creation", () => {
    it("should create session with default settings", async () => {
      const sessionId = createTestSessionId("create-test");
      createTestSession(sessionId);

      const sessionExists = db
        .prepare(`SELECT COUNT(*) as count FROM sessions WHERE id = ?`)
        .get(sessionId) as { count: number };

      expect(sessionExists.count).toBe(1);

      cleanupTestSession(sessionId);
    });

    it("should create session with custom settings", async () => {
      const customSettings: SessionSettings = {
        provider: "anthropic",
        model: "claude-3-opus",
        temperature: 0.5,
        maxTokens: 2000,
      };

      const sessionId = createTestSessionId("custom-settings");
      createTestSession(sessionId, customSettings);

      const settings = getSessionSettingsFromDb(sessionId);

      expect(settings?.provider).toBe("anthropic");
      expect(settings?.model).toBe("claude-3-opus");
      expect(settings?.temperature).toBe(0.5);
      expect(settings?.maxTokens).toBe(2000);

      cleanupTestSession(sessionId);
    });

    it("should initialize session message_allow_messages flag", async () => {
      const sessionId = createTestSessionId("init-allow");
      createTestSession(sessionId);

      const sessionRecord = db
        .prepare(`SELECT allow_messages FROM sessions WHERE id = ?`)
        .get(sessionId) as { allow_messages: number } | undefined;

      expect(sessionRecord?.allow_messages).toBeDefined();
      expect(sessionRecord?.allow_messages).toBe(0);

      cleanupTestSession(sessionId);
    });

    it("should create unique session IDs", async () => {
      const session1 = createTestSessionId("unique");
      const session2 = createTestSessionId("unique");

      createTestSession(session1);
      createTestSession(session2);

      expect(session1).not.toBe(session2);

      cleanupTestSession(session1);
      cleanupTestSession(session2);
    });
  });

  describe("Session Settings Persistence", () => {
    it("should persist settings to database", async () => {
      const settings: SessionSettings = {
        provider: "openai",
        model: "gpt-4-turbo",
        temperature: 0.7,
      };

      updateSessionSettingsInDb(testSessionId, settings);

      const retrieved = getSessionSettingsFromDb(testSessionId);

      expect(retrieved?.provider).toBe("openai");
      expect(retrieved?.model).toBe("gpt-4-turbo");
      expect(retrieved?.temperature).toBe(0.7);
    });

    it("should update settings without losing other properties", async () => {
      const initialSettings: SessionSettings = {
        provider: "openai",
        model: "gpt-4",
        temperature: 0.7,
        maxTokens: 4000,
      };

      createTestSession(testSessionId, initialSettings);

      // Update only one property
      updateSessionSettingsInDb(testSessionId, { temperature: 0.9 });

      const retrieved = getSessionSettingsFromDb(testSessionId);

      expect(retrieved?.temperature).toBe(0.9);
      expect(retrieved?.provider).toBe("openai");
      expect(retrieved?.maxTokens).toBe(4000);
    });

    it("should handle complex settings objects", async () => {
      const complexSettings: SessionSettings = {
        provider: "openrouter",
        model: "meta-llama/llama-3-70b",
        thinkingLevel: "high",
        voiceMode: "full",
        ttsProvider: "elevenlabs",
        heartbeatEnabled: true,
        heartbeatInterval: 45,
        recommendationsEnabled: true,
        customSystemPrompt: "You are a custom assistant",
        temperature: 0.8,
        maxTokens: 8000,
      };

      updateSessionSettingsInDb(testSessionId, complexSettings);
      const retrieved = getSessionSettingsFromDb(testSessionId);

      expect(retrieved?.voiceMode).toBe("full");
      expect(retrieved?.ttsProvider).toBe("elevenlabs");
      expect(retrieved?.heartbeatInterval).toBe(45);
      expect(retrieved?.customSystemPrompt).toBe("You are a custom assistant");
    });

    it("should handle null and undefined settings gracefully", async () => {
      updateSessionSettingsInDb(testSessionId, {
        provider: "openai",
        temperature: undefined as any,
      });

      const retrieved = getSessionSettingsFromDb(testSessionId);
      expect(retrieved?.provider).toBe("openai");
    });
  });

  describe("Session State Management", () => {
    it("should maintain conversation history in session", async () => {
      const messages = [
        { role: "user" as const, content: "Hello" },
        { role: "assistant" as const, content: "Hi there" },
        { role: "user" as const, content: "How are you?" },
        { role: "assistant" as const, content: "I'm doing great" },
      ];

      messages.forEach((msg) => {
        insertTestMessage(testSessionId, msg.role, msg.content);
      });

      const history = getSessionHistory(testSessionId);

      expect(history.length).toBeGreaterThanOrEqual(messages.length);
    });

    it("should preserve session state across updates", async () => {
      // Insert initial messages
      insertTestMessage(testSessionId, "user", "First message");
      insertTestMessage(testSessionId, "assistant", "First response");

      // Update settings
      updateSessionSettingsInDb(testSessionId, { provider: "anthropic" });

      // Insert more messages
      insertTestMessage(testSessionId, "user", "Second message");
      insertTestMessage(testSessionId, "assistant", "Second response");

      const history = getSessionHistory(testSessionId);
      const settings = getSessionSettingsFromDb(testSessionId);

      expect(history.length).toBeGreaterThanOrEqual(4);
      expect(settings?.provider).toBe("anthropic");
    });

    it("should track session timestamps", async () => {
      const sessionRecord = db
        .prepare(
          `SELECT created_at, updated_at FROM sessions WHERE id = ? LIMIT 1`
        )
        .get(testSessionId) as
        | { created_at: string; updated_at: string }
        | undefined;

      expect(sessionRecord?.created_at).toBeDefined();
      expect(sessionRecord?.updated_at).toBeDefined();
    });
  });

  describe("Session Timeout and Expiration", () => {
    it("should not automatically expire active sessions", async () => {
      insertTestMessage(testSessionId, "user", "Active message");

      const sessionRecord = db
        .prepare(`SELECT id FROM sessions WHERE id = ?`)
        .get(testSessionId) as { id: string } | undefined;

      expect(sessionRecord?.id).toBe(testSessionId);
    });

    it("should allow manual session cleanup", async () => {
      insertTestMessage(testSessionId, "user", "Test");

      const countBefore = db
        .prepare(
          `SELECT COUNT(*) as count FROM memory WHERE session_id = ?`
        )
        .get(testSessionId) as { count: number };
      expect(countBefore.count).toBeGreaterThan(0);

      cleanupTestSession(testSessionId);

      const countAfter = db
        .prepare(
          `SELECT COUNT(*) as count FROM memory WHERE session_id = ?`
        )
        .get(testSessionId) as { count: number };
      expect(countAfter.count).toBe(0);
    });

    it("should handle session recreation", async () => {
      let sessionId = createTestSessionId("recreate");

      // Create and populate
      createTestSession(sessionId);
      insertTestMessage(sessionId, "user", "Message 1");

      // Cleanup
      cleanupTestSession(sessionId);

      // Recreate with same pattern (different timestamp)
      sessionId = createTestSessionId("recreate");
      createTestSession(sessionId);
      insertTestMessage(sessionId, "user", "Message 2");

      const history = getSessionHistory(sessionId);
      expect(history.length).toBeGreaterThan(0);

      cleanupTestSession(sessionId);
    });
  });

  describe("Multi-Session Isolation", () => {
    it("should isolate settings between sessions", async () => {
      const session2Id = createTestSessionId("isolation");
      createTestSession(session2Id);

      updateSessionSettingsInDb(testSessionId, { provider: "openai" });
      updateSessionSettingsInDb(session2Id, { provider: "anthropic" });

      const settings1 = getSessionSettingsFromDb(testSessionId);
      const settings2 = getSessionSettingsFromDb(session2Id);

      expect(settings1?.provider).toBe("openai");
      expect(settings2?.provider).toBe("anthropic");

      cleanupTestSession(session2Id);
    });

    it("should isolate conversation history between sessions", async () => {
      const session2Id = createTestSessionId("history-isolation");
      createTestSession(session2Id);

      insertTestMessage(testSessionId, "user", "Session 1 message");
      insertTestMessage(session2Id, "user", "Session 2 message");

      const history1 = getSessionHistory(testSessionId);
      const history2 = getSessionHistory(session2Id);

      const session1Content = history1.map((m) => m.content).join(" ");
      const session2Content = history2.map((m) => m.content).join(" ");

      expect(session1Content).toContain("Session 1");
      expect(session2Content).toContain("Session 2");
      expect(session1Content).not.toContain("Session 2");
      expect(session2Content).not.toContain("Session 1");

      cleanupTestSession(session2Id);
    });

    it("should prevent cross-session data leakage", async () => {
      const sessions = [
        createTestSessionId("leak"),
        createTestSessionId("leak"),
        createTestSessionId("leak"),
      ];

      sessions.forEach((sessionId, idx) => {
        createTestSession(sessionId);
        insertTestMessage(sessionId, "user", `Secret ${idx}`);
      });

      // Check isolation
      sessions.forEach((sessionId, idx) => {
        const history = getSessionHistory(sessionId);
        const content = history.map((m) => m.content).join(" ");

        expect(content).toContain(`Secret ${idx}`);
        // Should not contain secrets from other sessions
        sessions.forEach((_, otherIdx) => {
          if (otherIdx !== idx) {
            expect(content).not.toContain(`Secret ${otherIdx}`);
          }
        });
      });

      sessions.forEach((id) => cleanupTestSession(id));
    });
  });

  describe("Session Provider and Model Overrides", () => {
    it("should support per-session provider override", async () => {
      updateSessionSettingsInDb(testSessionId, { provider: "groq" });
      const settings = getSessionSettingsFromDb(testSessionId);

      expect(settings?.provider).toBe("groq");
    });

    it("should support per-session model override", async () => {
      updateSessionSettingsInDb(testSessionId, { model: "mixtral-8x7b" });
      const settings = getSessionSettingsFromDb(testSessionId);

      expect(settings?.model).toBe("mixtral-8x7b");
    });

    it("should apply both provider and model overrides together", async () => {
      updateSessionSettingsInDb(testSessionId, {
        provider: "groq",
        model: "llama2-70b",
      });

      const settings = getSessionSettingsFromDb(testSessionId);

      expect(settings?.provider).toBe("groq");
      expect(settings?.model).toBe("llama2-70b");
    });
  });

  describe("Session Thinking and Voice Settings", () => {
    it("should persist thinking level setting", async () => {
      const thinkingLevels: Array<SessionSettings["thinkingLevel"]> = [
        "off",
        "low",
        "medium",
        "high",
      ];

      for (const level of thinkingLevels) {
        const sessionId = createTestSessionId("thinking");
        createTestSession(sessionId);
        updateSessionSettingsInDb(sessionId, { thinkingLevel: level || "off" });

        const settings = getSessionSettingsFromDb(sessionId);
        expect(settings?.thinkingLevel).toBe(level);

        cleanupTestSession(sessionId);
      }
    });

    it("should persist voice mode setting", async () => {
      const voiceModes: Array<SessionSettings["voiceMode"]> = [
        "off",
        "transcribe",
        "full",
      ];

      for (const mode of voiceModes) {
        const sessionId = createTestSessionId("voice");
        createTestSession(sessionId);
        updateSessionSettingsInDb(sessionId, { voiceMode: mode || "off" });

        const settings = getSessionSettingsFromDb(sessionId);
        expect(settings?.voiceMode).toBe(mode);

        cleanupTestSession(sessionId);
      }
    });

    it("should persist TTS provider setting", async () => {
      const ttsProviders: Array<SessionSettings["ttsProvider"]> = ["openai", "elevenlabs"];

      for (const provider of ttsProviders) {
        const sessionId = createTestSessionId("tts");
        createTestSession(sessionId);
        updateSessionSettingsInDb(sessionId, { ttsProvider: provider || "openai" });

        const settings = getSessionSettingsFromDb(sessionId);
        expect(settings?.ttsProvider).toBe(provider);

        cleanupTestSession(sessionId);
      }
    });
  });

  describe("Session Recommendations and Heartbeat", () => {
    it("should persist recommendation settings", async () => {
      updateSessionSettingsInDb(testSessionId, {
        recommendationsEnabled: true,
        recommendationsLastSentDate: "2024-01-15",
      });

      const settings = getSessionSettingsFromDb(testSessionId);

      expect(settings?.recommendationsEnabled).toBe(true);
      expect(settings?.recommendationsLastSentDate).toBe("2024-01-15");
    });

    it("should persist heartbeat settings", async () => {
      updateSessionSettingsInDb(testSessionId, {
        heartbeatEnabled: true,
        heartbeatInterval: 60,
      });

      const settings = getSessionSettingsFromDb(testSessionId);

      expect(settings?.heartbeatEnabled).toBe(true);
      expect(settings?.heartbeatInterval).toBe(60);
    });

    it("should disable recommendations feature", async () => {
      updateSessionSettingsInDb(testSessionId, {
        recommendationsEnabled: false,
      });

      const settings = getSessionSettingsFromDb(testSessionId);
      expect(settings?.recommendationsEnabled).toBe(false);
    });
  });

  describe("Session Performance", () => {
    it("should efficiently retrieve session settings", async () => {
      updateSessionSettingsInDb(testSessionId, mockSessionSettings);

      const startTime = performance.now();
      const settings = getSessionSettingsFromDb(testSessionId);
      const duration = performance.now() - startTime;

      expect(settings).toBeDefined();
      expect(duration).toBeLessThan(50);
    });

    it("should efficiently update session settings", async () => {
      const updates = [
        { provider: "openai" },
        { model: "gpt-4" },
        { temperature: 0.7 },
        { maxTokens: 4000 },
      ];

      const startTime = performance.now();

      updates.forEach((update) => {
        updateSessionSettingsInDb(testSessionId, update);
      });

      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(200);
    });

    it("should handle many concurrent session operations", async () => {
      const sessionIds = Array.from({ length: 10 }, () =>
        createTestSessionId("perf")
      );

      sessionIds.forEach((id) => createTestSession(id));

      const startTime = performance.now();

      sessionIds.forEach((id) => {
        updateSessionSettingsInDb(id, { provider: "openai" });
        getSessionSettingsFromDb(id);
      });

      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(1000);

      sessionIds.forEach((id) => cleanupTestSession(id));
    });
  });

  describe("Session Data Consistency", () => {
    it("should maintain consistency after multiple updates", async () => {
      const updates: Partial<SessionSettings>[] = [
        { provider: "openai", model: "gpt-4" },
        { temperature: 0.5, maxTokens: 2000 },
        { voiceMode: "full", ttsProvider: "elevenlabs" },
        { heartbeatEnabled: true, heartbeatInterval: 30 },
      ];

      updates.forEach((update) => {
        updateSessionSettingsInDb(testSessionId, update);
      });

      const final = getSessionSettingsFromDb(testSessionId);

      expect(final?.provider).toBe("openai");
      expect(final?.model).toBe("gpt-4");
      expect(final?.temperature).toBe(0.5);
      expect(final?.voiceMode).toBe("full");
    });

    it("should handle rapid sequential operations", async () => {
      for (let i = 0; i < 20; i++) {
        updateSessionSettingsInDb(testSessionId, { temperature: i * 0.1 });
      }

      const final = getSessionSettingsFromDb(testSessionId);
      expect(final?.temperature).toBeCloseTo(1.9, 1);
    });
  });
});
