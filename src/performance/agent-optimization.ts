/**
 * Agent Loop Performance Optimization
 * 
 * Provides:
 * - Message parsing optimization
 * - Iteration tracking
 * - Latency monitoring
 * - Tool call batching hints
 */

import { createLogger } from "../logger.ts";
import { performance } from "perf_hooks";

const log = createLogger("agent-optimization");

interface IterationMetrics {
  sessionId: string;
  iterationNumber: number;
  duration: number;
  toolCallCount: number;
  messageLength: number;
  timestamp: number;
}

const iterationMetrics: IterationMetrics[] = [];
const compiledRegexPatterns = new Map<string, RegExp>();

/**
 * Track agent iteration metrics
 */
export function trackIterationMetrics(metrics: IterationMetrics): void {
  iterationMetrics.push(metrics);

  // Keep only last 1000 iterations
  if (iterationMetrics.length > 1000) {
    iterationMetrics.shift();
  }

  // Log slow iterations
  if (metrics.duration > 5000) {
    log.debug(
      `Agent iteration: ${metrics.duration.toFixed(0)}ms (${metrics.toolCallCount} tools, session: ${metrics.sessionId})`
    );
  }
}

/**
 * Get cached compiled regex pattern
 */
export function getCompiledRegex(pattern: string): RegExp {
  if (!compiledRegexPatterns.has(pattern)) {
    compiledRegexPatterns.set(pattern, new RegExp(pattern));
  }
  return compiledRegexPatterns.get(pattern)!;
}

/**
 * Precompile common regex patterns
 */
export function precompileCommonPatterns(): void {
  const patterns = [
    "^[a-zA-Z0-9_-]+$", // Session ID format
    "https?://[^\\s]+", // URL
    "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}", // Email
    "\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}", // IP address
  ];

  for (const pattern of patterns) {
    getCompiledRegex(pattern);
  }

  log.info(`✅ Precompiled ${patterns.length} regex patterns`);
}

/**
 * Get iteration statistics
 */
export function getIterationStats(): Record<string, unknown> {
  if (iterationMetrics.length === 0) {
    return { status: "no data" };
  }

  const durations = iterationMetrics.map((m) => m.duration);
  const sorted = [...durations].sort((a, b) => a - b);

  return {
    totalIterations: iterationMetrics.length,
    avgDuration: (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2),
    minDuration: (sorted[0] || 0).toFixed(2),
    maxDuration: (sorted[sorted.length - 1] || 0).toFixed(2),
    p95Duration: (sorted[Math.floor(sorted.length * 0.95)] || 0).toFixed(2),
    p99Duration: (sorted[Math.floor(sorted.length * 0.99)] || 0).toFixed(2),
  };
}

/**
 * Get slowest iterations
 */
export function getSlowestIterations(limit: number = 5): IterationMetrics[] {
  return [...iterationMetrics].sort((a, b) => b.duration - a.duration).slice(0, limit);
}

/**
 * Get sessions with highest tool call counts
 */
export function getSessionsWithMostToolCalls(limit: number = 5): unknown[] {
  const sessionStats = new Map<
    string,
    { sessionId: string; totalToolCalls: number; iterationCount: number }
  >();

  for (const metric of iterationMetrics) {
    let stats = sessionStats.get(metric.sessionId);
    if (!stats) {
      stats = { sessionId: metric.sessionId, totalToolCalls: 0, iterationCount: 0 };
      sessionStats.set(metric.sessionId, stats);
    }
    stats.totalToolCalls += metric.toolCallCount;
    stats.iterationCount++;
  }

  return Array.from(sessionStats.values())
    .sort((a, b) => b.totalToolCalls - a.totalToolCalls)
    .slice(0, limit);
}

/**
 * Estimate iteration latency trend
 */
export function getLatencyTrend(): Record<string, unknown> {
  if (iterationMetrics.length < 10) {
    return { status: "insufficient data" };
  }

  const recent = iterationMetrics.slice(-10);
  const older = iterationMetrics.slice(-20, -10);

  const recentAvg = recent.reduce((sum, m) => sum + m.duration, 0) / recent.length;
  const olderAvg = older.reduce((sum, m) => sum + m.duration, 0) / older.length;

  const change = ((recentAvg - olderAvg) / olderAvg) * 100;
  const trend = change > 5 ? "degrading" : change < -5 ? "improving" : "stable";

  return {
    trend,
    recentAvg: recentAvg.toFixed(2),
    olderAvg: olderAvg.toFixed(2),
    changePercent: change.toFixed(2),
  };
}

/**
 * Clear iteration metrics
 */
export function clearIterationMetrics(): void {
  iterationMetrics.length = 0;
  compiledRegexPatterns.clear();
  log.info("Agent metrics cleared");
}
