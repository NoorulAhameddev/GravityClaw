/**
 * Tool Execution Performance Optimization
 * 
 * Provides:
 * - Tool caching
 * - Lazy loading
 * - Batch operations
 * - Execution metrics
 */

import { createLogger } from "../logger.ts";
import { performance } from "perf_hooks";

const log = createLogger("tool-optimization");

interface ToolExecutionMetrics {
  name: string;
  executionCount: number;
  totalTime: number;
  minTime: number;
  maxTime: number;
  avgTime: number;
  errors: number;
}

const toolMetrics = new Map<string, ToolExecutionMetrics>();
const toolCache = new Map<string, { result: unknown; timestamp: number }>();

const TOOL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Track tool execution time
 */
export function trackToolExecution(
  toolName: string,
  executionTime: number,
  error: boolean = false
): void {
  let metrics = toolMetrics.get(toolName);

  if (!metrics) {
    metrics = {
      name: toolName,
      executionCount: 0,
      totalTime: 0,
      minTime: Infinity,
      maxTime: 0,
      avgTime: 0,
      errors: 0,
    };
    toolMetrics.set(toolName, metrics);
  }

  metrics.executionCount++;
  metrics.totalTime += executionTime;
  metrics.minTime = Math.min(metrics.minTime, executionTime);
  metrics.maxTime = Math.max(metrics.maxTime, executionTime);
  metrics.avgTime = metrics.totalTime / metrics.executionCount;

  if (error) {
    metrics.errors++;
  }

  // Log slow executions
  if (executionTime > 100) {
    log.warn(
      `Slow tool execution: ${toolName} took ${executionTime.toFixed(2)}ms (avg: ${metrics.avgTime.toFixed(2)}ms)`
    );
  }
}

/**
 * Cache tool result
 */
export function cacheToolResult(toolName: string, args: string, result: unknown): void {
  const cacheKey = `${toolName}:${args}`;
  toolCache.set(cacheKey, { result, timestamp: Date.now() });
}

/**
 * Get cached tool result if available
 */
export function getCachedToolResult(toolName: string, args: string): unknown | null {
  const cacheKey = `${toolName}:${args}`;
  const cached = toolCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < TOOL_CACHE_TTL) {
    return cached.result;
  }

  if (cached) {
    toolCache.delete(cacheKey);
  }

  return null;
}

/**
 * Get all tool execution metrics
 */
export function getToolMetrics(): Record<string, ToolExecutionMetrics> {
  const result: Record<string, ToolExecutionMetrics> = {};

  for (const [name, metrics] of toolMetrics) {
    result[name] = metrics;
  }

  return result;
}

/**
 * Get slowest tools
 */
export function getSlowestTools(limit: number = 5): ToolExecutionMetrics[] {
  return Array.from(toolMetrics.values())
    .sort((a, b) => b.avgTime - a.avgTime)
    .slice(0, limit);
}

/**
 * Get most executed tools
 */
export function getMostExecutedTools(limit: number = 5): ToolExecutionMetrics[] {
  return Array.from(toolMetrics.values())
    .sort((a, b) => b.executionCount - a.executionCount)
    .slice(0, limit);
}

/**
 * Get tool error rate
 */
export function getToolErrorRates(): Record<string, number> {
  const result: Record<string, number> = {};

  for (const [name, metrics] of toolMetrics) {
    const errorRate =
      metrics.executionCount > 0
        ? (metrics.errors / metrics.executionCount) * 100
        : 0;
    result[name] = parseFloat(errorRate.toFixed(2));
  }

  return result;
}

/**
 * Clear old cache entries
 */
export function clearOldCacheEntries(): number {
  const now = Date.now();
  let count = 0;

  for (const [key, value] of toolCache) {
    if (now - value.timestamp > TOOL_CACHE_TTL) {
      toolCache.delete(key);
      count++;
    }
  }

  return count;
}

/**
 * Reset metrics (for testing)
 */
export function resetMetrics(): void {
  toolMetrics.clear();
  toolCache.clear();
  log.info("Tool metrics reset");
}

/**
 * Get cache statistics
 */
export function getCacheStats(): Record<string, unknown> {
  return {
    cacheSize: toolCache.size,
    cacheTTL: TOOL_CACHE_TTL / 1000,
    trackedTools: toolMetrics.size,
  };
}
