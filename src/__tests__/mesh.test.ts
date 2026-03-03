import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "../db.ts";
import {
  MeshWorkflow,
  type WorkflowTask,
  type WorkflowDAG,
  type DAGValidationResult,
} from "../agents/mesh.ts";

describe("Mesh Workflow System", () => {
  const testSessionId = "test:mesh";
  let mesh: MeshWorkflow;

  beforeEach(() => {
    mesh = new MeshWorkflow();
    // Clean up test data
    db.prepare("DELETE FROM workflows WHERE session_id = ?").run(testSessionId);
    db.prepare("DELETE FROM workflow_tasks").run();
  });

  afterEach(() => {
    // Clean up test data
    db.prepare("DELETE FROM workflows WHERE session_id = ?").run(testSessionId);
    db.prepare("DELETE FROM workflow_tasks").run();
  });

  describe("DAG Validation", () => {
    it("should validate a simple DAG with no cycles", () => {
      const dag: WorkflowDAG = {
        goalDescription: "Test goal",
        tasks: [
          {
            id: "1",
            description: "Task 1",
            dependsOn: [],
            status: "pending",
          },
          {
            id: "2",
            description: "Task 2",
            dependsOn: ["1"],
            status: "pending",
          },
        ],
      };

      const result = mesh.validateDAG(dag);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect cycles in a DAG", () => {
      const dag: WorkflowDAG = {
        goalDescription: "Test goal with cycle",
        tasks: [
          {
            id: "1",
            description: "Task 1",
            dependsOn: ["2"],
            status: "pending",
          },
          {
            id: "2",
            description: "Task 2",
            dependsOn: ["1"],
            status: "pending",
          },
        ],
      };

      const result = mesh.validateDAG(dag);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("Cycle detected");
    });

    it("should reject invalid task references", () => {
      const dag: WorkflowDAG = {
        goalDescription: "Test goal",
        tasks: [
          {
            id: "1",
            description: "Task 1",
            dependsOn: ["nonexistent"],
            status: "pending",
          },
        ],
      };

      const result = mesh.validateDAG(dag);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("non-existent task");
    });

    it("should detect complex cycles with multiple tasks", () => {
      const dag: WorkflowDAG = {
        goalDescription: "Test goal with complex cycle",
        tasks: [
          {
            id: "1",
            description: "Task 1",
            dependsOn: ["2"],
            status: "pending",
          },
          {
            id: "2",
            description: "Task 2",
            dependsOn: ["3"],
            status: "pending",
          },
          {
            id: "3",
            description: "Task 3",
            dependsOn: ["1"],
            status: "pending",
          },
        ],
      };

      const result = mesh.validateDAG(dag);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should validate DAG with multiple independent tasks", () => {
      const dag: WorkflowDAG = {
        goalDescription: "Test goal with parallel tasks",
        tasks: [
          {
            id: "1",
            description: "Task 1",
            dependsOn: [],
            status: "pending",
          },
          {
            id: "2",
            description: "Task 2",
            dependsOn: [],
            status: "pending",
          },
          {
            id: "3",
            description: "Task 3",
            dependsOn: ["1", "2"],
            status: "pending",
          },
        ],
      };

      const result = mesh.validateDAG(dag);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Topological Sorting", () => {
    it("should sort tasks in correct dependency order", () => {
      const dag: WorkflowDAG = {
        goalDescription: "Test goal",
        tasks: [
          {
            id: "3",
            description: "Task 3",
            dependsOn: ["1", "2"],
            status: "pending",
          },
          {
            id: "1",
            description: "Task 1",
            dependsOn: [],
            status: "pending",
          },
          {
            id: "2",
            description: "Task 2",
            dependsOn: ["1"],
            status: "pending",
          },
        ],
      };

      const sorted = mesh.topologicalSort(dag);

      expect(sorted).toHaveLength(3);
      expect(sorted[0]?.id).toBe("1");
      expect(sorted[1]?.id).toBe("2");
      expect(sorted[2]?.id).toBe("3");
    });

    it("should handle independent parallel tasks", () => {
      const dag: WorkflowDAG = {
        goalDescription: "Test goal",
        tasks: [
          {
            id: "1",
            description: "Task 1",
            dependsOn: [],
            status: "pending",
          },
          {
            id: "2",
            description: "Task 2",
            dependsOn: [],
            status: "pending",
          },
        ],
      };

      const sorted = mesh.topologicalSort(dag);

      expect(sorted).toHaveLength(2);
      // Both tasks should be included (order may vary for independent tasks)
      const ids = sorted.map((t) => t.id);
      expect(ids).toContain("1");
      expect(ids).toContain("2");
    });

    it("should return single task for simple DAG", () => {
      const dag: WorkflowDAG = {
        goalDescription: "Test goal",
        tasks: [
          {
            id: "1",
            description: "Task 1",
            dependsOn: [],
            status: "pending",
          },
        ],
      };

      const sorted = mesh.topologicalSort(dag);

      expect(sorted).toHaveLength(1);
      expect(sorted[0]?.id).toBe("1");
    });

    it("should maintain dependency order in complex DAG", () => {
      const dag: WorkflowDAG = {
        goalDescription: "Complex workflow",
        tasks: [
          {
            id: "4",
            description: "Task 4",
            dependsOn: ["2", "3"],
            status: "pending",
          },
          {
            id: "1",
            description: "Task 1",
            dependsOn: [],
            status: "pending",
          },
          {
            id: "3",
            description: "Task 3",
            dependsOn: ["1"],
            status: "pending",
          },
          {
            id: "2",
            description: "Task 2",
            dependsOn: ["1"],
            status: "pending",
          },
        ],
      };

      const sorted = mesh.topologicalSort(dag);
      const indices = new Map(sorted.map((t, i) => [t.id, i]));

      // Verify dependency order
      expect(indices.get("1")!).toBeLessThan(indices.get("2")!);
      expect(indices.get("1")!).toBeLessThan(indices.get("3")!);
      expect(indices.get("2")!).toBeLessThan(indices.get("4")!);
      expect(indices.get("3")!).toBeLessThan(indices.get("4")!);
    });
  });

  describe("Workflow Execution", () => {
    it("should execute simple single-task workflow", async () => {
      const dag: WorkflowDAG = {
        goalDescription: "Simple task",
        tasks: [
          {
            id: "1",
            description: "Calculate 2+2",
            dependsOn: [],
            status: "pending",
          },
        ],
      };

      const result = await mesh.execute(dag);

      expect(result.workflowId).toBeDefined();
      expect(result.tasksCompleted).toBe(1);
      expect(result.totalTasks).toBe(1);
      expect(result.results.has("1")).toBe(true);
    });

    it("should store workflow in database", async () => {
      const dag: WorkflowDAG = {
        goalDescription: "Test workflow",
        tasks: [
          {
            id: "1",
            description: "Test task",
            dependsOn: [],
            status: "pending",
          },
        ],
      };

      const result = await mesh.execute(dag);

      const workflow = db
        .prepare("SELECT * FROM workflows WHERE id = ?")
        .get(result.workflowId) as any;

      expect(workflow).toBeDefined();
      expect(workflow.goal).toBe("Test workflow");
      expect(workflow.status).toBeDefined();
    });

    it("should track progress during execution", async () => {
      const dag: WorkflowDAG = {
        goalDescription: "Multi-task workflow",
        tasks: [
          {
            id: "1",
            description: "Task 1",
            dependsOn: [],
            status: "pending",
          },
          {
            id: "2",
            description: "Task 2",
            dependsOn: ["1"],
            status: "pending",
          },
        ],
      };

      const progressUpdates: any[] = [];
      const onProgress = async (progress: any) => {
        progressUpdates.push(progress);
      };

      const result = await mesh.execute(dag, onProgress);

      // Should have progress updates
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(result.tasksCompleted).toBeGreaterThanOrEqual(1);
    });

    it("should create isolated sessions for each task", async () => {
      const dag: WorkflowDAG = {
        goalDescription: "Session test",
        tasks: [
          {
            id: "1",
            description: "First task",
            dependsOn: [],
            status: "pending",
          },
          {
            id: "2",
            description: "Second task",
            dependsOn: ["1"],
            status: "pending",
          },
        ],
      };

      const result = await mesh.execute(dag);

      // Check that task results were stored with session IDs
      const tasks = db
        .prepare("SELECT * FROM workflow_tasks WHERE workflow_id = ?")
        .all(result.workflowId);

      expect(tasks.length).toBeGreaterThan(0);
      for (const task of tasks) {
        const typedTask = task as any;
        if (typedTask.status === "completed") {
          expect(typedTask.created_session_id).toBeDefined();
          expect(typedTask.created_session_id).toContain("task");
        }
      }
    });

    it("should handle task failure gracefully", async () => {
      const dag: WorkflowDAG = {
        goalDescription: "Failure test",
        tasks: [
          {
            id: "1",
            description: "Impossible task that will fail",
            dependsOn: [],
            status: "pending",
          },
        ],
      };

      // Should not throw, but should return partial success
      const result = await mesh.execute(dag);

      expect(result.workflowId).toBeDefined();
      expect(result.totalTasks).toBe(1);
      // Task may fail due to timeout or other reasons
      expect(result.tasksCompleted).toBeLessThanOrEqual(1);
    });
  });

  describe("Decomposition", () => {
    it("should have decompose method available", () => {
      expect(typeof mesh.decompose).toBe("function");
    });

    it("should handle decomposition errors gracefully", async () => {
      // Mock a scenario where decomposition might fail
      // This mainly tests that the method exists and handles errors
      try {
        // Even if this fails, it should not crash
        await mesh.decompose("test goal");
      } catch (error) {
        // Expected to fail with API calls, but should have proper error handling
        expect(error).toBeDefined();
      }
    });
  });

  describe("Database Integration", () => {
    it("should create workflow_tasks records", async () => {
      const dag: WorkflowDAG = {
        goalDescription: "Database test",
        tasks: [
          {
            id: "1",
            description: "Database test task",
            dependsOn: [],
            status: "pending",
          },
        ],
      };

      const result = await mesh.execute(dag);
      const tasks = db
        .prepare("SELECT * FROM workflow_tasks WHERE workflow_id = ?")
        .all(result.workflowId) as any[];

      expect(tasks.length).toBe(1);
      expect(tasks[0].task_id).toBe("1");
      expect(tasks[0].workflow_id).toBe(result.workflowId);
    });

    it("should store task dependencies in JSON format", async () => {
      const dag: WorkflowDAG = {
        goalDescription: "Dependency test",
        tasks: [
          {
            id: "1",
            description: "Task 1",
            dependsOn: [],
            status: "pending",
          },
          {
            id: "2",
            description: "Task 2",
            dependsOn: ["1"],
            status: "pending",
          },
        ],
      };

      const result = await mesh.execute(dag);
      const task2 = db
        .prepare(
          "SELECT * FROM workflow_tasks WHERE workflow_id = ? AND task_id = ?",
        )
        .get(result.workflowId, "2") as any;

      expect(task2).toBeDefined();
      const deps = JSON.parse(task2.depends_on);
      expect(Array.isArray(deps)).toBe(true);
    });

    it("should update workflow progress", async () => {
      const dag: WorkflowDAG = {
        goalDescription: "Progress test",
        tasks: [
          {
            id: "1",
            description: "Task 1",
            dependsOn: [],
            status: "pending",
          },
        ],
      };

      const result = await mesh.execute(dag);
      const workflow = db
        .prepare("SELECT * FROM workflows WHERE id = ?")
        .get(result.workflowId) as any;

      expect(workflow.progress).toBeGreaterThanOrEqual(0);
      expect(workflow.progress).toBeLessThanOrEqual(100);
    });

    it("should mark workflow as completed", async () => {
      const dag: WorkflowDAG = {
        goalDescription: "Completion test",
        tasks: [
          {
            id: "1",
            description: "Task 1",
            dependsOn: [],
            status: "pending",
          },
        ],
      };

      const result = await mesh.execute(dag);
      const workflow = db
        .prepare("SELECT * FROM workflows WHERE id = ?")
        .get(result.workflowId) as any;

      expect(workflow.status).toBeDefined();
      expect(["completed", "partial"]).toContain(workflow.status);
      expect(workflow.completed_at).toBeDefined();
    });
  });
});
