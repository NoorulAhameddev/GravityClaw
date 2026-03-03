/**
 * Tests for Group Management Feature
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../db.ts";
import {
  getGroupSessionId,
  getGroupSettings,
  updateGroupSettings,
  isGroupAdmin,
  addGroupAdmin,
  removeGroupAdmin,
  getGroupAdmins,
  isToolAllowedForUser,
  isBotMentioned,
  removeBotMention,
  DANGEROUS_TOOLS,
} from "../groups/index.ts";

describe("Group Management", () => {
  beforeEach(() => {
    // Clean up test data before each test
    db.prepare("DELETE FROM group_settings WHERE platform LIKE 'test-%'").run();
    db.prepare("DELETE FROM group_admins WHERE platform LIKE 'test-%'").run();
    db.prepare("DELETE FROM group_sessions WHERE platform LIKE 'test-%'").run();
  });

  afterEach(() => {
    // Clean up after tests
    db.prepare("DELETE FROM group_settings WHERE platform LIKE 'test-%'").run();
    db.prepare("DELETE FROM group_admins WHERE platform LIKE 'test-%'").run();
    db.prepare("DELETE FROM group_sessions WHERE platform LIKE 'test-%'").run();
  });

  describe("Group Sessions", () => {
    it("should create unique session ID for group", () => {
      const sessionId1 = getGroupSessionId("test-telegram", "123456");
      const sessionId2 = getGroupSessionId("test-telegram", "123456");

      expect(sessionId1).toBe(sessionId2);
      expect(sessionId1).toContain("test-telegram");
      expect(sessionId1).toContain("123456");
    });

    it("should create different session IDs for different groups", () => {
      const sessionId1 = getGroupSessionId("test-telegram", "123456");
      const sessionId2 = getGroupSessionId("test-telegram", "789012");

      expect(sessionId1).not.toBe(sessionId2);
    });

    it("should create different session IDs for different platforms", () => {
      const sessionId1 = getGroupSessionId("test-telegram", "123456");
      const sessionId2 = getGroupSessionId("test-whatsapp", "123456");

      expect(sessionId1).not.toBe(sessionId2);
    });
  });

  describe("Group Settings", () => {
    it("should return default settings for new group", () => {
      const settings = getGroupSettings("test-telegram", "123456");

      expect(settings.platform).toBe("test-telegram");
      expect(settings.groupId).toBe("123456");
      expect(settings.voiceMode).toBe("off");
      expect(settings.thinkingLevel).toBe("medium");
      expect(settings.ttsProvider).toBe("openai");
      expect(settings.enabledTools).toEqual([]);
      expect(settings.disabledTools).toEqual([]);
    });

    it("should update group settings", () => {
      updateGroupSettings("test-telegram", "123456", {
        voiceMode: "full-voice",
        thinkingLevel: "high",
        ttsProvider: "elevenlabs",
      });

      const settings = getGroupSettings("test-telegram", "123456");
      expect(settings.voiceMode).toBe("full-voice");
      expect(settings.thinkingLevel).toBe("high");
      expect(settings.ttsProvider).toBe("elevenlabs");
    });

    it("should persist settings across calls", () => {
      updateGroupSettings("test-telegram", "123456", {
        voiceMode: "transcribe-only",
      });

      const settings1 = getGroupSettings("test-telegram", "123456");
      const settings2 = getGroupSettings("test-telegram", "123456");

      expect(settings1.voiceMode).toBe(settings2.voiceMode);
    });

    it("should update only specified settings", () => {
      updateGroupSettings("test-telegram", "123456", {
        voiceMode: "full-voice",
      });

      updateGroupSettings("test-telegram", "123456", {
        thinkingLevel: "high",
      });

      const settings = getGroupSettings("test-telegram", "123456");
      expect(settings.voiceMode).toBe("full-voice");
      expect(settings.thinkingLevel).toBe("high");
    });

    it("should store disabled tools list", () => {
      updateGroupSettings("test-telegram", "123456", {
        disabledTools: ["run_shell", "delete_file"],
      });

      const settings = getGroupSettings("test-telegram", "123456");
      expect(settings.disabledTools).toContain("run_shell");
      expect(settings.disabledTools).toContain("delete_file");
      expect(settings.disabledTools).toHaveLength(2);
    });
  });

  describe("Group Admins", () => {
    it("should add admin to group", () => {
      addGroupAdmin("test-telegram", "123456", "user789");

      const isAdmin = isGroupAdmin("test-telegram", "123456", "user789");
      expect(isAdmin).toBe(true);
    });

    it("should identify owner status", () => {
      addGroupAdmin("test-telegram", "123456", "user789", true);

      const admins = getGroupAdmins("test-telegram", "123456");
      expect(admins).toHaveLength(1);
      expect(admins[0]!.userId).toBe("user789");
      expect(admins[0]!.isOwner).toBe(true);
    });

    it("should remove admin from group", () => {
      addGroupAdmin("test-telegram", "123456", "user789");
      expect(isGroupAdmin("test-telegram", "123456", "user789")).toBe(true);

      removeGroupAdmin("test-telegram", "123456", "user789");
      expect(isGroupAdmin("test-telegram", "123456", "user789")).toBe(false);
    });

    it("should return false for non-admin users", () => {
      const isAdmin = isGroupAdmin("test-telegram", "123456", "user999");
      expect(isAdmin).toBe(false);
    });

    it("should handle multiple admins", () => {
      addGroupAdmin("test-telegram", "123456", "user1");
      addGroupAdmin("test-telegram", "123456", "user2");
      addGroupAdmin("test-telegram", "123456", "user3", true);

      const admins = getGroupAdmins("test-telegram", "123456");
      expect(admins).toHaveLength(3);

      const owner = admins.find((a) => a.isOwner);
      expect(owner?.userId).toBe("user3");
    });
  });

  describe("Tool Permissions", () => {
    it("should allow non-dangerous tools for all users", () => {
      const allowed = isToolAllowedForUser(
        "test-telegram",
        "123456",
        "user789",
        "datetime"
      );

      expect(allowed).toBe(true);
    });

    it("should restrict dangerous tools to admins", () => {
      const allowed = isToolAllowedForUser(
        "test-telegram",
        "123456",
        "user789",
        "run_shell"
      );

      expect(allowed).toBe(false);
    });

    it("should allow dangerous tools for admins", () => {
      addGroupAdmin("test-telegram", "123456", "user789");

      const allowed = isToolAllowedForUser(
        "test-telegram",
        "123456",
        "user789",
        "run_shell"
      );

      expect(allowed).toBe(true);
    });

    it("should check all dangerous tools", () => {
      expect(DANGEROUS_TOOLS).toContain("run_shell");
      expect(DANGEROUS_TOOLS).toContain("read_file");
      expect(DANGEROUS_TOOLS).toContain("write_file");
      expect(DANGEROUS_TOOLS).toContain("delete_file");
    });

    it("should respect disabled tools list", () => {
      updateGroupSettings("test-telegram", "123456", {
        disabledTools: ["datetime"],
      });

      const allowed = isToolAllowedForUser(
        "test-telegram",
        "123456",
        "user789",
        "datetime"
      );

      expect(allowed).toBe(false);
    });

    it("should respect enabled tools list when specified", () => {
      updateGroupSettings("test-telegram", "123456", {
        enabledTools: ["datetime", "search_web"],
      });

      const allowed1 = isToolAllowedForUser(
        "test-telegram",
        "123456",
        "user789",
        "datetime"
      );
      const allowed2 = isToolAllowedForUser(
        "test-telegram",
        "123456",
        "user789",
        "some_other_tool"
      );

      expect(allowed1).toBe(true);
      expect(allowed2).toBe(false);
    });
  });

  describe("Bot Mention Detection", () => {
    it("should detect bot mention", () => {
      const text = "Hey @GravityClawBot, what's the weather?";
      const mentioned = isBotMentioned(text, "GravityClawBot");

      expect(mentioned).toBe(true);
    });

    it("should be case insensitive", () => {
      const text = "Hey @gravityclawbot, what's the time?";
      const mentioned = isBotMentioned(text, "GravityClawBot");

      expect(mentioned).toBe(true);
    });

    it("should not detect when bot not mentioned", () => {
      const text = "Just a regular message";
      const mentioned = isBotMentioned(text, "GravityClawBot");

      expect(mentioned).toBe(false);
    });

    it("should remove bot mention from text", () => {
      const text = "@GravityClawBot what's the weather?";
      const cleaned = removeBotMention(text, "GravityClawBot");

      expect(cleaned).toBe("what's the weather?");
      expect(cleaned).not.toContain("@GravityClawBot");
    });

    it("should remove all bot mentions", () => {
      const text = "@GravityClawBot please @GravityClawBot help me";
      const cleaned = removeBotMention(text, "GravityClawBot");

      expect(cleaned).not.toContain("@GravityClawBot");
    });

    it("should handle empty bot username", () => {
      const text = "@SomeBot message";
      const mentioned = isBotMentioned(text, "");

      expect(mentioned).toBe(false);
    });
  });

  describe("Integration Tests", () => {
    it("should create complete group configuration", () => {
      // Create session
      const sessionId = getGroupSessionId("test-telegram", "123456");
      expect(sessionId).toBeTruthy();

      // Add admins
      addGroupAdmin("test-telegram", "123456", "owner1", true);
      addGroupAdmin("test-telegram", "123456", "admin1");

      // Configure settings
      updateGroupSettings("test-telegram", "123456", {
        voiceMode: "full-voice",
        thinkingLevel: "high",
        botUsername: "TestBot",
        disabledTools: ["run_shell"],
      });

      // Verify everything
      const settings = getGroupSettings("test-telegram", "123456");
      expect(settings.voiceMode).toBe("full-voice");
      expect(settings.botUsername).toBe("TestBot");

      const admins = getGroupAdmins("test-telegram", "123456");
      expect(admins).toHaveLength(2);

      const ownerCanUseShell = isToolAllowedForUser(
        "test-telegram",
        "123456",
        "owner1",
        "run_shell"
      );
      const normalUserCannotUseShell = isToolAllowedForUser(
        "test-telegram",
        "123456",
        "normaluser",
        "run_shell"
      );

      expect(ownerCanUseShell).toBe(true);
      expect(normalUserCannotUseShell).toBe(false);
    });
  });
});
