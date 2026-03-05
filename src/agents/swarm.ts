import { db } from "../db.ts";
import { createLogger } from "../logger.ts";
import { getProvider } from "../llm/index.ts";
import { addUserMessage, addAssistantMessage, getHistory } from "../llm/index.ts";
import { config } from "../config.ts";
import crypto from "crypto";

const log = createLogger("swarm");

/**
 * Configuration for an agent swarm
 */
export interface SwarmConfig {
  /**
   * Number of agents to spawn in the swarm
   */
  numAgents: number;

  /**
   * Roles for agents: researcher, coder, reviewer, summarizer
   */
  roles: ("researcher" | "coder" | "reviewer" | "summarizer")[];

  /**
   * Maximum number of concurrent agents running
   */
  maxConcurrency: number;
}

/**
 * System prompts for each agent role
 */
const ROLE_PROMPTS: Record<string, string> = {
  researcher: `You are a research expert with deep analytical skills. Your role is to:
- Thoroughly analyze problems and research areas
- Find patterns and connections
- Provide well-reasoned insights based on available information
- Question assumptions and validate findings
- Present findings clearly with supporting evidence

When tasked with a research goal, break it down, investigate systematically, and provide comprehensive analysis.`,

  coder: `You are an expert programmer with extensive knowledge across multiple languages and frameworks. Your role is to:
- Write clean, efficient, and well-documented code
- Solve programming problems with elegant solutions
- Explain code logic clearly
- Consider edge cases and error handling
- Follow best practices and design patterns

When tasked with a coding goal, implement it thoroughly, test your solution, and provide clear explanations.`,

  reviewer: `You are a thorough code reviewer and quality assurance specialist. Your role is to:
- Analyze code for correctness, efficiency, and maintainability
- Identify bugs, security issues, and performance problems
- Suggest improvements and refactoring opportunities
- Provide constructive feedback with clear reasoning
- Ensure code meets standards and best practices

When reviewing code or work, be critical but constructive, and provide actionable feedback.`,

  summarizer: `You are an excellent summarizer and communicator. Your role is to:
- Distill complex information into clear, concise summaries
- Identify and communicate the key points
- Organize information logically
- Adapt summaries for different audiences
- Highlight important conclusions and recommendations

When summarizing, focus on clarity and relevance, ensuring nothing critical is lost.`,
};

interface SwarmResult {
  sessionId: string;
  role: string;
  content: string;
  status: "completed" | "failed" | "timeout";
}

/**
 * Agent Swarm - coordinates multiple specialized agents to work on complex tasks
 */
export class AgentSwarm {
  private parentSessionId: string;
  private config: SwarmConfig;

  constructor(parentSessionId: string, config: SwarmConfig) {
    this.parentSessionId = parentSessionId;
    this.config = config;
  }

  /**
   * Spawn a new agent with a specific role
   * @param role - Agent role (researcher, coder, reviewer, summarizer)
   * @param task - Task for the agent to complete
   * @returns Session ID of the spawned agent
   */
  async spawnAgent(role: string, task: string): Promise<string> {
    const sessionId = `${this.parentSessionId}-${role}-${crypto.randomBytes(4).toString("hex")}`;
    const timestamp = new Date().toISOString();

    try {
      // Create database entry for swarm tracking
      db.prepare(
        `INSERT INTO agent_swarms (id, parent_session_id, child_session_id, role, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        this.parentSessionId,
        sessionId,
        role,
        "spawned",
        timestamp
      );

      log.info(`Spawned ${role} agent: ${sessionId} for task: "${task}"`);

      // Get system prompt for this role
      const systemPrompt = ROLE_PROMPTS[role] || ROLE_PROMPTS.researcher;

      // Initialize the agent's conversation
      addUserMessage(sessionId, task);

      // Get the provider and call LLM with role-specific system prompt
      const provider = getProvider();

      // Add assistant's initial response
      const systemPromptContent: string = (ROLE_PROMPTS[role] || ROLE_PROMPTS.researcher) ?? "You are a helpful assistant.";
      const response = await provider.chat(
        [
          { role: "system" as const, content: systemPromptContent },
          { role: "user" as const, content: task },
        ],
        []
      );

      if (response.text) {
        addAssistantMessage(sessionId, response.text);

        // Update status to completed
        db.prepare(`UPDATE agent_swarms SET status = ? WHERE child_session_id = ?`).run(
          "completed",
          sessionId
        );
      }

      return sessionId;
    } catch (error) {
      log.error(`Error spawning ${role} agent:`, error);
      db.prepare(`UPDATE agent_swarms SET status = ? WHERE child_session_id = ?`).run(
        "failed",
        sessionId
      );
      throw error;
    }
  }

  /**
   * Orchestrate a swarm to work on a main task with decomposed subtasks
   * @param mainTask - The overall goal/task
   * @param subTasks - Array of subtasks to distribute among agents
   * @returns Object containing results from all agents
   */
  async orchestrate(
    mainTask: string,
    subTasks: string[]
  ): Promise<{
    mainTask: string;
    agentResults: SwarmResult[];
    aggregatedResult: string;
  }> {
    log.info(`Orchestrating swarm for main task: "${mainTask}" with ${subTasks.length} subtasks`);

    // Record the swarm orchestration task
    addUserMessage(this.parentSessionId, `Main task: ${mainTask}\n\nSubtasks: ${subTasks.join(", ")}`);

    const agentResults: SwarmResult[] = [];
    const roles = this.config.roles;

    // Distribute subtasks among available roles
    const promises: Promise<void>[] = [];
    let activeAgents = 0;

    for (let i = 0; i < subTasks.length; i++) {
      const subtask = subTasks[i]!;
      const role = roles[i % roles.length]!;

      // Wait if we've hit max concurrency
      while (activeAgents >= this.config.maxConcurrency) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      activeAgents++;

      const promise = (async () => {
        try {
          const sessionId = await this.spawnAgent(role, subtask);
          const history = getHistory(sessionId);
          const lastMessage = history[history.length - 1];
          const content = lastMessage?.content || "";

          agentResults.push({
            sessionId,
            role,
            content: typeof content === "string" ? content : JSON.stringify(content),
            status: "completed",
          });
        } catch (error) {
          log.error(`Error in swarm agent: ${error}`);
          agentResults.push({
            sessionId: `${this.parentSessionId}-${role}-error`,
            role,
            content: `Error: ${error instanceof Error ? error.message : String(error)}`,
            status: "failed",
          });
        } finally {
          activeAgents--;
        }
      })();

      promises.push(promise);
    }

    // Wait for all agents to complete (with timeout)
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error("Swarm orchestration timeout")), 30000);
    });

    try {
      await Promise.race([Promise.all(promises), timeoutPromise]);
    } catch (error) {
      log.warn(`Swarm orchestration timeout or error: ${error}`);
    }

    // Aggregate results
    const aggregatedResult = await this.aggregateResults(
      agentResults.map((r) => r.sessionId)
    );

    log.info(`Swarm orchestration completed with ${agentResults.length} agent results`);

    return {
      mainTask,
      agentResults,
      aggregatedResult,
    };
  }

  /**
   * Aggregate results from multiple child agents
   * @param sessionIds - Array of child agent session IDs
   * @returns Aggregated result from all agents
   */
  async aggregateResults(sessionIds: string[]): Promise<string> {
    log.info(`Aggregating results from ${sessionIds.length} agents`);

    // Collect all agent outputs
    const agentOutputs: string[] = [];

    for (const sessionId of sessionIds) {
      try {
        const history = getHistory(sessionId);
        const messages = history
          .filter((msg) => msg.role === "assistant")
          .map((msg) => {
            if (typeof msg.content === "string") {
              return msg.content;
            }
            return JSON.stringify(msg.content);
          });

        if (messages.length > 0) {
          agentOutputs.push(`Session ${sessionId}:\n${messages.join("\n")}`);
        }
      } catch (error) {
        log.warn(`Could not retrieve history for ${sessionId}: ${error}`);
      }
    }

    if (agentOutputs.length === 0) {
      return "No results to aggregate from agents.";
    }

    // Use the summarizer role to aggregate the results
    const aggregationPrompt = `You are an excellent summarizer. Synthesize the following results from multiple specialist agents into a cohesive, well-organized summary:

${agentOutputs.join("\n\n---\n\n")}

Provide a comprehensive synthesis that:
1. Integrates insights from all agents
2. Highlights key findings and conclusions
3. Organizes information logically
4. Presents actionable recommendations if applicable`;

    try {
      const provider = getProvider();
      const summarizerPrompt: string = ROLE_PROMPTS.summarizer ?? "You are a summarizer agent that aggregates results from multiple agents.";
      const response = await provider.chat(
        [
          {
            role: "system" as const,
            content: summarizerPrompt,
          },
          {
            role: "user" as const,
            content: aggregationPrompt,
          },
        ],
        []
      );

      if (response.text) {
        addAssistantMessage(this.parentSessionId, response.text);
        return response.text;
      }

      return "Could not generate aggregated result.";
    } catch (error) {
      log.error(`Error aggregating results: ${error}`);
      return `Error during aggregation: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
