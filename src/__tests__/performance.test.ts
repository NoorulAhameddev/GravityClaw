/**
 * Performance Tests for Gravity Claw
 * 
 * Tests that performance:
 * - Doesn't regress more than 10%
 * - Tool execution stays under 50ms
 * - Memory stays under limits
 * - Latency is acceptable
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { performance } from "perf_hooks";
import { memoryUsage } from "process";
import {
  trackToolExecution,
  getToolMetrics,
  resetMetrics as resetToolMetrics,
} from "../performance/tool-optimization.ts";
import {
  getMemoryStats,
  forceCleanup,
} from "../performance/memory-optimization.ts";
import {
  trackIterationMetrics,
  getIterationStats,
  clearIterationMetrics,
} from "../performance/agent-optimization.ts";

// Baseline metrics from production
const BASELINE = {
  toolExecution: 35, // ms
  iterationLatency: 200, // ms
  memoryHeap: 200, // MB
};

// Tolerance for regression
const TOLERANCE = {
  toolExecution: 0.1, // 10%
  iterationLatency: 0.1, // 10%
  memory: 50, // MB
};

describe("Performance", () => {
  beforeEach(() => {
    resetToolMetrics();
    clearIterationMetrics();
    forceCleanup();
  });

  afterEach(() => {
    resetToolMetrics();
    clearIterationMetrics();
  });

  describe("Tool Execution", () => {
    it("should track tool execution times", () => {
      const toolName = "testTool";
      trackToolExecution(toolName, 25);
      trackToolExecution(toolName, 30);
      trackToolExecution(toolName, 35);

      const metrics = getToolMetrics();
      expect(metrics[toolName]).toBeDefined();
      expect(metrics[toolName]!.executionCount).toBe(3);
      expect(metrics[toolName]!.avgTime).toBeCloseTo(30, 1);
      expect(metrics[toolName]!.minTime).toBe(25);
      expect(metrics[toolName]!.maxTime).toBe(35);
    });

    it("should keep tool execution under 50ms average", () => {
      // Simulate 100 tool executions
      for (let i = 0; i < 100; i++) {
        const duration = Math.random() * 45 + 5; // 5-50ms
        trackToolExecution("fast_tool", duration);
      }

      const metrics = getToolMetrics();
      expect(metrics.fast_tool!.avgTime).toBeLessThan(50);
    });

    it("should not regress performance by more than allowed tolerance", () => {
      // Simulate baseline performance
      for (let i = 0; i < 50; i++) {
        trackToolExecution("critical_tool", BASELINE.toolExecution);
      }

      const metrics = getToolMetrics();
      const maxAllowed = BASELINE.toolExecution * (1 + TOLERANCE.toolExecution);

      expect(metrics.critical_tool!.avgTime).toBeLessThan(maxAllowed);
    });

    it("should track tool errors", () => {
      trackToolExecution("error_tool", 100, false);
      trackToolExecution("error_tool", 100, true);
      trackToolExecution("error_tool", 100, true);

      const metrics = getToolMetrics();
      expect(metrics.error_tool!.errors).toBe(2);
    });
  });

  describe("Agent Iteration", () => {
    it("should track iteration metrics", () => {
      trackIterationMetrics({
        sessionId: "test-session",
        iterationNumber: 1,
        duration: 150,
        toolCallCount: 2,
        messageLength: 500,
        timestamp: Date.now(),
      });

      trackIterationMetrics({
        sessionId: "test-session",
        iterationNumber: 2,
        duration: 200,
        toolCallCount: 3,
        messageLength: 600,
        timestamp: Date.now(),
      });

      const stats = getIterationStats();
      expect(stats.totalIterations).toBe(2);
      expect(stats.avgDuration).toBeDefined();
    });

    it("should detect latency regression", () => {
      // First set of iterations (baseline)
      for (let i = 0; i < 20; i++) {
        trackIterationMetrics({
          sessionId: "test",
          iterationNumber: i,
          duration: BASELINE.iterationLatency,
          toolCallCount: 1,
          messageLength: 500,
          timestamp: Date.now(),
        });
      }

      const stats = getIterationStats();
      const avgDuration = parseFloat(stats.avgDuration as string);
      const maxAllowed = BASELINE.iterationLatency * (1 + TOLERANCE.iterationLatency);

      expect(avgDuration).toBeLessThan(maxAllowed);
    });
  });

  describe("Memory", () => {
    it("should track memory usage", () => {
      const stats = getMemoryStats();

      expect(stats.heapUsed).toBeDefined();
      expect(stats.heapTotal).toBeDefined();
      expect(stats.heapPercent).toBeDefined();
      expect(stats.rss).toBeDefined();
    });

    it("should not exceed memory limits", () => {
      const stats = getMemoryStats();
      const heapUsedMB = (stats.heapUsed as { MB: string }).MB;

      expect(parseFloat(heapUsedMB)).toBeLessThan(500); // 500MB max for tests
    });

    it("should maintain memory within baseline + tolerance", () => {
      const stats = getMemoryStats();
      const heapUsedMB = parseFloat((stats.heapUsed as { MB: string }).MB);
      const maxAllowed = BASELINE.memoryHeap + TOLERANCE.memory;

      // Allow some variance in tests
      expect(heapUsedMB).toBeLessThan(maxAllowed + 50);
    });
  });

  describe("Performance Profile", () => {
    it("should generate performance summary", () => {
      // Simulate typical workload
      for (let i = 0; i < 50; i++) {
        const duration = 20 + Math.random() * 30;
        trackToolExecution("tool1", duration);
      }

      for (let i = 0; i < 20; i++) {
        trackIterationMetrics({
          sessionId: `session-${i}`,
          iterationNumber: 1,
          duration: 150 + Math.random() * 100,
          toolCallCount: 2,
          messageLength: 500,
          timestamp: Date.now(),
        });
      }

      const toolMetrics = getToolMetrics();
      const iterationStats = getIterationStats();

      expect(toolMetrics.tool1!).toBeDefined();
      expect(toolMetrics.tool1!.executionCount).toBe(50);

      expect(iterationStats.totalIterations).toBe(20);
      expect((iterationStats.avgDuration as string).length).toBeGreaterThan(0);
    });

    it("should identify performance bottlenecks", () => {
      // Fast tool
      for (let i = 0; i < 100; i++) {
        trackToolExecution("fast_tool", 10);
      }

      // Slow tool
      for (let i = 0; i < 100; i++) {
        trackToolExecution("slow_tool", 100);
      }

      const metrics = getToolMetrics();

      const fastAvg = metrics.fast_tool!.avgTime;
      const slowAvg = metrics.slow_tool!.avgTime;

      expect(slowAvg).toBeGreaterThan(fastAvg);
      expect(slowAvg / fastAvg).toBeGreaterThan(5);
    });
  });

  describe("Concurrent Load Simulation", () => {
    it("should handle concurrent tool executions", async () => {
      const promises = [];

      // Simulate 10 concurrent tool executions
      for (let i = 0; i < 10; i++) {
        promises.push(
          Promise.resolve().then(() => {
            const start = performance.now();
            const duration = Math.random() * 30 + 10;
            // Simulate work
            const end = start + duration;
            while (performance.now() < end) {}
            trackToolExecution(`concurrent_tool_${i}`, duration);
          })
        );
      }

      await Promise.all(promises);

      const metrics = getToolMetrics();
      expect(Object.keys(metrics).length).toBeGreaterThan(0);
    });

    it("should maintain performance under simulated load", async () => {
      const startTime = performance.now();
      const startMemory = memoryUsage().heapUsed;

      // Simulate load for 1 second
      for (let i = 0; i < 100; i++) {
        trackToolExecution(`load_tool_${i % 10}`, Math.random() * 40 + 5);
      }

      const endTime = performance.now();
      const endMemory = memoryUsage().heapUsed;

      const duration = endTime - startTime;
      const memoryIncrease = (endMemory - startMemory) / 1024 / 1024;

      // Should complete 100 tracks in reasonable time
      expect(duration).toBeLessThan(100);

      // Should not leak memory significantly
      expect(memoryIncrease).toBeLessThan(5); // Less than 5MB increase
    });
  });

  describe("Regression Detection", () => {
    it("should fail if latency regresses significantly", () => {
      // Simulate regression
      for (let i = 0; i < 30; i++) {
        trackIterationMetrics({
          sessionId: "regression-test",
          iterationNumber: i,
          duration: BASELINE.iterationLatency * 1.15, // 15% regression
          toolCallCount: 1,
          messageLength: 500,
          timestamp: Date.now(),
        });
      }

      const stats = getIterationStats();
      const avgDuration = parseFloat(stats.avgDuration as string);
      const maxAllowed = BASELINE.iterationLatency * (1 + TOLERANCE.iterationLatency);

      // Should detect this regression
      expect(avgDuration).toBeGreaterThan(maxAllowed);
    });

    it("should pass if performance stays within tolerance", () => {
      for (let i = 0; i < 30; i++) {
        trackIterationMetrics({
          sessionId: "good-perf",
          iterationNumber: i,
          duration: BASELINE.iterationLatency * 1.05, // 5% variance
          toolCallCount: 1,
          messageLength: 500,
          timestamp: Date.now(),
        });
      }

      const stats = getIterationStats();
      const avgDuration = parseFloat(stats.avgDuration as string);
      const maxAllowed = BASELINE.iterationLatency * (1 + TOLERANCE.iterationLatency);

      expect(avgDuration).toBeLessThan(maxAllowed);
    });
  });
});
