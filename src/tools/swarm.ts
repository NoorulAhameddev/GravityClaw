import type { Tool } from "./index.ts";
import { AgentSwarm } from "../agents/swarm.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("swarm-tools");

/**
 * Tool to spawn a specialized agent
 * @param role - Agent role (researcher, coder, reviewer, summarizer)
 * @param task - Task for the agent
 * @returns Session ID of the spawned agent
 */
export const spawnAgentTool: Tool = {
  name: "spawn_agent",
  description:
    "Spawn a specialized agent to work on a specific task. The agent will be initialized with a role-specific system prompt and work independently. Available roles: researcher, coder, reviewer, summarizer.",
  inputSchema: {
    type: "object",
    properties: {
      role: {
        type: "string",
        description: "Agent role: researcher, coder, reviewer, or summarizer",
        enum: ["researcher", "coder", "reviewer", "summarizer"],
      },
      task: {
        type: "string",
        description: "Task or goal for the agent to accomplish",
      },
      parentSessionId: {
        type: "string",
        description: "Parent session ID for tracking swarm membership",
      },
    },
    required: ["role", "task", "parentSessionId"],
  },
  async execute(input: Record<string, unknown>): Promise<string> {
    const role = String(input.role || "researcher");
    const task = String(input.task || "");
    const parentSessionId = String(input.parentSessionId || "");

    if (!task || !parentSessionId) {
      return JSON.stringify({
        success: false,
        error: "task and parentSessionId are required",
      });
    }

    if (!["researcher", "coder", "reviewer", "summarizer"].includes(role)) {
      return JSON.stringify({
        success: false,
        error: `Invalid role: ${role}. Must be one of: researcher, coder, reviewer, summarizer`,
      });
    }

    try {
      const swarm = new AgentSwarm(parentSessionId, {
        numAgents: 1,
        roles: [role as any],
        maxConcurrency: 1,
      });

      const sessionId = await swarm.spawnAgent(role, task);

      log.info(`Spawned agent with session ID: ${sessionId}`);

      return JSON.stringify({
        success: true,
        sessionId,
        role,
        message: `Agent spawned successfully`,
      });
    } catch (error) {
      log.error(`Error spawning agent: ${error}`);
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};

/**
 * Tool to aggregate results from multiple agents
 * @param sessionIds - Array of child agent session IDs
 * @param parentSessionId - Parent session ID
 * @returns Aggregated result
 */
export const aggregateResultsTool: Tool = {
  name: "aggregate_results",
  description:
    "Aggregate and synthesize results from multiple child agents into a cohesive summary. Takes an array of agent session IDs and produces a unified result.",
  inputSchema: {
    type: "object",
    properties: {
      sessionIds: {
        type: "array",
        items: { type: "string" },
        description: "Array of child agent session IDs to aggregate",
      },
      parentSessionId: {
        type: "string",
        description: "Parent session ID for context",
      },
    },
    required: ["sessionIds", "parentSessionId"],
  },
  async execute(input: Record<string, unknown>): Promise<string> {
    const sessionIds = Array.isArray(input.sessionIds)
      ? (input.sessionIds as string[])
      : [];
    const parentSessionId = String(input.parentSessionId || "");

    if (sessionIds.length === 0) {
      return JSON.stringify({
        success: false,
        error: "sessionIds array cannot be empty",
      });
    }

    if (!parentSessionId) {
      return JSON.stringify({
        success: false,
        error: "parentSessionId is required",
      });
    }

    try {
      const swarm = new AgentSwarm(parentSessionId, {
        numAgents: sessionIds.length,
        roles: ["researcher"],
        maxConcurrency: 1,
      });

      const aggregatedResult = await swarm.aggregateResults(sessionIds);

      log.info(`Aggregated results from ${sessionIds.length} agents`);

      return JSON.stringify({
        success: true,
        aggregatedResult,
        sourceSessionCount: sessionIds.length,
      });
    } catch (error) {
      log.error(`Error aggregating results: ${error}`);
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};
