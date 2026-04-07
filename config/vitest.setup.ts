import { afterEach, beforeEach } from "vitest";
import { resetMetrics } from "../src/performance/tool-optimization.ts";
import { initializeMemoryOptimizations, forceCleanup } from "../src/performance/memory-optimization.ts";
import { clearIterationMetrics } from "../src/performance/agent-optimization.ts";

beforeEach(() => {
  initializeMemoryOptimizations();
});

afterEach(() => {
  resetMetrics();
  clearIterationMetrics();
  forceCleanup();
});
