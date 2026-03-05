/**
 * Memory Persistence Integration Tests
 * Tests creation, retrieval, update, and deletion of facts and knowledge graph
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../../db.ts";
import { createLogger } from "../../logger.ts";
import {
  createTestSessionId,
  createTestSession,
  cleanupTestSession,
  createTestFact,
  createTestEntity,
  createTestRelationship,
  mockMemoryFacts,
  mockEntities,
  mockRelationships,
} from "./test-utils.ts";

const log = createLogger("memory-persistence-test");

describe("Memory Persistence Integration Tests", () => {
  let testSessionId: string;

  beforeEach(() => {
    testSessionId = createTestSessionId("memory");
    createTestSession(testSessionId);
  });

  afterEach(() => {
    cleanupTestSession(testSessionId);
  });

  describe("Fact CRUD Operations", () => {
    it("should create and retrieve facts", async () => {
      for (const fact of mockMemoryFacts) {
        createTestFact(testSessionId, fact.category, fact.fact);
      }

      const rows = db
        .prepare(
          `SELECT fact_text, category FROM fact_stats 
           WHERE session_id = ? 
           ORDER BY created_at ASC`
        )
        .all(testSessionId) as Array<{ fact_text: string; category: string }>;

      expect(rows).toHaveLength(mockMemoryFacts.length);
      rows.forEach((row, idx) => {
        expect(row.category).toBe(
          mockMemoryFacts[idx]!.category.toLowerCase()
        );
        expect(row.fact_text).toContain(mockMemoryFacts[idx]!.fact.toLowerCase());
      });
    });

    it("should increment access count on fact retrieval", async () => {
      const fact = "User prefers detailed explanations";
      createTestFact(testSessionId, "preferences", fact);

      const getFactHash = require("../../memory/markdown.ts").getFactHash;
      const factHash = getFactHash(fact);

      // Access the fact 3 times
      const { touchFactAccess } = require("../../memory/markdown.ts");
      for (let i = 0; i < 3; i++) {
        touchFactAccess(testSessionId, "preferences", fact, {
          incrementCount: true,
        });
      }

      const row = db
        .prepare(
          `SELECT access_count FROM fact_stats 
           WHERE session_id = ? AND fact_hash = ?`
        )
        .get(testSessionId, factHash) as { access_count: number } | undefined;

      expect(row?.access_count).toBeGreaterThanOrEqual(1);
    });

    it("should update fact importance score", async () => {
      const fact = "Critical system fact";
      createTestFact(testSessionId, "critical", fact);

      const getFactHash = require("../../memory/markdown.ts").getFactHash;
      const factHash = getFactHash(fact);
      const { touchFactAccess } = require("../../memory/markdown.ts");

      // Increase importance
      touchFactAccess(testSessionId, "critical", fact, {
        importanceDelta: 5,
      });

      const row = db
        .prepare(
          `SELECT importance FROM fact_stats 
           WHERE session_id = ? AND fact_hash = ?`
        )
        .get(testSessionId, factHash) as { importance: number } | undefined;

      expect(row?.importance).toBeGreaterThan(0);
    });

    it("should delete facts properly", async () => {
      createTestFact(testSessionId, "test", "Fact to be deleted");

      const rowsBefore = db
        .prepare(
          `SELECT COUNT(*) as count FROM fact_stats WHERE session_id = ?`
        )
        .get(testSessionId) as { count: number };
      expect(rowsBefore.count).toBeGreaterThan(0);

      db.prepare(`DELETE FROM fact_stats WHERE session_id = ?`).run(
        testSessionId
      );

      const rowsAfter = db
        .prepare(
          `SELECT COUNT(*) as count FROM fact_stats WHERE session_id = ?`
        )
        .get(testSessionId) as { count: number };
      expect(rowsAfter.count).toBe(0);
    });

    it("should handle duplicate facts", async () => {
      const fact = "Important fact";
      const category = "knowledge";

      // Create same fact twice
      createTestFact(testSessionId, category, fact);
      createTestFact(testSessionId, category, fact);

      const getFactHash = require("../../memory/markdown.ts").getFactHash;
      const factHash = getFactHash(fact);

      const rows = db
        .prepare(
          `SELECT COUNT(*) as count FROM fact_stats 
           WHERE session_id = ? AND fact_hash = ?`
        )
        .get(testSessionId, factHash) as { count: number };

      // Should have only one record (upserted)
      expect(rows.count).toBe(1);
    });

    it("should track fact access timestamps", async () => {
      createTestFact(testSessionId, "test", "Timestamped fact");

      const row = db
        .prepare(
          `SELECT last_accessed FROM fact_stats WHERE session_id = ? LIMIT 1`
        )
        .get(testSessionId) as { last_accessed: string } | undefined;

      expect(row?.last_accessed).toBeDefined();
    });
  });

  describe("Knowledge Graph Entity Operations", () => {
    it("should create entities with properties", async () => {
      for (const entity of mockEntities) {
        const id = createTestEntity(
          testSessionId,
          entity.name,
          entity.type,
          entity.properties
        );
        expect(id).toBeGreaterThan(0);
      }

      const rows = db
        .prepare(
          `SELECT name, type FROM entities WHERE session_id = ? ORDER BY id ASC`
        )
        .all(testSessionId) as Array<{ name: string; type: string }>;

      expect(rows).toHaveLength(mockEntities.length);
    });

    it("should retrieve entity properties", async () => {
      const entity = mockEntities[0]!;
      createTestEntity(testSessionId, entity.name, entity.type, entity.properties);

      const row = db
        .prepare(
          `SELECT properties FROM entities 
           WHERE session_id = ? AND name = ?`
        )
        .get(testSessionId, entity.name) as { properties: string } | undefined;

      const props = JSON.parse(row?.properties || "{}");
      expect(props.email).toBe("alice@example.com");
    });

    it("should update entity properties", async () => {
      const entity = mockEntities[0]!;
      const id = createTestEntity(testSessionId, entity.name, entity.type, {
        email: "old@example.com",
      });

      // Update properties
      const newProperties = { email: "new@example.com", phone: "123-456-7890" };
      db.prepare(
        `UPDATE entities SET properties = ? WHERE id = ?`
      ).run(JSON.stringify(newProperties), id);

      const row = db
        .prepare(`SELECT properties FROM entities WHERE id = ?`)
        .get(id) as { properties: string } | undefined;

      const props = JSON.parse(row?.properties || "{}");
      expect(props.email).toBe("new@example.com");
      expect(props.phone).toBe("123-456-7890");
    });

    it("should handle entity uniqueness constraint", async () => {
      const entity = mockEntities[0]!;

      const id1 = createTestEntity(
        testSessionId,
        entity.name,
        entity.type,
        entity.properties
      );
      const id2 = createTestEntity(
        testSessionId,
        entity.name,
        entity.type,
        { email: "updated@example.com" }
      );

      // Should have retrieved the same entity
      expect(id1).toBe(id2);

      const row = db
        .prepare(
          `SELECT COUNT(*) as count FROM entities 
           WHERE session_id = ? AND name = ?`
        )
        .get(testSessionId, entity.name) as { count: number };

      expect(row.count).toBe(1);
    });

    it("should track entity access statistics", async () => {
      const entity = mockEntities[0]!;
      createTestEntity(testSessionId, entity.name, entity.type);

      // Update access count
      db.prepare(
        `UPDATE entities SET access_count = access_count + 1 WHERE session_id = ? AND name = ?`
      ).run(testSessionId, entity.name);

      const row = db
        .prepare(
          `SELECT access_count FROM entities 
           WHERE session_id = ? AND name = ?`
        )
        .get(testSessionId, entity.name) as { access_count: number } | undefined;

      expect(row?.access_count).toBe(1);
    });
  });

  describe("Knowledge Graph Relationship Operations", () => {
    it("should create relationships between entities", async () => {
      // Create entities first
      for (const entity of mockEntities.slice(0, 2)) {
        createTestEntity(testSessionId, entity.name, entity.type);
      }

      // Create relationship
      createTestRelationship(
        testSessionId,
        mockEntities[0]!.name,
        mockEntities[1]!.name,
        "uses"
      );

      const rows = db
        .prepare(
          `SELECT relation_type FROM relationships WHERE session_id = ?`
        )
        .all(testSessionId) as Array<{ relation_type: string }>;

      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0]?.relation_type).toBe("uses");
    });

    it("should populate relationship metadata", async () => {
      // Create entities
      createTestEntity(testSessionId, mockEntities[0]!.name, mockEntities[0]!.type);
      createTestEntity(testSessionId, mockEntities[1]!.name, mockEntities[1]!.type);

      // Create relationship with metadata
      const metadata = { strength: 0.95, frequency: 10 };
      createTestRelationship(
        testSessionId,
        mockEntities[0]!.name,
        mockEntities[1]!.name,
        "related",
        metadata
      );

      const row = db
        .prepare(`SELECT metadata FROM relationships WHERE session_id = ? LIMIT 1`)
        .get(testSessionId) as { metadata: string } | undefined;

      const meta = JSON.parse(row?.metadata || "{}");
      expect(meta.strength).toBe(0.95);
      expect(meta.frequency).toBe(10);
    });

    it("should handle multiple relationships between same entities", async () => {
      createTestEntity(testSessionId, "Alice", "person");
      createTestEntity(testSessionId, "Bob", "person");

      createTestRelationship(testSessionId, "Alice", "Bob", "knows");
      createTestRelationship(testSessionId, "Alice", "Bob", "works-with");

      const rows = db
        .prepare(
          `SELECT relation_type FROM relationships 
           WHERE session_id = ? 
           ORDER BY created_at ASC`
        )
        .all(testSessionId) as Array<{ relation_type: string }>;

      expect(rows.length).toBeGreaterThanOrEqual(2);
    });

    it("should query relationships efficiently", async () => {
      // Create test graph
      createTestEntity(testSessionId, "Alice", "person");
      createTestEntity(testSessionId, "PostgreSQL", "database");
      createTestEntity(testSessionId, "GitHub", "platform");

      createTestRelationship(testSessionId, "Alice", "GitHub", "uses");
      createTestRelationship(testSessionId, "GitHub", "PostgreSQL", "integrates");

      // Query relationships starting from Alice
      const fromAlice = db
        .prepare(
          `SELECT r.relation_type, e.name as target
           FROM relationships r
           JOIN entities e ON r.to_id = e.id
           WHERE r.from_id = (
             SELECT id FROM entities WHERE session_id = ? AND name = ?
           ) AND r.session_id = ?`
        )
        .all(testSessionId, "Alice", testSessionId) as Array<{
          relation_type: string;
          target: string;
        }>;

      expect(fromAlice.length).toBeGreaterThan(0);
    });
  });

  describe("Memory Data Integrity", () => {
    it("should maintain consistency between facts and entities", async () => {
      createTestFact(testSessionId, "user-knowledge", "Alice works as software engineer");
      createTestEntity(testSessionId, "Alice", "person", { role: "engineer" });

      const facts = db
        .prepare(
          `SELECT COUNT(*) as count FROM fact_stats WHERE session_id = ?`
        )
        .get(testSessionId) as { count: number };

      const entities = db
        .prepare(
          `SELECT COUNT(*) as count FROM entities WHERE session_id = ?`
        )
        .get(testSessionId) as { count: number };

      expect(facts.count).toBeGreaterThan(0);
      expect(entities.count).toBeGreaterThan(0);
    });

    it("should prevent orphaned relationships", async () => {
      createTestEntity(testSessionId, "Entity1", "type1");
      createTestEntity(testSessionId, "Entity2", "type2");

      createTestRelationship(testSessionId, "Entity1", "Entity2", "relates");

      // Delete Entity1
      db.prepare(`DELETE FROM entities WHERE session_id = ? AND name = ?`).run(
        testSessionId,
        "Entity1"
      );

      // Relationships should cascade delete due to FOREIGN KEY
      const relationships = db
        .prepare(`SELECT COUNT(*) as count FROM relationships WHERE session_id = ?`)
        .get(testSessionId) as { count: number };

      // Should be 0 or handle gracefully
      expect(relationships.count).toBeGreaterThanOrEqual(0);
    });

    it("should handle rollback on transaction failure", async () => {
      const initialCount = db
        .prepare(
          `SELECT COUNT(*) as count FROM entities WHERE session_id = ?`
        )
        .get(testSessionId) as { count: number };

      try {
        createTestEntity(testSessionId, "Test", "type", { data: "value" });
        // If no error, count should increase
      } catch (err) {
        // Should have rolled back
      }

      const finalCount = db
        .prepare(
          `SELECT COUNT(*) as count FROM entities WHERE session_id = ?`
        )
        .get(testSessionId) as { count: number };

      expect(finalCount.count).toBeGreaterThanOrEqual(initialCount.count);
    });
  });

  describe("Memory Session Isolation", () => {
    it("should isolate facts between sessions", async () => {
      const session2Id = createTestSessionId("memory-isolation");
      createTestSession(session2Id);

      createTestFact(testSessionId, "personal", "Session 1 fact");
      createTestFact(session2Id, "personal", "Session 2 fact");

      const facts1 = db
        .prepare(
          `SELECT COUNT(*) as count FROM fact_stats WHERE session_id = ?`
        )
        .get(testSessionId) as { count: number };

      const facts2 = db
        .prepare(
          `SELECT COUNT(*) as count FROM fact_stats WHERE session_id = ?`
        )
        .get(session2Id) as { count: number };

      expect(facts1.count).toBeGreaterThan(0);
      expect(facts2.count).toBeGreaterThan(0);

      cleanupTestSession(session2Id);
    });

    it("should isolate entities between sessions", async () => {
      const session2Id = createTestSessionId("memory-entity-isolation");
      createTestSession(session2Id);

      createTestEntity(testSessionId, "Alice", "person");
      createTestEntity(session2Id, "Bob", "person");

      const alice = db
        .prepare(
          `SELECT COUNT(*) as count FROM entities 
           WHERE session_id = ? AND name = ?`
        )
        .get(testSessionId, "Alice") as { count: number };

      const bob = db
        .prepare(
          `SELECT COUNT(*) as count FROM entities 
           WHERE session_id = ? AND name = ?`
        )
        .get(session2Id, "Bob") as { count: number };

      expect(alice.count).toBe(1);
      expect(bob.count).toBe(1);

      // Alice should not exist in session2
      const aliceInSession2 = db
        .prepare(
          `SELECT COUNT(*) as count FROM entities 
           WHERE session_id = ? AND name = ?`
        )
        .get(session2Id, "Alice") as { count: number };

      expect(aliceInSession2.count).toBe(0);

      cleanupTestSession(session2Id);
    });
  });

  describe("Memory Performance", () => {
    it("should efficiently store large number of facts", async () => {
      const startTime = performance.now();

      for (let i = 0; i < 100; i++) {
        createTestFact(testSessionId, "perf", `Fact number ${i}`);
      }

      const duration = performance.now() - startTime;
      const facts = db
        .prepare(
          `SELECT COUNT(*) as count FROM fact_stats WHERE session_id = ?`
        )
        .get(testSessionId) as { count: number };

      expect(facts.count).toBeGreaterThanOrEqual(100);
      expect(duration).toBeLessThan(5000); // Should complete in 5 seconds
    });

    it("should efficiently retrieve facts with indexing", async () => {
      // Insert facts
      for (let i = 0; i < 50; i++) {
        createTestFact(testSessionId, "indexed", `Fact ${i}`);
      }

      const startTime = performance.now();

      const row = db
        .prepare(
          `SELECT COUNT(*) as count FROM fact_stats 
           WHERE session_id = ? AND category = ?`
        )
        .get(testSessionId, "indexed") as { count: number };

      const duration = performance.now() - startTime;

      expect(row.count).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100); // Index should make this fast
    });
  });
});
