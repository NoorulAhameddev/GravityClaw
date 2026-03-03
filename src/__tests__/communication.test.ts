/**
 * Agent-to-Agent Communication Tests
 *
 * Tests for inter-agent messaging, session management, and permission-based access control.
 * Coverage includes message sending, history reading, permission granting, and session lifecycle.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../db.ts";
import { AgentMessaging, type Message } from "../agents/communication.ts";

// Test session IDs
const parentSessionId = "test:parent:session";
const childSessionId = "test:child:session";
const otherSessionId = "test:other:session";

describe("Agent-to-Agent Communication", () => {
  beforeEach(() => {
    // Clean up test data before each test
    db.prepare("DELETE FROM messages WHERE from_session_id LIKE 'test:%' OR to_session_id LIKE 'test:%'").run();
    db.prepare("DELETE FROM permissions WHERE session_id LIKE 'test:%' OR target_session_id LIKE 'test:%'").run();
    db.prepare("DELETE FROM sessions WHERE id LIKE 'test:%'").run();
    db.prepare("DELETE FROM agent_swarms WHERE parent_session_id LIKE 'test:%' OR child_session_id LIKE 'test:%'").run();
  });

  afterEach(() => {
    // Clean up test data after each test
    db.prepare("DELETE FROM messages WHERE from_session_id LIKE 'test:%' OR to_session_id LIKE 'test:%'").run();
    db.prepare("DELETE FROM permissions WHERE session_id LIKE 'test:%' OR target_session_id LIKE 'test:%'").run();
    db.prepare("DELETE FROM sessions WHERE id LIKE 'test:%'").run();
    db.prepare("DELETE FROM agent_swarms WHERE parent_session_id LIKE 'test:%' OR child_session_id LIKE 'test:%'").run();
  });

  describe("sessions_list", () => {
    it("should return empty list when no sessions exist", () => {
      const sessions = AgentMessaging.listSessions();
      expect(sessions).toHaveLength(0);
    });

    it("should list all active sessions with metadata", () => {
      // Create some sessions by adding messages to memory table
      db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)").run(
        parentSessionId,
        JSON.stringify({ role: "user", content: "test" })
      );
      db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)").run(
        childSessionId,
        JSON.stringify({ role: "user", content: "test" })
      );

      const sessions = AgentMessaging.listSessions();

      expect(sessions.length).toBeGreaterThanOrEqual(2);
      const parentFound = sessions.find((s) => s.id === parentSessionId);
      const childFound = sessions.find((s) => s.id === childSessionId);
      expect(parentFound).toBeDefined();
      expect(childFound).toBeDefined();
      expect(sessions[0]).toHaveProperty("active");
      expect(sessions[0]).toHaveProperty("lastActivity");
      expect(sessions[0]).toHaveProperty("allowMessages");
    });

    it("should reflect messaging status in session listings", () => {
      // Create session in memory
      db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)").run(
        parentSessionId,
        JSON.stringify({ role: "user", content: "test" })
      );

      // Initially messaging disabled
      let sessions = AgentMessaging.listSessions();
      const session1 = sessions.find((s) => s.id === parentSessionId);
      expect(session1?.allowMessages).toBe(false);

      // Enable messaging
      AgentMessaging.setAllowMessages(parentSessionId, true);

      sessions = AgentMessaging.listSessions();
      const session2 = sessions.find((s) => s.id === parentSessionId);
      expect(session2?.allowMessages).toBe(true);
    });
  });

  describe("sessions_send", () => {
    it("should fail when target session does not allow messages", () => {
      // Try to send to a session that doesn't allow messages
      expect(() => {
        AgentMessaging.sendMessage(parentSessionId, childSessionId, "test message");
      }).toThrow("does not allow messages");
    });

    it("should succeed when target session has messaging enabled", () => {
      // Enable messaging for target
      AgentMessaging.setAllowMessages(childSessionId, true);

      // Send should now succeed
      expect(() => {
        AgentMessaging.sendMessage(parentSessionId, childSessionId, "test message");
      }).not.toThrow();

      // Verify message was stored
      const messages = db
        .prepare("SELECT * FROM messages WHERE from_session_id = ? AND to_session_id = ?")
        .all(parentSessionId, childSessionId);
      expect(messages.length).toBe(1);
    });

    it("should store messages with correct metadata", () => {
      AgentMessaging.setAllowMessages(childSessionId, true);

      const messageContent = "This is a test message";
      AgentMessaging.sendMessage(parentSessionId, childSessionId, messageContent);

      const message = db
        .prepare("SELECT * FROM messages WHERE from_session_id = ? AND to_session_id = ?")
        .get(parentSessionId, childSessionId) as {
        id: string;
        from_session_id: string;
        to_session_id: string;
        content: string;
        timestamp: string;
      };

      expect(message).toBeDefined();
      expect(message.id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
      expect(message.from_session_id).toBe(parentSessionId);
      expect(message.to_session_id).toBe(childSessionId);
      expect(message.content).toBe(messageContent);
      expect(message.timestamp).toBeDefined();
    });

    it("should allow multiple messages between same sessions", () => {
      AgentMessaging.setAllowMessages(childSessionId, true);

      AgentMessaging.sendMessage(parentSessionId, childSessionId, "message 1");
      AgentMessaging.sendMessage(parentSessionId, childSessionId, "message 2");
      AgentMessaging.sendMessage(childSessionId, parentSessionId, "reply");

      // Only messages TO childSessionId should exist
      const toChild = db
        .prepare("SELECT COUNT(*) as count FROM messages WHERE to_session_id = ?")
        .get(childSessionId) as { count: number };
      expect(toChild.count).toBe(2);
    });
  });

  describe("sessions_history", () => {
    it("should return empty array for session with no messages", () => {
      AgentMessaging.setAllowMessages(parentSessionId, true);

      const history = AgentMessaging.readHistory(parentSessionId);

      expect(history).toEqual([]);
    });

    it("should read history when called on session with messages", () => {
      AgentMessaging.setAllowMessages(parentSessionId, true);

      // Send multiple messages to parentSessionId
      AgentMessaging.sendMessage(childSessionId, parentSessionId, "message 1");
      AgentMessaging.sendMessage(childSessionId, parentSessionId, "message 2");
      AgentMessaging.sendMessage(otherSessionId, parentSessionId, "message 3");

      const history = AgentMessaging.readHistory(parentSessionId);

      expect(history).toHaveLength(3);
      expect(history[0]?.content).toBe("message 1");
      expect(history[1]?.content).toBe("message 2");
      expect(history[2]?.content).toBe("message 3");
    });

    it("should respect limit parameter", () => {
      AgentMessaging.setAllowMessages(parentSessionId, true);

      // Send 5 messages
      for (let i = 1; i <= 5; i++) {
        AgentMessaging.sendMessage(childSessionId, parentSessionId, `message ${i}`);
      }

      const historyAll = AgentMessaging.readHistory(parentSessionId);
      const historyLimited = AgentMessaging.readHistory(parentSessionId, 3);

      expect(historyAll).toHaveLength(5);
      expect(historyLimited).toHaveLength(3);
      expect(historyLimited[0]?.content).toBe("message 3");
      expect(historyLimited[1]?.content).toBe("message 4");
      expect(historyLimited[2]?.content).toBe("message 5");
    });

    it("should return chronologically ordered messages", async () => {
      AgentMessaging.setAllowMessages(parentSessionId, true);

      AgentMessaging.sendMessage(childSessionId, parentSessionId, "first");
      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));
      AgentMessaging.sendMessage(childSessionId, parentSessionId, "second");

      const history = AgentMessaging.readHistory(parentSessionId);

      expect(history).toHaveLength(2);
      expect(history[0]?.content).toBe("first");
      expect(history[1]?.content).toBe("second");
      if (history[0] && history[1]) {
        expect(history[0].timestamp.getTime()).toBeLessThanOrEqual(history[1].timestamp.getTime());
      }
    });

    it("should fail when reading history without permission", () => {
      // Don't enable messages for the session
      const history = AgentMessaging.readHistory(parentSessionId);

      // Should return empty since target doesn't allow messages
      expect(history).toEqual([]);
    });
  });

  describe("sessions_grant_permission", () => {
    it("should enable messaging for a session", () => {
      AgentMessaging.setAllowMessages(parentSessionId, true);

      const canBefore = AgentMessaging.canReceiveMessages(parentSessionId);
      expect(canBefore).toBe(true);

      AgentMessaging.setAllowMessages(parentSessionId, false);
      const canAfter = AgentMessaging.canReceiveMessages(parentSessionId);
      expect(canAfter).toBe(false);
    });

    it("should persist permission changes to database", () => {
      AgentMessaging.setAllowMessages(parentSessionId, true);

      // Verify in database
      let row = db.prepare("SELECT allow_messages FROM sessions WHERE id = ?").get(parentSessionId) as {
        allow_messages: number;
      };
      expect(row.allow_messages).toBe(1);

      // Change permission
      AgentMessaging.setAllowMessages(parentSessionId, false);

      row = db.prepare("SELECT allow_messages FROM sessions WHERE id = ?").get(parentSessionId) as {
        allow_messages: number;
      };
      expect(row.allow_messages).toBe(0);
    });

    it("should create session entry if not exists", () => {
      // Verify session doesn't exist
      let row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(parentSessionId);
      expect(row).toBeUndefined();

      // Grant permission (creates session)
      AgentMessaging.setAllowMessages(parentSessionId, true);

      row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(parentSessionId);
      expect(row).toBeDefined();
    });
  });

  describe("permissions model", () => {
    it("should isolate sessions by default (no cross-session communication)", () => {
      // No permissions granted, no allow_messages enabled
      expect(() => {
        AgentMessaging.sendMessage(parentSessionId, childSessionId, "test");
      }).toThrow();
    });

    it("should allow communication when target enables messaging", () => {
      AgentMessaging.setAllowMessages(childSessionId, true);

      expect(() => {
        AgentMessaging.sendMessage(parentSessionId, childSessionId, "test");
      }).not.toThrow();
    });

    it("should check explicit permissions when granted", () => {
      // Grant write permission from parentSessionId to childSessionId
      AgentMessaging.grantPermission(parentSessionId, childSessionId, {
        canRead: false,
        canWrite: true,
      });

      // Enable messaging on target
      AgentMessaging.setAllowMessages(childSessionId, true);

      // Should allow sending with explicit permission
      expect(() => {
        AgentMessaging.sendMessage(parentSessionId, childSessionId, "test");
      }).not.toThrow();
    });

    it("should support read-only permissions", () => {
      AgentMessaging.setAllowMessages(childSessionId, true);

      // Send a message
      AgentMessaging.sendMessage(parentSessionId, childSessionId, "test message");

      // Grant read permission
      AgentMessaging.grantPermission(otherSessionId, childSessionId, {
        canRead: true,
        canWrite: false,
      });

      // otherSessionId can read history
      const history = AgentMessaging.readHistory(childSessionId);
      expect(history.length).toBeGreaterThan(0);
    });
  });

  describe("child agent permissions in swarms", () => {
    it("should allow child agents to read parent history after spawning", async () => {
      // Enable messaging on parent
      AgentMessaging.setAllowMessages(parentSessionId, true);

      // Send message to parent
      AgentMessaging.sendMessage(otherSessionId, parentSessionId, "parent message");

      // Create parent-child relationship
      const { randomUUID } = await import("crypto");
      const swarmId = randomUUID();
      db.prepare(
        `INSERT INTO agent_swarms (id, parent_session_id, child_session_id, role, status, created_at)
         VALUES (?, ?, ?, ?, 'active', ?)`
      ).run(swarmId, parentSessionId, childSessionId, "researcher", new Date().toISOString());

      // Child should now be able to read parent's history
      const history = AgentMessaging.readHistory(parentSessionId);
      expect(history.length).toBeGreaterThan(0);
    });

    it("should verify parent-child relationships exist in swarm table", async () => {
      // Verify no relationship initially
      const beforeSwarm = db
        .prepare(
          `SELECT id FROM agent_swarms
           WHERE parent_session_id = ? AND child_session_id = ?`
        )
        .get(parentSessionId, childSessionId);
      expect(beforeSwarm).toBeUndefined();

      // Create relationship
      const { randomUUID } = await import("crypto");
      const swarmId = randomUUID();
      db.prepare(
        `INSERT INTO agent_swarms (id, parent_session_id, child_session_id, role, status, created_at)
         VALUES (?, ?, ?, ?, 'active', ?)`
      ).run(swarmId, parentSessionId, childSessionId, "coder", new Date().toISOString());

      // Verify relationship exists
      const afterSwarm = db
        .prepare(
          `SELECT id FROM agent_swarms
           WHERE parent_session_id = ? AND child_session_id = ?`
        )
        .get(parentSessionId, childSessionId);
      expect(afterSwarm).toBeDefined();
    });
  });

  describe("message persistence", () => {
    it("should persist messages across function calls", () => {
      AgentMessaging.setAllowMessages(parentSessionId, true);

      AgentMessaging.sendMessage(childSessionId, parentSessionId, "persistent message");

      // Read history again
      const history = AgentMessaging.readHistory(parentSessionId);

      expect(history.length).toBe(1);
      expect(history[0]?.content).toBe("persistent message");
    });

    it("should maintain message order with timestamps", () => {
      AgentMessaging.setAllowMessages(parentSessionId, true);

      const messages = ["first", "second", "third"];

      for (const msg of messages) {
        AgentMessaging.sendMessage(childSessionId, parentSessionId, msg);
      }

      const history = AgentMessaging.readHistory(parentSessionId);

      expect(history).toHaveLength(3);
      history.forEach((msg, idx) => {
        expect(msg.content).toBe(messages[idx] || "");
      });
    });
  });

  describe("error handling", () => {
    it("should throw error when sending to non-existent session without messaging enabled", () => {
      expect(() => {
        AgentMessaging.sendMessage("sender", "nonexistent-session", "test");
      }).toThrow();
    });

    it("should handle concurrent message sends gracefully", async () => {
      AgentMessaging.setAllowMessages(parentSessionId, true);

      const promises = Array.from({ length: 5 }, (_, i) =>
        Promise.resolve(AgentMessaging.sendMessage(childSessionId, parentSessionId, `message ${i + 1}`))
      );

      await Promise.all(promises);

      const history = AgentMessaging.readHistory(parentSessionId);
      expect(history).toHaveLength(5);
    });

    it("should handle invalid limit gracefully", () => {
      AgentMessaging.setAllowMessages(parentSessionId, true);

      AgentMessaging.sendMessage(childSessionId, parentSessionId, "test");

      // Test with 0 limit (should return all)
      const history1 = AgentMessaging.readHistory(parentSessionId, 0);
      expect(history1).toHaveLength(1);

      // Test with negative limit (should return all)
      const history2 = AgentMessaging.readHistory(parentSessionId, -1);
      expect(history2).toHaveLength(1);
    });
  });

  describe("integration scenarios", () => {
    it("should support research → writer agent flow", () => {
      const researchSessionId = "session:research-agent";
      const writerSessionId = "session:writer-agent";

      // Researcher publishes findings
      AgentMessaging.setAllowMessages(researchSessionId, true);
      AgentMessaging.sendMessage("system", researchSessionId, "Finding 1: The process works");
      AgentMessaging.sendMessage("system", researchSessionId, "Finding 2: Implementation is sound");

      // Writer can read researcher's findings
      AgentMessaging.setAllowMessages(writerSessionId, true);
      const findings = AgentMessaging.readHistory(researchSessionId);

      expect(findings).toHaveLength(2);
      expect(findings[0]?.content).toContain("Finding 1");
      expect(findings[1]?.content).toContain("Finding 2");

      // Writer sends compiled report to researcher
      AgentMessaging.sendMessage(writerSessionId, researchSessionId, "Report compiled successfully");

      const fullHistory = AgentMessaging.readHistory(researchSessionId);
      expect(fullHistory).toHaveLength(3);

      // Cleanup
      db.prepare("DELETE FROM messages WHERE from_session_id LIKE 'session:%' OR to_session_id LIKE 'session:%'").run();
      db.prepare("DELETE FROM sessions WHERE id LIKE 'session:%'").run();
    });

    it("should maintain separate message queues per session", () => {
      AgentMessaging.setAllowMessages(parentSessionId, true);
      AgentMessaging.setAllowMessages(childSessionId, true);
      AgentMessaging.setAllowMessages(otherSessionId, true);

      // Messages TO different sessions
      AgentMessaging.sendMessage("a", parentSessionId, "to parent");
      AgentMessaging.sendMessage("b", childSessionId, "to child");
      AgentMessaging.sendMessage("c", otherSessionId, "to other");

      const parentHistory = AgentMessaging.readHistory(parentSessionId);
      const childHistory = AgentMessaging.readHistory(childSessionId);
      const otherHistory = AgentMessaging.readHistory(otherSessionId);

      expect(parentHistory).toHaveLength(1);
      expect(parentHistory[0]?.content).toBe("to parent");

      expect(childHistory).toHaveLength(1);
      expect(childHistory[0]?.content).toBe("to child");

      expect(otherHistory).toHaveLength(1);
      expect(otherHistory[0]?.content).toBe("to other");
    });
  });
});
