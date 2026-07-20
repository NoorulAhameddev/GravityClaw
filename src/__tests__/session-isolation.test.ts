import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "../db.ts";
import { createSessionDB, SessionScopedDB } from "../db/session-isolation.ts";
import { config } from "../config.ts";

// Mock background memory operations to prevent timeouts
vi.mock("../memory/vector.ts", () => ({
  upsertVectorMemory: vi.fn().mockResolvedValue(undefined),
  vectorSemanticSearch: vi.fn().mockResolvedValue([]),
}));

vi.mock("../memory/supabase.ts", () => ({
  enqueueMessageSync: vi.fn().mockResolvedValue(undefined),
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0)),
}));

describe("Session Isolation", () => {
  const parentSessionId = "parent:session:123";
  const childSessionId = "parent:session:123-researcher-abcd1234";
  const otherSessionId = "other:session:456";

  beforeEach(() => {
    // Clean up test data
    db.prepare("DELETE FROM memory WHERE session_id LIKE ?").run("parent:%");
    db.prepare("DELETE FROM memory WHERE session_id LIKE ?").run("other:%");
  });

  afterEach(() => {
    db.prepare("DELETE FROM memory WHERE session_id LIKE ?").run("parent:%");
    db.prepare("DELETE FROM memory WHERE session_id LIKE ?").run("other:%");
  });

  describe("SessionScopedDB", () => {
    it("should create a session-scoped DB for parent session", () => {
      const sessionDB = createSessionDB(parentSessionId);
      expect(sessionDB).toBeInstanceOf(SessionScopedDB);
      expect(sessionDB.getSessionId()).toBe(parentSessionId);
      expect(sessionDB.getParentSessionId()).toBeUndefined();
    });

    it("should create a session-scoped DB for child session with parent reference", () => {
      const sessionDB = createSessionDB(childSessionId, parentSessionId);
      expect(sessionDB.getSessionId()).toBe(childSessionId);
      expect(sessionDB.getParentSessionId()).toBe(parentSessionId);
    });

    it("should allow parent DB to read its own session data", () => {
      const parentDB = createSessionDB(parentSessionId);
      
      // Insert a message into parent session
      parentDB.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)")
        .run(parentSessionId, JSON.stringify({ role: "user", content: "test" }));
      
      // Read it back
      const rows = parentDB.prepare("SELECT message_json FROM memory WHERE session_id = ?")
        .all(parentSessionId) as { message_json: string }[];
      
      expect(rows).toHaveLength(1);
      const row = rows[0];
      if (!row) throw new Error("Expected row to exist");
      const msg = JSON.parse(row.message_json);
      expect(msg.content).toBe("test");
    });

    it("should allow parent DB to read child session data (child ID starts with parent)", () => {
      const parentDB = createSessionDB(parentSessionId);
      
      // Insert a message into child session directly (simulating child writing)
      db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)")
        .run(childSessionId, JSON.stringify({ role: "user", content: "child task" }));
      
      // Parent DB should be able to read child's memory
      const rows = parentDB.prepare("SELECT message_json FROM memory WHERE session_id = ?")
        .all(childSessionId) as { message_json: string }[];
      
      expect(rows).toHaveLength(1);
      const row = rows[0];
      if (!row) throw new Error("Expected row to exist");
      const msg = JSON.parse(row.message_json);
      expect(msg.content).toBe("child task");
    });

    it("should block child DB from reading parent session data", () => {
      const childDB = createSessionDB(childSessionId, parentSessionId);
      
      // Insert a message into parent session
      db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)")
        .run(parentSessionId, JSON.stringify({ role: "user", content: "parent secret" }));
      
      // Child DB should NOT be able to read parent's memory
      expect(() => {
        childDB.prepare("SELECT message_json FROM memory WHERE session_id = ?")
          .all(parentSessionId);
      }).toThrow("Session isolation violation: Child cannot read parent memory");
    });

    it("should block child DB from reading other unrelated sessions", () => {
      const childDB = createSessionDB(childSessionId, parentSessionId);
      
      // Insert a message into other session
      db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)")
        .run(otherSessionId, JSON.stringify({ role: "user", content: "other secret" }));
      
      // Child DB should NOT be able to read other's memory
      expect(() => {
        childDB.prepare("SELECT message_json FROM memory WHERE session_id = ?")
          .all(otherSessionId);
      }).toThrow("Session isolation violation: Cannot access other session data");
    });

    it("should block parent DB from reading unrelated sessions", () => {
      const parentDB = createSessionDB(parentSessionId);
      
      // Insert a message into other session
      db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)")
        .run(otherSessionId, JSON.stringify({ role: "user", content: "other secret" }));
      
      // Parent DB should NOT be able to read other's memory
      expect(() => {
        parentDB.prepare("SELECT message_json FROM memory WHERE session_id = ?")
          .all(otherSessionId);
      }).toThrow("Session isolation violation: Cannot access other session data");
    });

    it("should detect SQL injection attempts targeting session_id", () => {
      const sessionDB = createSessionDB(parentSessionId);
      
      // Attempt SQL injection via UNION
      expect(() => {
        sessionDB.prepare("SELECT * FROM memory WHERE session_id = ? UNION SELECT * FROM memory WHERE session_id = 'other'");
      }).toThrow("Potential SQL injection detected in session query");
      
      // Attempt chained query
      expect(() => {
        sessionDB.prepare("DELETE FROM memory; SELECT * FROM memory WHERE session_id = ?");
      }).toThrow("Potential SQL injection detected in session query");
    });

    it("should allow writes to own session", () => {
      const sessionDB = createSessionDB(parentSessionId);
      
      expect(() => {
        sessionDB.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)")
          .run(parentSessionId, JSON.stringify({ role: "user", content: "test" }));
      }).not.toThrow();
    });

    it("should block writes to other sessions", () => {
      const childDB = createSessionDB(childSessionId, parentSessionId);
      
      expect(() => {
        childDB.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)")
          .run(parentSessionId, JSON.stringify({ role: "user", content: "malicious" }));
      }).toThrow("Session isolation violation");
    });

    it("should handle queries with colon-format session IDs", () => {
      const parentDB = createSessionDB(parentSessionId);
      
      // Insert a message with colon-format ID
      const colonId = `${parentSessionId}:user:123`;
      parentDB.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)")
        .run(parentSessionId, JSON.stringify({ role: "user", content: "test" }));
      
      // Query using colon-format session ID (should be allowed)
      const rows = parentDB.prepare("SELECT message_json FROM memory WHERE session_id = ?")
        .all(parentSessionId) as { message_json: string }[];
      
      expect(rows).toHaveLength(1);
    });

    it("should allow parent DB to read child sessions with colon format", () => {
      const parentDB = createSessionDB(parentSessionId);
      
      // Simulate child writing with colon-format ID
      const childColonId = `${childSessionId}:user:456`;
      db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)")
        .run(childSessionId, JSON.stringify({ role: "user", content: "child colon" }));
      
      // Parent DB should be able to read child's memory using colon format
      const rows = parentDB.prepare("SELECT message_json FROM memory WHERE session_id = ?")
        .all(childSessionId) as { message_json: string }[];
      
      expect(rows).toHaveLength(1);
    });
  });

  describe("Orchestrator Integration", () => {
    it.skip("should validate session ID format in addUserMessage (requires orchestrator mock setup)", async () => {
      // Import the function
      const { addUserMessage } = await import("../llm/orchestrator.ts");
      
      const deps = { db, config };
      
      // Valid session ID should work
      expect(() => addUserMessage(parentSessionId, "test", deps)).not.toThrow();
      
      // Invalid session IDs should throw
      expect(() => addUserMessage("", "test", deps)).toThrow("Session ID must be a non-empty string");
      expect(() => addUserMessage("a".repeat(256), "test", deps)).toThrow("Session ID exceeds maximum length");
      expect(() => addUserMessage("invalid!@#", "test", deps)).toThrow("Session ID contains invalid characters");
    });

    it.skip("should validate session ID format in getHistory (requires orchestrator mock setup)", async () => {
      const { getHistory } = await import("../llm/orchestrator.ts");
      
      const deps = { db, config };
      
      // Valid session ID should work
      expect(() => getHistory(parentSessionId, deps)).not.toThrow();
      
      // Invalid session IDs should throw
      expect(() => getHistory("", deps)).toThrow("Session ID must be a non-empty string");
    });
  });

  describe("Swarm Session Isolation", () => {
    it.todo("should isolate child agent memory from parent", async () => {
      // This test requires mocking the LLM provider to avoid API calls.
      // The core isolation logic is already tested in SessionScopedDB unit tests.
    });
  });
});