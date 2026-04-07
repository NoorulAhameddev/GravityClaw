/**
 * Mesh Workflow System
 * 
 * Implements task decomposition and workflow execution with dependency management.
 * Generates DAGs (Directed Acyclic Graphs) from goals, validates them for cycles,
 * and executes tasks in topological order with isolated sessions per task.
 * Supports parallel execution of independent tasks.
 */

import { createLogger } from "../logger.ts";
import { db } from "../db.ts";
import { getProvider } from "../llm/index.ts";
import { addUserMessage, getHistory } from "../llm/index.ts";
import type { OrchestratorDependencies } from "../llm/orchestrator.ts";
import { runAgent } from "../agent.ts";
import { runWithConcurrencyLimit } from "../concurrency.ts";
import { container } from "../bootstrap.ts";
import { randomBytes } from "crypto";

const orchestratorDeps: OrchestratorDependencies = {
    db,
    config: container.config,
};

const log = createLogger("mesh");

/**
 * Configuration options for MeshWorkflow
 */
export interface MeshConfig {
  maxParallelTasks: number;
}

const DEFAULT_CONFIG: MeshConfig = {
  maxParallelTasks: 5,
};

/**
 * Generate a simple UUID-like string using crypto
 */
function generateId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Represents a single task in a workflow
 */
export interface WorkflowTask {
  id: string;
  description: string;
  dependsOn: string[]; // Array of task IDs this task depends on
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
}

/**
 * Represents a complete workflow DAG (Directed Acyclic Graph)
 */
export interface WorkflowDAG {
  goalDescription: string;
  tasks: WorkflowTask[];
}

/**
 * Validation result for a DAG
 */
export interface DAGValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Workflow execution result
 */
export interface WorkflowExecutionResult {
  workflowId: string;
  success: boolean;
  tasksCompleted: number;
  totalTasks: number;
  results: Map<string, string>;
  errors: Map<string, string>;
  executionStats: ExecutionStats;
}

/**
 * Execution statistics for parallel vs sequential tasks
 */
export interface ExecutionStats {
  parallelTasks: number;
  sequentialTasks: number;
  parallelTaskIds: string[];
  sequentialTaskIds: string[];
  maxParallelism: number;
  duration: number;
}

/**
 * Progress callback for workflow execution
 */
export type WorkflowProgressCallback = (progress: WorkflowProgress) => Promise<void>;

export interface WorkflowProgress {
  workflowId: string;
  currentTask: number;
  totalTasks: number;
  taskId: string;
  taskDescription: string;
  status: "running" | "completed" | "failed";
  message: string;
}

/**
 * MeshWorkflow class - Main implementation of task decomposition and execution
 */
export class MeshWorkflow {
  private config: MeshConfig;
  
  constructor(config: Partial<MeshConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Update configuration
   */
  setConfig(config: Partial<MeshConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Get current configuration
   */
  getConfig(): MeshConfig {
    return { ...this.config };
  }

  /**
   * Decompose a goal into a task DAG using LLM
   * @param goal - The high-level goal to decompose
   * @returns A WorkflowDAG with tasks and dependencies
   */
  async decompose(goal: string): Promise<WorkflowDAG> {
    log.info(`Decomposing goal: ${goal}`);

    const prompt = `You are a task decomposition expert. Break down the following goal into specific, actionable tasks with clear dependencies.

Goal: "${goal}"

Return a JSON response with the following structure:
{
  "goalDescription": "Clear restatement of the goal",
  "tasks": [
    {
      "id": "1",
      "description": "Clear task description",
      "dependsOn": []
    },
    {
      "id": "2", 
      "description": "Another task",
      "dependsOn": ["1"]
    }
  ]
}

Requirements:
- Each task should be a concrete, actionable subtask
- Dependencies should reference task IDs that must complete first
- Use topological ordering (tasks with no dependencies first)
- Minimize unnecessary dependencies
- Aim for 3-7 tasks for complex goals, 1-3 for simple ones
- Return ONLY valid JSON, no additional text`;

    try {
      // Create a temporary session for decomposition
      const decompositionSessionId = `mesh:decompose:${generateId()}`;
      addUserMessage(decompositionSessionId, prompt, orchestratorDeps);

      // Call LLM to generate DAG
      const provider = getProvider();
      const history = getHistory(decompositionSessionId, orchestratorDeps);

      const response = await provider.chat(
        [
          { role: "system" as const, content: "You are a JSON-generating task decomposition system. Always respond with valid JSON only." },
          ...history
        ],
        []
      );

      const content = response.text.trim();
      
      // Parse JSON response
      let dagData: any;
      try {
        dagData = JSON.parse(content);
      } catch {
        // Try to extract JSON from response if wrapped in markdown
        const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || 
                         content.match(/({[\s\S]*})/);
        if (jsonMatch) {
          dagData = JSON.parse(jsonMatch[1]!);
        } else {
          throw new Error("Failed to parse LLM response as JSON");
        }
      }

      // Validate and transform the response
      const tasks: WorkflowTask[] = (dagData.tasks || []).map((t: any) => ({
        id: String(t.id),
        description: String(t.description),
        dependsOn: (t.dependsOn || []).map((id: any) => String(id)),
        status: "pending" as const,
      }));

      const dag: WorkflowDAG = {
        goalDescription: dagData.goalDescription || goal,
        tasks,
      };

      log.info(`Generated DAG with ${tasks.length} tasks`);
      return dag;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`Failed to decompose goal: ${msg}`);
      throw new Error(`Decomposition failed: ${msg}`);
    }
  }

  /**
   * Validate a DAG for cycles and invalid references
   * @param dag - The DAG to validate
   * @returns Validation result with any errors found
   */
  validateDAG(dag: WorkflowDAG): DAGValidationResult {
    const errors: string[] = [];
    const taskIds = new Set(dag.tasks.map(t => t.id));

    // Check 1: All referenced task IDs exist
    for (const task of dag.tasks) {
      for (const depId of task.dependsOn) {
        if (!taskIds.has(depId)) {
          errors.push(`Task ${task.id} depends on non-existent task ${depId}`);
        }
      }
    }

    // Check 2: Cycle detection using DFS
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycleDFS = (taskId: string): boolean => {
      visited.add(taskId);
      recursionStack.add(taskId);

      const task = dag.tasks.find(t => t.id === taskId);
      if (!task) return false;

      for (const depId of task.dependsOn) {
        if (!visited.has(depId)) {
          if (hasCycleDFS(depId)) return true;
        } else if (recursionStack.has(depId)) {
          // Cycle detected
          errors.push(`Cycle detected: Task ${taskId} depends on Task ${depId} which eventually depends on Task ${taskId}`);
          return true;
        }
      }

      recursionStack.delete(taskId);
      return false;
    };

    // Run cycle detection for all tasks
    for (const task of dag.tasks) {
      if (!visited.has(task.id)) {
        hasCycleDFS(task.id);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Topologically sort tasks to determine execution order
   * @param dag - The DAG to sort
   * @returns Tasks in execution order (dependencies first)
   */
  topologicalSort(dag: WorkflowDAG): WorkflowTask[] {
    const sorted: WorkflowTask[] = [];
    const visited = new Set<string>();
    const taskMap = new Map(dag.tasks.map(t => [t.id, t]));

    const visit = (taskId: string): void => {
      if (visited.has(taskId)) return;
      visited.add(taskId);

      const task = taskMap.get(taskId);
      if (!task) return;

      // Visit dependencies first
      for (const depId of task.dependsOn) {
        visit(depId);
      }

      sorted.push(task);
    };

    // Visit all tasks
    for (const task of dag.tasks) {
      visit(task.id);
    }

    return sorted;
  }

  /**
   * Identify tasks that can run in parallel (no pending dependencies)
   * @param completedTaskIds - Set of task IDs that have completed
   * @param remainingTasks - Tasks still pending execution
   * @returns Array of tasks that can run in parallel
   */
  private getRunnableTasks(
    completedTaskIds: Set<string>,
    remainingTasks: WorkflowTask[]
  ): WorkflowTask[] {
    return remainingTasks.filter(task => 
      task.dependsOn.every(depId => completedTaskIds.has(depId))
    );
  }

  /**
   * Execute a single task
   */
  private async executeTask(
    task: WorkflowTask,
    workflowId: string,
    results: Map<string, string>,
    completedTaskIds: Set<string>,
    sortedTasks: WorkflowTask[],
    onProgress?: WorkflowProgressCallback
  ): Promise<{ success: boolean; error?: string }> {
    const taskNum = completedTaskIds.size + 1;

    try {
      if (onProgress) {
        await onProgress({
          workflowId,
          currentTask: taskNum,
          totalTasks: sortedTasks.length,
          taskId: task.id,
          taskDescription: task.description,
          status: "running",
          message: `Task ${taskNum}/${sortedTasks.length}: ${task.description}`,
        });
      }

      log.info(`Executing task ${task.id}: ${task.description}`);

      const taskSessionId = `${workflowId}:task:${task.id}`;

      let context = "";
      for (const depId of task.dependsOn) {
        const depResult = results.get(depId) || "";
        context += `\nResult from Task ${depId}:\n${depResult}\n`;
      }

      const prompt = `${context}\n\nNow complete this task:\n${task.description}`;
      
      log.info("DAG task execution (bounded)", {
        sessionId: taskSessionId,
        maxIterations: 3
      });
      
      const result = await runWithConcurrencyLimit(taskSessionId, () => runAgent({
        message: prompt,
        sessionId: taskSessionId,
        maxIterations: 3,
        onProgress: async (_text: string) => {},
        dependencies: {
          config: container.config,
          toolRegistry: container.toolRegistry,
          db: container.db,
        },
      }));

      results.set(task.id, result.text);
      completedTaskIds.add(task.id);

      db.prepare(
        `INSERT INTO workflow_tasks (id, workflow_id, task_id, description, depends_on, status, result, created_session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        generateId(),
        workflowId,
        task.id,
        task.description,
        JSON.stringify(task.dependsOn),
        "completed",
        result.text,
        taskSessionId
      );

      const progress = Math.round((completedTaskIds.size / sortedTasks.length) * 100);
      db.prepare(`UPDATE workflows SET progress = ? WHERE id = ?`).run(progress, workflowId);

      if (onProgress) {
        await onProgress({
          workflowId,
          currentTask: taskNum,
          totalTasks: sortedTasks.length,
          taskId: task.id,
          taskDescription: task.description,
          status: "completed",
          message: `Task ${taskNum}/${sortedTasks.length}: ${task.description} ✓`,
        });
      }

      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`Task ${task.id} failed: ${errorMsg}`);
      completedTaskIds.add(task.id);

      if (onProgress) {
        await onProgress({
          workflowId,
          currentTask: taskNum,
          totalTasks: sortedTasks.length,
          taskId: task.id,
          taskDescription: task.description,
          status: "failed",
          message: `Task ${taskNum}/${sortedTasks.length}: Failed - ${errorMsg}`,
        });
      }

      db.prepare(
        `INSERT INTO workflow_tasks (id, workflow_id, task_id, description, depends_on, status, result, created_session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        generateId(),
        workflowId,
        task.id,
        task.description,
        JSON.stringify(task.dependsOn),
        "failed",
        errorMsg,
        ""
      );

      return { success: false, error: errorMsg };
    }
  }

  /**
   * Execute a workflow DAG with progress updates and parallel execution
   * @param dag - The DAG to execute
   * @param onProgress - Callback for progress updates
   * @returns Execution result with completed tasks and results
   */
  async execute(
    dag: WorkflowDAG,
    onProgress?: WorkflowProgressCallback
  ): Promise<WorkflowExecutionResult> {
    const workflowId = generateId();
    const startTime = Date.now();

    log.info(`Starting workflow execution: ${workflowId} with maxParallelTasks=${this.config.maxParallelTasks}`);

    const tasksJson = JSON.stringify(dag.tasks);
    db.prepare(
      `INSERT INTO workflows (id, session_id, goal, tasks_json, status, progress, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      workflowId,
      "system",
      dag.goalDescription,
      tasksJson,
      "running",
      0,
      new Date().toISOString()
    );

    const sortedTasks = this.topologicalSort(dag);
    const results = new Map<string, string>();
    const errors = new Map<string, string>();
    const completedTaskIds = new Set<string>();
    const remainingTasks = [...sortedTasks];
    
    const parallelTaskIds: string[] = [];
    const sequentialTaskIds: string[] = [];
    let maxParallelism = 0;
    let currentParallelism = 0;

    while (remainingTasks.length > 0) {
      const runnableTasks = this.getRunnableTasks(completedTaskIds, remainingTasks);
      
      if (runnableTasks.length === 0 && remainingTasks.length > 0) {
        log.error("Deadlock detected: no runnable tasks but remaining tasks exist");
        for (const task of remainingTasks) {
          errors.set(task.id, "Deadlock: dependencies not satisfiable");
        }
        break;
      }

      const tasksToRun = runnableTasks.slice(0, this.config.maxParallelTasks);
      currentParallelism = Math.max(currentParallelism, tasksToRun.length);
      maxParallelism = Math.max(maxParallelism, currentParallelism);

      if (tasksToRun.length === 1) {
        sequentialTaskIds.push(tasksToRun[0]!.id);
        const result = await this.executeTask(
          tasksToRun[0]!,
          workflowId,
          results,
          completedTaskIds,
          sortedTasks,
          onProgress
        );
        if (!result.success && result.error) {
          errors.set(tasksToRun[0]!.id, result.error);
        }
      } else {
        for (const task of tasksToRun) {
          parallelTaskIds.push(task.id);
        }
        
        const taskPromises = tasksToRun.map(task => 
          this.executeTask(task, workflowId, results, completedTaskIds, sortedTasks, onProgress)
        );
        
        const taskResults = await Promise.allSettled(taskPromises);
        
        for (let i = 0; i < tasksToRun.length; i++) {
          const taskResult = taskResults[i];
          const task = tasksToRun[i]!;
          
          if (taskResult?.status === "rejected") {
            errors.set(task.id, taskResult.reason?.message || "Unknown error");
          } else if (taskResult?.value && !taskResult.value.success && taskResult.value.error) {
            errors.set(task.id, taskResult.value.error);
          }
        }
      }

      currentParallelism = 0;
      for (const task of runnableTasks) {
        const idx = remainingTasks.indexOf(task);
        if (idx !== -1) {
          remainingTasks.splice(idx, 1);
        }
      }
    }

    const duration = Date.now() - startTime;
    const success = errors.size === 0;
    db.prepare(
      `UPDATE workflows SET status = ?, completed_at = ? WHERE id = ?`
    ).run(success ? "completed" : "partial", new Date().toISOString(), workflowId);

    log.info(
      `Workflow ${workflowId} completed: ${completedTaskIds.size}/${sortedTasks.length} tasks, ` +
      `${duration}ms, parallel=${parallelTaskIds.length}, sequential=${sequentialTaskIds.length}, ` +
      `maxParallelism=${maxParallelism}`
    );

    return {
      workflowId,
      success,
      tasksCompleted: completedTaskIds.size,
      totalTasks: sortedTasks.length,
      results,
      errors,
      executionStats: {
        parallelTasks: parallelTaskIds.length,
        sequentialTasks: sequentialTaskIds.length,
        parallelTaskIds,
        sequentialTaskIds,
        maxParallelism,
        duration,
      },
    };
  }
}

export default MeshWorkflow;

