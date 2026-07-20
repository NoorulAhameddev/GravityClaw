import { db } from "../db.ts";
import { createLogger } from "../logger.ts";
import { getProvider } from "../llm/index.ts";
import { addUserMessage, addAssistantMessage } from "../llm/index.ts";
import { config } from "../config.ts";
import type { OrchestratorDependencies } from "../llm/orchestrator.ts";
import crypto from "crypto";
import { createSessionDB } from "../db/session-isolation.ts";

const log = createLogger("swarm");

/**
 * Generate fallback response when LLM fails
 */
function generateFallbackResponse(role: string, task: string): string {
  const fallbacks: Record<string, string> = {
    researcher: `Based on my analysis of "${task}":\n\nThis task requires research and investigation. Given the current context, I would recommend:\n\n1. Identifying key information sources\n2. Breaking down the problem into smaller components\n3. Analyzing available data and patterns\n\nNote: This is a fallback response as the LLM service was unavailable.`,
    
    coder: `For the task "${task}":\n\nI would approach this by:\n1. Understanding the requirements\n2. Designing a solution structure\n3. Implementing the code with proper error handling\n4. Testing the implementation\n\nNote: This is a fallback response as the LLM service was unavailable.`,
    
    reviewer: `Reviewing the task "${task}":\n\nKey considerations:\n- Code correctness and efficiency\n- Edge cases and error handling  \n- Security and performance\n- Best practices compliance\n\nNote: This is a fallback response as the LLM service was unavailable.`,
    
    summarizer: `Summary for task "${task}":\n\nThe swarm has analyzed this task and identified key points that need attention. The multi-agent approach allows for comprehensive coverage of different aspects of this request.\n\nNote: This is a fallback response as the LLM service was unavailable.`,
  };
  
  return fallbacks[role] || `Task "${task}" processed. Note: This is a fallback response as the LLM service was unavailable.`;
}

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

export interface SwarmResult {
  sessionId: string;
  role: string;
  content: string;
  status: "completed" | "failed" | "timeout" | "degraded";
}

interface SpawnResult {
  sessionId: string;
  content: string;
  status: "completed" | "failed" | "degraded";
}

// Legacy return type for backward compatibility with tests
type LegacySpawnResult = string;

/**
 * Agent Swarm - coordinates multiple specialized agents to work on complex tasks
 */
const MAX_SWARM_ITERATIONS = 5;

export class AgentSwarm {
  private parentSessionId: string;
  private config: SwarmConfig;
  private parentDB: ReturnType<typeof createSessionDB>;
  private iterationCount = 0;

  constructor(parentSessionId: string, config: SwarmConfig) {
    this.parentSessionId = parentSessionId;
    this.config = config;
    this.parentDB = createSessionDB(parentSessionId);
  }

  private get parentOrchestratorDeps(): OrchestratorDependencies {
    return {
      db: this.parentDB as any,
      config,
    };
  }

  /**
   * Spawn a new agent with a specific role
   * @param role - Agent role (researcher, coder, reviewer, summarizer)
   * @param task - Task for the agent to complete
   * @returns SpawnResult containing session ID, content, and status
   */
  async spawnAgent(role: string, task: string): Promise<SpawnResult> {
    this.iterationCount++;
    if (this.iterationCount > MAX_SWARM_ITERATIONS) {
        log.warn(`Swarm iteration cap reached (${MAX_SWARM_ITERATIONS})`);
        return {
            sessionId: 'capped',
            content: 'Swarm iteration limit reached to prevent runaway loops.',
            status: 'degraded'
        };
    }
    // Mock budget of 100 for now
    return this.executeAgentWithGuardrails(role, task, 100);
  }

  async executeAgentWithGuardrails(role: string, task: string, budget: number): Promise<SpawnResult> {
    const childSessionId = `${this.parentSessionId}-${role}-${crypto.randomBytes(4).toString("hex")}`;
    const timestamp = new Date().toISOString();
    
    const truncatedTask = task.length > 4000 ? task.substring(0, 4000) + '... [TRUNCATED]' : task;
    
    if (budget <= 0) {
        return { sessionId: childSessionId, content: 'Budget exhausted', status: 'degraded' };
    }
    
    // Create session-scoped DB for child
    const childDB = createSessionDB(childSessionId, this.parentSessionId);

    try {
      // Use child's session-scoped DB
      childDB.prepare(
        `INSERT INTO agent_swarms (id, parent_session_id, child_session_id, role, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        this.parentSessionId,
        childSessionId,
        role,
        "spawned",
        timestamp
      );

      const taskStr = typeof task === "string" ? task : String(task ?? "");
      log.info(`Spawned ${role} agent: ${childSessionId} for task: "${taskStr}"`);

      // Get system prompt for this role
      const systemPrompt = ROLE_PROMPTS[role] || ROLE_PROMPTS.researcher;

      // Create session-scoped orchestrator deps
      const childOrchestratorDeps: OrchestratorDependencies = {
        db: childDB as any,
        config,
      };

      // Initialize the agent's conversation
      addUserMessage(childSessionId, truncatedTask, childOrchestratorDeps);

      // Get the provider and call LLM with role-specific system prompt
      const provider = getProvider();

      // Add assistant's initial response
      const systemPromptContent: string = (ROLE_PROMPTS[role] || ROLE_PROMPTS.researcher) ?? "You are a helpful assistant.";
      log.debug(`[${role}] Calling LLM with task: ${taskStr.substring(0, 50)}...`);
      
      const response = await provider.chat(
        [
          { role: "system" as const, content: systemPromptContent },
          { role: "user" as const, content: truncatedTask },
        ],
        [],
        { maxTokens: 500 } // Output limit
      );

      log.debug(`[${role}] LLM response: ${response.text?.substring(0, 100) ?? 'empty'} | stopReason: ${response.stopReason}`);

      let content = "";
      if (response.text && response.text.trim()) {
        content = response.text;
        addAssistantMessage(childSessionId, response.text, childOrchestratorDeps);

        // Update status to completed
        childDB.prepare(`UPDATE agent_swarms SET status = ? WHERE child_session_id = ?`).run(
          "completed",
          childSessionId
        );
      } else {
        log.warn(`No response text from LLM for agent ${role}, session: ${childSessionId}, stopReason: ${response.stopReason}`);
        
        // Generate fallback content based on role
        const fallbackContent = `⚠️ [FALLBACK RESPONSE — LLM unavailable]\n\n${generateFallbackResponse(role, task)}`;
        content = fallbackContent;
        addAssistantMessage(childSessionId, fallbackContent, childOrchestratorDeps);
        
        childDB.prepare(`UPDATE agent_swarms SET status = ? WHERE child_session_id = ?`).run(
          "degraded",
          childSessionId
        );
      }

      return {
        sessionId: childSessionId,
        content,
        status: response.text?.trim() ? "completed" : "degraded",
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const errStack = error instanceof Error ? error.stack : '';
      log.error(`Error spawning ${role} agent: ${errMsg}\nStack: ${errStack}`);
      childDB.prepare(`UPDATE agent_swarms SET status = ? WHERE child_session_id = ?`).run(
        "failed",
        childSessionId
      );
      return {
        sessionId: childSessionId,
        content: `Error: ${errMsg}`,
        status: "failed",
      };
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
    addUserMessage(this.parentSessionId, `Main task: ${mainTask}\n\nSubtasks: ${subTasks.join(", ")}`, this.parentOrchestratorDeps);

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
        const result = await this.spawnAgent(role, subtask);
        
        agentResults.push({
          sessionId: result.sessionId,
          role,
          content: result.content,
          status: result.status,
        });
        
        activeAgents--;
      })();

      promises.push(promise);
    }

    // Wait for all agents to complete (with timeout)
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error("Swarm orchestration timeout")), 300000); // 5 minutes
    });

    try {
      await Promise.race([Promise.all(promises), timeoutPromise]);
    } catch (error) {
      log.warn(`Swarm orchestration timeout or error: ${error}`);
    }

    // Log agent results for debugging
    for (const r of agentResults) {
      log.info(`Agent result: role=${r.role}, status=${r.status}, content=${r.content?.substring(0, 100)}`);
    }

    // Aggregate results
    const aggregatedResult = await this.aggregateResults(agentResults);

    log.info(`Swarm orchestration completed with ${agentResults.length} agent results`);

    return {
      mainTask,
      agentResults,
      aggregatedResult,
    };
  }

  /**
   * Aggregate results from multiple child agents
   * @param results - Array of SwarmResult from spawned agents
   * @returns Aggregated result from all agents
   */
  async aggregateResults(results: SwarmResult[]): Promise<string> {
    log.info(`Aggregating results from ${results.length} agents`);

    // Collect all agent outputs directly from results
    const agentOutputs: string[] = [];

    for (const result of results) {
      if (result.status === "completed" && result.content) {
        agentOutputs.push(`Session ${result.sessionId} (${result.role}):\n${result.content}`);
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
        addAssistantMessage(this.parentSessionId, response.text, this.parentOrchestratorDeps);
        return response.text;
      }

      return "Could not generate aggregated result.";
    } catch (error) {
      log.error(`Error aggregating results: ${error}`);
      return `Error during aggregation: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
