import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../db.ts";
import {
  getSessionSettings,
  setSessionSettings,
  updateSessionSetting,
  getSessionSetting,
  deleteSession,
  listSessions,
  getSessionStats,
  type SessionSettings,
} from "../session.ts";

// Test session IDs
const testSessionId1 = "test-session-1";
const testSessionId2 = "test-session-2";

describe("Session Settings", () => {
  beforeEach(() => {
    // Clean up test sessions before each test
    db.prepare("DELETE FROM memory WHERE session_id IN (?, ?)").run(testSessionId1, testSessionId2);
    db.prepare("DELETE FROM session_settings WHERE session_id IN (?, ?)").run(testSessionId1, testSessionId2);
  });

  afterEach(() => {
    // Clean up test sessions after each test
    db.prepare("DELETE FROM memory WHERE session_id IN (?, ?)").run(testSessionId1, testSessionId2);
    db.prepare("DELETE FROM session_settings WHERE session_id IN (?, ?)").run(testSessionId1, testSessionId2);
  });

  describe("getSessionSettings", () => {
    it("should return empty settings for new session", () => {
      const settings = getSessionSettings(testSessionId1);
      expect(settings).toEqual({});
    });

    it("should return stored settings", () => {
      const testSettings: SessionSettings = {
        provider: "anthropic",
        model: "claude-3-5-sonnet",
      };

      setSessionSettings(testSessionId1, testSettings);

      const settings = getSessionSettings(testSessionId1);
      expect(settings).toMatchObject(testSettings);
    });
  });

  describe("setSessionSettings", () => {
    it("should create initial settings for session", () => {
      const testSettings: SessionSettings = {
        provider: "openai",
        model: "gpt-4",
      };

      setSessionSettings(testSessionId1, testSettings);

      // Verify settings were stored
      const settings = getSessionSettings(testSessionId1);
      expect(settings).toEqual(testSettings);
    });

    it("should update existing settings", () => {
      setSessionSettings(testSessionId1, { provider: "openai" });

      const newSettings: SessionSettings = {
        provider: "anthropic",
        model: "claude-3-5-sonnet",
      };

      setSessionSettings(testSessionId1, newSettings);

      const settings = getSessionSettings(testSessionId1);
      expect(settings).toMatchObject(newSettings);
    });

    it("should update all messages in session", () => {
      // Create multiple messages
      db.prepare("INSERT INTO memory (session_id, message_json, settings) VALUES (?, ?, ?)")
        .run(testSessionId1, JSON.stringify({ role: "user", content: "test1" }), "{}");
      db.prepare("INSERT INTO memory (session_id, message_json, settings) VALUES (?, ?, ?)")
        .run(testSessionId1, JSON.stringify({ role: "assistant", content: "response" }), "{}");

      const newSettings: SessionSettings = { provider: "groq" };
      setSessionSettings(testSessionId1, newSettings);

      const settings = getSessionSettings(testSessionId1);
      expect(settings).toMatchObject(newSettings);
    });
  });

  describe("updateSessionSetting", () => {
    it("should add new setting to empty settings", () => {
      updateSessionSetting(testSessionId1, "provider", "anthropic");
      
      const settings = getSessionSettings(testSessionId1);
      expect(settings.provider).toBe("anthropic");
    });

    it("should update existing setting", () => {
      // Set initial settings
      setSessionSettings(testSessionId1, { provider: "openai", model: "gpt-4" });

      // Update provider
      updateSessionSetting(testSessionId1, "provider", "anthropic");

      const settings = getSessionSettings(testSessionId1);
      expect(settings.provider).toBe("anthropic");
      expect(settings.model).toBe("gpt-4"); // Other settings preserved
    });

    it("should handle nested setting updates", () => {
      updateSessionSetting(testSessionId1, "temperature", 0.7);
      updateSessionSetting(testSessionId1, "maxTokens", 2000);

      const settings = getSessionSettings(testSessionId1);
      expect(settings.temperature).toBe(0.7);
      expect(settings.maxTokens).toBe(2000);
    });
  });

  describe("getSessionSetting", () => {
    it("should return undefined for missing setting", () => {
      const value = getSessionSetting(testSessionId1, "provider");
      expect(value).toBeUndefined();
    });

    it("should return default value for missing setting", () => {
      const value = getSessionSetting(testSessionId1, "provider", "openrouter");
      expect(value).toBe("openrouter");
    });

    it("should return stored setting value", () => {
      setSessionSettings(testSessionId1, { provider: "anthropic", model: "claude-3-5-sonnet" });

      const provider = getSessionSetting(testSessionId1, "provider");
      const model = getSessionSetting(testSessionId1, "model");

      expect(provider).toBe("anthropic");
      expect(model).toBe("claude-3-5-sonnet");
    });
  });

  describe("deleteSession", () => {
    it("should delete all messages for session", () => {
      // Create multiple messages
      db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)")
        .run(testSessionId1, JSON.stringify({ role: "user", content: "test1" }));
      db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)")
        .run(testSessionId1, JSON.stringify({ role: "assistant", content: "response" }));

      const deleted = deleteSession(testSessionId1);
      
      expect(deleted).toBe(true);

      // Verify messages were deleted
      const rows = db.prepare("SELECT * FROM memory WHERE session_id = ?")
        .all(testSessionId1);
      expect(rows.length).toBe(0);
    });

    it("should return false for non-existent session", () => {
      const deleted = deleteSession("nonexistent-session");
      expect(deleted).toBe(false);
    });
  });

  describe("listSessions", () => {
    it("should return empty array when no sessions exist", () => {
      // Clean up any existing sessions first
      const allSessions = listSessions();
      for (const session of allSessions) {
        deleteSession(session);
      }
      const sessions = listSessions();
      expect(sessions).toEqual([]);
    });

    it("should list all unique session IDs", () => {
      // Create messages for multiple sessions
      db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)")
        .run(testSessionId1, JSON.stringify({ role: "user", content: "test1" }));
      db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)")
        .run(testSessionId2, JSON.stringify({ role: "user", content: "test2" }));

      const sessions = listSessions();
      
      expect(sessions).toContain(testSessionId1);
      expect(sessions).toContain(testSessionId2);
    });
  });

  describe("getSessionStats", () => {
    it("should return stats for session", () => {
      // Create messages with different roles
      db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)")
        .run(testSessionId1, JSON.stringify({ role: "user", content: "hello" }));
      db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)")
        .run(testSessionId1, JSON.stringify({ role: "assistant", content: "hi" }));
      db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)")
        .run(testSessionId1, JSON.stringify({ role: "user", content: "how are you?" }));

      const stats = getSessionStats(testSessionId1);

      expect(stats.messageCount).toBe(3);
      expect(stats.userMessages).toBe(2);
      expect(stats.assistantMessages).toBe(1);
    });

    it("should handle session with no messages", () => {
      const stats = getSessionStats("nonexistent-session");

      expect(stats.messageCount).toBe(0);
      expect(stats.userMessages).toBe(0);
      expect(stats.assistantMessages).toBe(0);
    });
  });

  describe("Session Isolation", () => {
    it("should keep settings isolated between sessions", () => {
      // Set different settings for each session
      setSessionSettings(testSessionId1, { provider: "openai" });
      setSessionSettings(testSessionId2, { provider: "anthropic" });

      const settings1 = getSessionSettings(testSessionId1);
      const settings2 = getSessionSettings(testSessionId2);

      expect(settings1.provider).toBe("openai");
      expect(settings2.provider).toBe("anthropic");
    });

    it("should not affect other sessions when updating", () => {
      setSessionSettings(testSessionId1, { provider: "openai" });
      setSessionSettings(testSessionId2, { provider: "anthropic" });

      updateSessionSetting(testSessionId1, "model", "gpt-4");

      const settings2 = getSessionSettings(testSessionId2);
      expect(settings2.provider).toBe("anthropic");
      expect(settings2.model).toBeUndefined();
    });
  });
});
