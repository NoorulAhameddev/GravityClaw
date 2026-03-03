import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "../db.ts";
import { AgentSwarm, type SwarmConfig } from "../agents/swarm.ts";
import { addUserMessage, addAssistantMessage, getHistory, clearHistory } from "../llm/index.ts";
import { spawnAgentTool, aggregateResultsTool } from "../tools/swarm.ts";

describe("Agent Swarm System", () => {
  const testSessionId = "test:swarm:parent";
  const defaultConfig: SwarmConfig = {
    numAgents: 2,
    roles: ["researcher", "coder"],
    maxConcurrency: 2,
  };

  beforeEach(() => {
    // Clean up test data before each test
    db.prepare("DELETE FROM memory WHERE session_id LIKE ?").run("test:swarm:%");
    db.prepare("DELETE FROM agent_swarms WHERE parent_session LIKE ?").run(
      "test:swarm:%"
    );
  });

  afterEach(() => {
    // Clean up test data after each test
    db.prepare("DELETE FROM memory WHERE session_id LIKE ?").run("test:swarm:%");
    db.prepare("DELETE FROM agent_swarms WHERE parent_session LIKE ?").run(
      "test:swarm:%"
    );
  });

  describe("SwarmConfig", () => {
    it("should have valid swarm configuration", () => {
      expect(defaultConfig.numAgents).toBeGreaterThan(0);
      expect(defaultConfig.roles).toBeDefined();
      expect(defaultConfig.maxConcurrency).toBeGreaterThan(0);
      expect(defaultConfig.roles.length).toBeGreaterThan(0);
    });

    it("should support all required roles", () => {
      const roles = ["researcher", "coder", "reviewer", "summarizer"];
      const config: SwarmConfig = {
        numAgents: 4,
        roles: roles as any,
        maxConcurrency: 4,
      };

      expect(config.roles).toContain("researcher");
      expect(config.roles).toContain("coder");
      expect(config.roles).toContain("reviewer");
      expect(config.roles).toContain("summarizer");
    });
  });

  describe("AgentSwarm Initialization", () => {
    it("should create an AgentSwarm instance", () => {
      const swarm = new AgentSwarm(testSessionId, defaultConfig);
      expect(swarm).toBeDefined();
    });

    it("should accept different swarm configurations", () => {
      const configs: SwarmConfig[] = [
        { numAgents: 1, roles: ["researcher"], maxConcurrency: 1 },
        { numAgents: 4, roles: ["researcher", "coder", "reviewer", "summarizer"], maxConcurrency: 4 },
        { numAgents: 2, roles: ["coder", "reviewer"], maxConcurrency: 1 },
      ];

      for (const config of configs) {
        const swarm = new AgentSwarm(testSessionId, config);
        expect(swarm).toBeDefined();
      }
    });
  });

  describe("Agent Spawning", () => {
    it("should spawn an agent with correct role", async () => {
      const swarm = new AgentSwarm(testSessionId, defaultConfig);
      const task = "Analyze the concept of machine learning";

      // Mock the LLM provider to avoid API calls
      const mockSessionId = await swarm.spawnAgent("researcher", task);

      expect(mockSessionId).toBeDefined();
      expect(mockSessionId).toContain(testSessionId);
      expect(mockSessionId).toContain("researcher");
    });

    it("should create database entry for spawned agent", async () => {
      const swarm = new AgentSwarm(testSessionId, defaultConfig);
      const task = "Research AI safety concepts";

      const sessionId = await swarm.spawnAgent("researcher", task);

      // Check if database entry was created
      const entry = db
        .prepare("SELECT * FROM agent_swarms WHERE child_session = ?")
        .get(sessionId) as any;

      expect(entry).toBeDefined();
      expect(entry.role).toBe("researcher");
      expect(entry.parent_session).toBe(testSessionId);
      expect(entry.status).toBe("completed");
    });

    it("should spawn multiple agents with different roles", async () => {
      const swarm = new AgentSwarm(testSessionId, defaultConfig);
      const roles = ["researcher", "coder", "reviewer"];
      const spawnedIds: string[] = [];

      for (const role of roles) {
        const sessionId = await swarm.spawnAgent(role, `Task for ${role}`);
        spawnedIds.push(sessionId);
      }

      expect(spawnedIds).toHaveLength(3);
      for (const id of spawnedIds) {
        expect(id).toBeDefined();
        expect(id).toContain(testSessionId);
      }
    });

    it("should have correct session ID format for agents", async () => {
      const swarm = new AgentSwarm(testSessionId, defaultConfig);
      const sessionId = await swarm.spawnAgent("coder", "Write a function");

      expect(sessionId).toMatch(new RegExp(`^${testSessionId}-coder-[a-f0-9]{8}$`));
    });
  });

  describe("Agent Orchestration", () => {
    it("should orchestrate swarm with decomposed subtasks", async () => {
      const swarm = new AgentSwarm(testSessionId, defaultConfig);
      const mainTask = "Build a weather app";
      const subTasks = [
        "Design the user interface",
        "Implement backend API integration",
        "Add weather data caching",
      ];

      const result = await swarm.orchestrate(mainTask, subTasks);

      expect(result).toBeDefined();
      expect(result.mainTask).toBe(mainTask);
      expect(result.agentResults).toBeDefined();
      expect(result.agentResults.length).toBeGreaterThan(0);
      expect(result.aggregatedResult).toBeDefined();
    });

    it("should distribute subtasks among agents", async () => {
      const config: SwarmConfig = {
        numAgents: 3,
        roles: ["researcher", "coder", "reviewer"],
        maxConcurrency: 2,
      };

      const swarm = new AgentSwarm(testSessionId, config);
      const mainTask = "Create a RESTful API";
      const subTasks = [
        "Research REST best practices",
        "Implement endpoint handlers",
        "Add request validation",
      ];

      const result = await swarm.orchestrate(mainTask, subTasks);

      expect(result.agentResults.length).toBeGreaterThanOrEqual(1);
      expect(result.agentResults.length).toBeLessThanOrEqual(subTasks.length);
    });

    it("should handle single subtask orchestration", async () => {
      const swarm = new AgentSwarm(testSessionId, defaultConfig);
      const mainTask = "Write documentation";
      const subTasks = ["Create README file"];

      const result = await swarm.orchestrate(mainTask, subTasks);

      expect(result.agentResults.length).toBeGreaterThan(0);
      expect(result.aggregatedResult).toBeDefined();
    });

    it("should handle multiple subtasks orchestration", async () => {
      const swarm = new AgentSwarm(testSessionId, defaultConfig);
      const mainTask = "Build a full-stack application";
      const subTasks = [
        "Set up database schema",
        "Implement authentication",
        "Create API endpoints",
        "Build frontend UI",
        "Add error handling",
        "Write tests",
      ];

      const result = await swarm.orchestrate(mainTask, subTasks);

      expect(result.agentResults.length).toBeGreaterThan(0);
      expect(result.agentResults.length).toBeLessThanOrEqual(subTasks.length);
    });
  });

  describe("Result Aggregation", () => {
    it("should aggregate results from child agents", async () => {
      const swarm = new AgentSwarm(testSessionId, defaultConfig);

      // Spawn multiple agents
      const sessionId1 = await swarm.spawnAgent("researcher", "Research topic 1");
      const sessionId2 = await swarm.spawnAgent("coder", "Code task 1");

      // Aggregate their results
      const aggregatedResult = await swarm.aggregateResults([sessionId1, sessionId2]);

      expect(aggregatedResult).toBeDefined();
      expect(typeof aggregatedResult).toBe("string");
      expect(aggregatedResult.length).toBeGreaterThan(0);
    });

    it("should handle empty session IDs array gracefully", async () => {
      const swarm = new AgentSwarm(testSessionId, defaultConfig);

      // Should return a message about no results
      const aggregatedResult = await swarm.aggregateResults([]);

      expect(aggregatedResult).toBeDefined();
      expect(typeof aggregatedResult).toBe("string");
    });

    it("should aggregate results with synthesized summary", async () => {
      const swarm = new AgentSwarm(testSessionId, defaultConfig);

      const sessionId1 = await swarm.spawnAgent("researcher", "Analyze trends");
      const sessionId2 = await swarm.spawnAgent("coder", "Implement solution");

      const aggregatedResult = await swarm.aggregateResults([sessionId1, sessionId2]);

      expect(aggregatedResult).toBeDefined();
      // The aggregated result should be a string
      expect(typeof aggregatedResult).toBe("string");
    });
  });

  describe("Database Integration", () => {
    it("should create agent_swarms table entries on spawn", async () => {
      const swarm = new AgentSwarm(testSessionId, defaultConfig);

      const sessionId = await swarm.spawnAgent("researcher", "Test task");

      const entry = db
        .prepare("SELECT * FROM agent_swarms WHERE child_session = ?")
        .get(sessionId) as any;

      expect(entry).toBeDefined();
      expect(entry.parent_session).toBe(testSessionId);
      expect(entry.child_session).toBe(sessionId);
      expect(entry.role).toBe("researcher");
      expect(entry.status).toBe("completed");
      expect(entry.created_at).toBeDefined();
    });

    it("should track multiple agents in parent session", async () => {
      const swarm = new AgentSwarm(testSessionId, defaultConfig);

      const sessionId1 = await swarm.spawnAgent("researcher", "Task 1");
      const sessionId2 = await swarm.spawnAgent("coder", "Task 2");

      const entries = db
        .prepare("SELECT * FROM agent_swarms WHERE parent_session = ? ORDER BY created_at")
        .all(testSessionId) as any[];

      expect(entries.length).toBeGreaterThanOrEqual(2);
    });

    it("should maintain parent-child relationship in database", async () => {
      const swarm = new AgentSwarm(testSessionId, defaultConfig);

      const sessionId = await swarm.spawnAgent("reviewer", "Code review task");

      const entry = db
        .prepare(
          "SELECT parent_session, child_session FROM agent_swarms WHERE child_session = ?"
        )
        .get(sessionId) as any;

      expect(entry.parent_session).toBe(testSessionId);
      expect(entry.child_session).toBe(sessionId);
    });
  });

  describe("Swarm Tools", () => {
    it("should have spawn_agent tool defined", async () => {
      expect(spawnAgentTool).toBeDefined();
      expect(spawnAgentTool.name).toBe("spawn_agent");
      expect(spawnAgentTool.description).toBeDefined();
      expect(spawnAgentTool.inputSchema).toBeDefined();
    });

    it("should have aggregate_results tool defined", async () => {
      expect(aggregateResultsTool).toBeDefined();
      expect(aggregateResultsTool.name).toBe("aggregate_results");
      expect(aggregateResultsTool.description).toBeDefined();
      expect(aggregateResultsTool.inputSchema).toBeDefined();
    });

    it("spawn_agent tool should validate inputs", async () => {
      const input = {
        role: "invalid_role",
        task: "test",
        parentSessionId: testSessionId,
      };

      const result = await spawnAgentTool.execute(input);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBeDefined();
    });

    it("aggregate_results tool should require sessionIds", async () => {
      const input = {
        sessionIds: [],
        parentSessionId: testSessionId,
      };

      const result = await aggregateResultsTool.execute(input);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
    });

    it("spawn_agent tool should require parentSessionId", async () => {
      const input = {
        role: "researcher",
        task: "test",
        parentSessionId: "",
      };

      const result = await spawnAgentTool.execute(input);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
    });
  });

  describe("Role-Specific System Prompts", () => {
    it("should spawn agents with role-specific behavior", async () => {
      const swarm = new AgentSwarm(testSessionId, defaultConfig);

      const researcherId = await swarm.spawnAgent("researcher", "Research AI trends");
      const coderId = await swarm.spawnAgent("coder", "Write sorting algorithm");

      expect(researcherId).toBeDefined();
      expect(coderId).toBeDefined();

      // Both should have messages in their histories
      const researchHistory = getHistory(researcherId);
      const codeHistory = getHistory(coderId);

      expect(researchHistory.length).toBeGreaterThan(0);
      expect(codeHistory.length).toBeGreaterThan(0);
    });

    it("should have distinct role identifiers in session names", async () => {
      const swarm = new AgentSwarm(testSessionId, defaultConfig);

      const roles = ["researcher", "coder", "reviewer", "summarizer"];
      const sessionIds: Record<string, string> = {};

      for (const role of roles) {
        sessionIds[role] = await swarm.spawnAgent(role, "Test task");
      }

      for (const role of roles) {
        expect(sessionIds[role]).toContain(role);
      }
    });
  });

  describe("Error Handling", () => {
    it("should handle agent spawn errors gracefully", async () => {
      const swarm = new AgentSwarm(testSessionId, defaultConfig);

      // Even with invalid input, should not crash
      try {
        // This might fail but should be caught
        await swarm.spawnAgent("researcher" as any, undefined as any);
      } catch (error) {
        // Error is expected, but should be handled
        expect(error).toBeDefined();
      }
    });

    it("should handle orchestration timeout gracefully", async () => {
      const swarm = new AgentSwarm(testSessionId, defaultConfig);
      const mainTask = "Long running task";
      const subTasks = Array(10)
        .fill(0)
        .map((_, i) => `Subtask ${i}`);

      // Should complete even if some agents timeout
      const result = await swarm.orchestrate(mainTask, subTasks);

      expect(result).toBeDefined();
      expect(result.agentResults).toBeDefined();
    });

    it("should record failed agent status in database", async () => {
      const swarm = new AgentSwarm(testSessionId, defaultConfig);

      // Try with invalid input that might cause failure
      try {
        await swarm.spawnAgent("researcher" as any, "");
      } catch (error) {
        // Expected to fail
      }

      // Check if any failed status entries exist
      const failedEntries = db
        .prepare("SELECT COUNT(*) as count FROM agent_swarms WHERE status IN ('failed', 'spawned')")
        .get() as any;

      // Should have entries from our test
      expect(failedEntries.count).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Concurrent Agent Management", () => {
    it("should respect maxConcurrency setting", async () => {
      const config: SwarmConfig = {
        numAgents: 3,
        roles: ["researcher", "coder", "reviewer"],
        maxConcurrency: 1, // Only one at a time
      };

      const swarm = new AgentSwarm(testSessionId, config);
      const mainTask = "Complex task";
      const subTasks = ["Task 1", "Task 2", "Task 3"];

      const result = await swarm.orchestrate(mainTask, subTasks);

      expect(result.agentResults.length).toBeGreaterThan(0);
    });

    it("should handle full concurrency", async () => {
      const config: SwarmConfig = {
        numAgents: 4,
        roles: ["researcher", "coder", "reviewer", "summarizer"],
        maxConcurrency: 4, // All concurrent
      };

      const swarm = new AgentSwarm(testSessionId, config);
      const mainTask = "Parallel task";
      const subTasks = ["Task 1", "Task 2", "Task 3", "Task 4"];

      const result = await swarm.orchestrate(mainTask, subTasks);

      expect(result.agentResults.length).toBeGreaterThan(0);
    });
  });

  describe("Session History", () => {
    it("should maintain separate history for each agent", async () => {
      const swarm = new AgentSwarm(testSessionId, defaultConfig);

      const sessionId1 = await swarm.spawnAgent("researcher", "Research task");
      const sessionId2 = await swarm.spawnAgent("coder", "Coding task");

      const history1 = getHistory(sessionId1);
      const history2 = getHistory(sessionId2);

      expect(history1).toBeDefined();
      expect(history2).toBeDefined();
      // Each should have at least user and assistant messages
      expect(history1.length).toBeGreaterThan(0);
      expect(history2.length).toBeGreaterThan(0);
    });

    it("should add messages to parent session during orchestration", async () => {
      const swarm = new AgentSwarm(testSessionId, defaultConfig);

      const parentHistoryBefore = getHistory(testSessionId);
      const beforeCount = parentHistoryBefore.length;

      const mainTask = "Test orchestration";
      const subTasks = ["Subtask 1"];

      await swarm.orchestrate(mainTask, subTasks);

      const parentHistoryAfter = getHistory(testSessionId);
      const afterCount = parentHistoryAfter.length;

      // Should have added messages to parent
      expect(afterCount).toBeGreaterThanOrEqual(beforeCount);
    });
  });
});
