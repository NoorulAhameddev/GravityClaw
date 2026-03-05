# Multi-Agent Systems

**Coordinate multiple specialized agents for complex task execution**

---

## Overview

GravityClaw supports two powerful multi-agent orchestration patterns:

1. **Agent Swarms** - Role-based parallel execution with specialized agents
2. **Mesh Workflows** - DAG-based task decomposition with dependency management

Both systems enable breaking complex goals into manageable subtasks, executing them concurrently, and aggregating results.

---

## Agent Swarms

### Concept

Agent Swarms spawn multiple specialized agents with different roles (researcher, coder, reviewer, summarizer) to work on subtasks in parallel. Each agent has a unique system prompt tailored to its role.

### Available Roles

| Role | Specialization | Best For |
|------|---------------|----------|
| **researcher** | Analysis, research, pattern finding | Data gathering, investigation, analysis tasks |
| **coder** | Programming, implementation | Writing code, solving algorithms, technical implementation |
| **reviewer** | Code review, QA, critique | Quality assurance, bug finding, improvement suggestions |
| **summarizer** | Distillation, communication | Aggregating results, creating summaries, reports |

### Usage

#### Via Tool API

Use the `spawn_agent` tool to create specialized agents:

```json
{
  "role": "researcher",
  "task": "Research best practices for implementing rate limiting in TypeScript applications",
  "context": {
    "project": "GravityClaw",
    "language": "TypeScript"
  }
}
```

**Returns**: Agent session ID and initial status

Aggregate results from multiple agents:

```json
{
  "agent_ids": ["session-researcher-abc123", "session-coder-def456"],
  "aggregation_strategy": "summarize"
}
```

#### Programmatic Usage

```typescript
import { AgentSwarm } from "./agents/swarm.ts";

// Create swarm configuration
const swarmConfig = {
  numAgents: 3,
  roles: ["researcher", "coder", "reviewer"],
  maxConcurrency: 2, // Run 2 agents at once
};

const swarm = new AgentSwarm("parent-session-id", swarmConfig);

// Orchestrate work
const result = await swarm.orchestrate(
  "Build a rate-limited API endpoint",
  [
    "Research rate limiting algorithms",
    "Implement sliding window rate limiter",
    "Review implementation for edge cases",
  ]
);

console.log(result.aggregatedResult);
```

### Swarm Configuration

```typescript
interface SwarmConfig {
  numAgents: number;        // Number of agents to spawn
  roles: string[];          // Agent roles to use
  maxConcurrency: number;   // Max agents running simultaneously
}
```

### Database Tracking

Swarms are tracked in the `agent_swarms` table:

```sql
CREATE TABLE agent_swarms (
  id TEXT PRIMARY KEY,
  parent_session_id TEXT NOT NULL,
  child_session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT CHECK(status IN ('spawned', 'running', 'completed', 'failed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);
```

Query swarm activity:

```typescript
const swarms = db.prepare(
  `SELECT * FROM agent_swarms WHERE parent_session_id = ? ORDER BY created_at DESC`
).all(sessionId);
```

### When to Use Swarms

✅ **Good for:**
- Tasks requiring different expertise (research + implementation + review)
- Parallel investigation of multiple approaches
- Multi-perspective analysis
- Tasks where agents can work independently

❌ **Not ideal for:**
- Sequential tasks with strict dependencies
- Single-perspective tasks
- Simple queries that don't need parallelization

---

## Mesh Workflows

### Concept

Mesh Workflows use automatic task decomposition and dependency management. The system generates a DAG (Directed Acyclic Graph) from a high-level goal, validates it for cycles, and executes tasks in topological order.

### Workflow Lifecycle

```
Goal Description
      ↓
Decomposition (LLM generates DAG)
      ↓
Validation (cycle detection, reference checks)
      ↓
Execution (topological order)
      ↓
Result Aggregation
```

### Usage

#### Programmatic Usage

```typescript
import { MeshWorkflow } from "./agents/mesh.ts";

const mesh = new MeshWorkflow();

// 1. Decompose goal into task DAG
const dag = await mesh.decompose(
  "Create a complete backup system with encryption and scheduling"
);

console.log(`Generated ${dag.tasks.length} tasks`);

// 2. Validate DAG
const validation = mesh.validateDAG(dag);
if (!validation.valid) {
  console.error("Invalid DAG:", validation.errors);
  return;
}

// 3. Execute workflow
const result = await mesh.execute(
  dag,
  "workflow-session-id",
  async (progress) => {
    console.log(`${progress.currentTask}/${progress.totalTasks}: ${progress.taskDescription}`);
  }
);

if (result.success) {
  console.log(`Completed ${result.tasksCompleted} tasks`);
  result.results.forEach((output, taskId) => {
    console.log(`Task ${taskId} result:`, output);
  });
} else {
  console.error("Workflow failed:", result.errors);
}
```

### DAG Structure

```typescript
interface WorkflowDAG {
  goalDescription: string;
  tasks: WorkflowTask[];
}

interface WorkflowTask {
  id: string;
  description: string;
  dependsOn: string[];  // Task IDs that must complete first
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
}
```

### Example DAG

For goal: "Build and deploy a REST API"

```json
{
  "goalDescription": "Build and deploy a REST API",
  "tasks": [
    {
      "id": "1",
      "description": "Design API schema and endpoints",
      "dependsOn": []
    },
    {
      "id": "2",
      "description": "Implement route handlers",
      "dependsOn": ["1"]
    },
    {
      "id": "3",
      "description": "Write unit tests",
      "dependsOn": ["2"]
    },
    {
      "id": "4",
      "description": "Create deployment configuration",
      "dependsOn": ["1"]
    },
    {
      "id": "5",
      "description": "Deploy to production",
      "dependsOn": ["3", "4"]
    }
  ]
}
```

Execution order: 1 → (2, 4 in parallel) → 3 → 5

### DAG Validation

The system validates:

1. **Reference integrity**: All `dependsOn` IDs exist
2. **Cycle detection**: No circular dependencies using DFS
3. **Reachability**: All tasks are reachable from root tasks

```typescript
const validation = mesh.validateDAG(dag);

if (!validation.valid) {
  validation.errors.forEach(error => console.error(error));
}
```

### Database Tracking

Workflows are tracked in `workflows` and `workflow_tasks` tables:

```sql
CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  parent_session_id TEXT NOT NULL,
  goal_description TEXT NOT NULL,
  status TEXT CHECK(status IN ('created', 'running', 'completed', 'failed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

CREATE TABLE workflow_tasks (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  description TEXT NOT NULL,
  depends_on TEXT,  -- JSON array of dependency task IDs
  status TEXT CHECK(status IN ('pending', 'running', 'completed', 'failed')),
  result TEXT,
  error TEXT,
  started_at DATETIME,
  completed_at DATETIME,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id)
);
```

### Progress Callbacks

Monitor workflow execution in real-time:

```typescript
const progressCallback = async (progress: WorkflowProgress) => {
  console.log(`[${progress.currentTask}/${progress.totalTasks}] ${progress.taskDescription}`);
  console.log(`Status: ${progress.status}`);
  console.log(`Message: ${progress.message}`);
  
  // Update UI, send notifications, etc.
};

await mesh.execute(dag, sessionId, progressCallback);
```

### When to Use Mesh

✅ **Good for:**
- Complex goals with clear dependencies
- Sequential workflows with parallel opportunities
- Tasks that build on each other's results
- Automatic task breakdown needed

❌ **Not ideal for:**
- Pre-defined task lists (use Swarms)
- Simple linear workflows
- Tasks that don't decompose naturally

---

## Comparison: Swarms vs Mesh

| Feature | Agent Swarms | Mesh Workflows |
|---------|--------------|----------------|
| **Task Definition** | Manual (you provide subtasks) | Automatic (LLM decomposes goal) |
| **Dependencies** | None (all parallel) | Explicit (DAG structure) |
| **Execution** | Concurrent by role | Topological order |
| **Agents** | Role-specialized | General-purpose per task |
| **Best For** | Multi-perspective analysis | Complex sequential workflows |
| **Complexity** | Simpler setup | More sophisticated orchestration |
| **Control** | High (you define subtasks) | Lower (LLM decomposes) |

---

## Advanced Patterns

### Hybrid: Swarm + Mesh

Combine both approaches for maximum flexibility:

```typescript
// 1. Use mesh to decompose high-level goal
const mesh = new MeshWorkflow();
const dag = await mesh.decompose("Build complete authentication system");

// 2. For complex tasks in the DAG, spawn swarms
for (const task of dag.tasks) {
  if (task.description.includes("implement")) {
    const swarm = new AgentSwarm(task.id, {
      numAgents: 3,
      roles: ["coder", "reviewer", "summarizer"],
      maxConcurrency: 3,
    });
    
    const result = await swarm.orchestrate(task.description, [
      "Write implementation",
      "Review for issues",
      "Create documentation",
    ]);
    
    task.result = result.aggregatedResult;
    task.status = "completed";
  }
}
```

### Recursive Decomposition

For very complex goals, recursively decompose subtasks:

```typescript
async function recursiveDecompose(goal: string, depth: number = 0): Promise<WorkflowDAG> {
  if (depth > 3) return; // Limit recursion
  
  const mesh = new MeshWorkflow();
  const dag = await mesh.decompose(goal);
  
  for (const task of dag.tasks) {
    if (isComplex(task.description)) {
      const subDAG = await recursiveDecompose(task.description, depth + 1);
      // Merge subDAG into main DAG
      dag.tasks = [...dag.tasks, ...subDAG.tasks];
    }
  }
  
  return dag;
}
```

### Monitoring and Observability

Track multi-agent activity:

```typescript
// Query active swarms
const activeSwarms = db.prepare(`
  SELECT parent_session_id, COUNT(*) as agent_count, 
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
  FROM agent_swarms
  WHERE status IN ('spawned', 'running')
  GROUP BY parent_session_id
`).all();

// Query workflow progress
const workflowStatus = db.prepare(`
  SELECT w.id, w.goal_description, 
         COUNT(t.id) as total_tasks,
         SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed_tasks
  FROM workflows w
  LEFT JOIN workflow_tasks t ON w.id = t.workflow_id
  WHERE w.status = 'running'
  GROUP BY w.id
`).all();
```

---

## Configuration

### Environment Variables

```bash
# Agent execution
AGENT_MAX_ITERATIONS=10

# LLM provider for agents
LLM_PROVIDER=openrouter
LLM_MODEL=anthropic/claude-3.5-sonnet

# Swarm defaults (can override per swarm)
DEFAULT_SWARM_CONCURRENCY=2
DEFAULT_SWARM_TIMEOUT_MS=300000

# Mesh defaults
DEFAULT_MESH_MAX_TASKS=20
DEFAULT_MESH_DECOMPOSITION_RETRIES=3
```

### Session Settings

Override per-session:

```typescript
import { updateSessionSettings } from "./session.ts";

updateSessionSettings(sessionId, {
  multiAgent: {
    swarmConcurrency: 4,
    meshMaxTasks: 30,
    enableRecursiveDecomposition: true,
  }
});
```

---

## Best Practices

### General

1. **Start simple**: Use single agent first, then swarms, then mesh
2. **Monitor progress**: Use callbacks and database queries
3. **Handle failures**: Implement retry logic and error aggregation
4. **Set timeouts**: Prevent runaway agents
5. **Log everything**: Track sessions for debugging

### Swarms

1. **Choose roles wisely**: Match roles to subtask requirements
2. **Keep subtasks independent**: Minimize inter-agent dependencies
3. **Limit concurrency**: Balance speed vs resource usage
4. **Use clear task descriptions**: Help agents understand goals

### Mesh

1. **Validate DAGs**: Always check for cycles before execution
2. **Review decompositions**: LLM might over/under-decompose
3. **Provide goal clarity**: Specific goals → better decomposition
4. **Handle edge cases**: Empty DAGs, single-task DAGs, etc.
5. **Incremental execution**: Save progress between tasks

---

## Troubleshooting

### Swarm Issues

**Problem**: Agents not completing

**Solutions**:
- Check agent session logs
- Verify LLM provider is responding
- Increase timeout limits
- Reduce concurrency

**Problem**: Poor aggregation quality

**Solutions**:
- Use summarizer role for aggregation
- Provide clearer aggregation instructions
- Review individual agent outputs first

### Mesh Issues

**Problem**: DAG has cycles

**Solutions**:
- Review task dependencies manually
- Simplify goal description
- Manually edit DAG before execution

**Problem**: Task decomposition is too granular/coarse

**Solutions**:
- Adjust goal specificity
- Provide example task breakdown in prompt
- Post-process DAG to merge/split tasks

**Problem**: Tasks failing unexpectedly

**Solutions**:
- Check task session logs
- Verify task descriptions are clear
- Add retry logic for transient failures

---

## Examples

### Example 1: Research + Implementation

```typescript
// Use swarm for research, then implementation
const swarm = new AgentSwarm(sessionId, {
  numAgents: 2,
  roles: ["researcher", "coder"],
  maxConcurrency: 2,
});

const result = await swarm.orchestrate(
  "Implement OAuth 2.0 authentication",
  [
    "Research OAuth 2.0 flow and best practices",
    "Implement OAuth provider integration with error handling",
  ]
);
```

### Example 2: Complex Project

```typescript
// Use mesh for automatic decomposition
const mesh = new MeshWorkflow();

const dag = await mesh.decompose(
  "Create a CLI tool for managing database migrations with rollback support"
);

// Review and adjust DAG if needed
console.log("Generated tasks:", dag.tasks);

// Execute
const result = await mesh.execute(dag, sessionId, async (progress) => {
  // Send progress updates to user
  console.log(`Progress: ${progress.message}`);
});
```

### Example 3: Code Review Pipeline

```typescript
// Research → Code → Review → Summarize
const swarm = new AgentSwarm(sessionId, {
  numAgents: 4,
  roles: ["researcher", "coder", "reviewer", "summarizer"],
  maxConcurrency: 1, // Sequential execution
});

const result = await swarm.orchestrate(
  "Implement a feature with full review",
  [
    "Research: Best practices for feature",
    "Code: Implement the feature",
    "Review: Analyze implementation for issues",
    "Summarize: Create documentation",
  ]
);
```

---

## Future Enhancements

- **Agent learning**: Agents learn from past executions
- **Dynamic role creation**: Create custom roles on-the-fly
- **Cost optimization**: Intelligent model selection per task
- **Human-in-the-loop**: Approval gates for critical tasks
- **Visual DAG editor**: UI for building workflows
- **Agent marketplace**: Share and reuse agent configurations

---

## See Also

- [Tools Reference](TOOLS_REFERENCE.md) - `spawn_agent` and `aggregate_results` tools
- [Architecture](ARCHITECTURE.md) - System design and agent execution
- [API Reference](API.md) - Multi-agent API endpoints
- [Performance](PERFORMANCE.md) - Optimization for multi-agent execution
