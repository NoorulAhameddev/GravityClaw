/**
 * Performance Metrics Endpoints
 * 
 * Provides HTTP endpoints for accessing performance metrics:
 * - /api/metrics/performance
 * - /api/metrics/memory
 * - /api/metrics/websocket
 * - /api/metrics/tools
 * - /api/metrics/database
 * - /api/metrics/all
 */

import { createLogger } from "../logger.ts";
import { Router } from "express";
import type { Request, Response } from "express";
import { authMiddleware } from "../middleware/auth.ts";
import {
  getMemoryStats,
  getMemoryTrend,
  detectMemoryLeaks,
  getMemorySeries,
} from "./memory-optimization.ts";
import {
  getToolMetrics,
  getSlowestTools,
  getMostExecutedTools,
  getToolErrorRates,
  getCacheStats as getToolCacheStats,
} from "./tool-optimization.ts";
import {
  getIterationStats,
  getSlowestIterations,
  getSessionsWithMostToolCalls,
  getLatencyTrend,
} from "./agent-optimization.ts";
import {
  getDatabaseStats,
  getCacheStats as getDBCacheStats,
} from "./db-optimization.ts";
import { db } from "../db.ts";
import { isVectorStoreAvailable } from "../memory/vector.ts";
import { mcpClient } from "../mcp/index.ts";
import { isQueueWorkerRunning } from "../queue/index.ts";
import { config } from "../config.ts";

const log = createLogger("metrics-api");
const router = Router();

router.use(authMiddleware);

/**
 * GET /api/metrics/performance
 * Overall performance snapshot
 */
router.get("/performance", (req: Request, res: Response) => {
  try {
    const memory = getMemoryStats();
    const iterations = getIterationStats();
    const tools = getToolMetrics();

    const toolCount = Object.keys(tools).length;
    const slowestTools = getSlowestTools(3);

    res.json({
      timestamp: new Date().toISOString(),
      status: "ok",
      summary: {
        uptime: process.uptime(),
        memory,
        iterations,
        toolsTracked: toolCount,
        slowestTools: slowestTools.map((t) => ({
          name: t.name,
          avgTime: t.avgTime.toFixed(2),
        })),
      },
    });
  } catch (error: any) {
    log.error("Failed to get performance metrics:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/metrics/memory
 * Detailed memory statistics
 */
router.get("/memory", (req: Request, res: Response) => {
  try {
    const stats = getMemoryStats();
    const trend = getMemoryTrend();
    const leakDetection = detectMemoryLeaks();

    res.json({
      timestamp: new Date().toISOString(),
      memory: stats,
      trend,
      leakDetection,
    });
  } catch (error: any) {
    log.error("Failed to get memory metrics:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/metrics/memory-trend
 * Memory trend over time (for graphing)
 */
router.get("/memory-trend", (req: Request, res: Response) => {
  try {
    const series = getMemorySeries();

    res.json({
      timestamp: new Date().toISOString(),
      dataSeries: series,
    });
  } catch (error: any) {
    log.error("Failed to get memory trend:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/metrics/websocket
 * WebSocket connection statistics (requires WSM module)
 */
router.get("/websocket", (req: Request, res: Response) => {
  try {
    // This should be populated when WSOptimizations initializes
    res.json({
      timestamp: new Date().toISOString(),
      note: "WebSocket metrics available via /api/ws-info",
    });
  } catch (error: any) {
    log.error("Failed to get websocket metrics:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/metrics/tools
 * Tool execution metrics
 */
router.get("/tools", (req: Request, res: Response) => {
  try {
    const metrics = getToolMetrics();
    const slowest = getSlowestTools(10);
    const mostExecuted = getMostExecutedTools(10);
    const errorRates = getToolErrorRates();
    const cacheStats = getToolCacheStats();

    const totalExecutions = Object.values(metrics).reduce(
      (sum, m) => sum + (m.executionCount || 0),
      0
    );
    const totalTime = Object.values(metrics).reduce(
      (sum, m) => sum + (m.totalTime || 0),
      0
    );

    res.json({
      timestamp: new Date().toISOString(),
      summary: {
        toolsTracked: Object.keys(metrics).length,
        totalExecutions,
        totalTime: totalTime.toFixed(2),
        avgExecutionTime: (totalTime / totalExecutions).toFixed(2),
      },
      slowestTools: slowest.map((t) => ({
        name: t.name,
        avgTime: t.avgTime.toFixed(2),
        executions: t.executionCount,
      })),
      mostExecuted: mostExecuted.map((t) => ({
        name: t.name,
        executions: t.executionCount,
        avgTime: t.avgTime.toFixed(2),
      })),
      errorRates,
      cache: cacheStats,
    });
  } catch (error: any) {
    log.error("Failed to get tool metrics:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/metrics/iterations
 * Agent iteration metrics
 */
router.get("/iterations", (req: Request, res: Response) => {
  try {
    const stats = getIterationStats();
    const slowest = getSlowestIterations(10);
    const sessionStats = getSessionsWithMostToolCalls(10);
    const latencyTrend = getLatencyTrend();

    res.json({
      timestamp: new Date().toISOString(),
      summary: stats,
      latencyTrend,
      slowestIterations: slowest.slice(0, 5).map((i) => ({
        sessionId: i.sessionId,
        duration: i.duration.toFixed(2),
        toolCalls: i.toolCallCount,
      })),
      sessionStats,
    });
  } catch (error: any) {
    log.error("Failed to get iteration metrics:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/metrics/database
 * Database statistics and cache info
 */
router.get("/database", (req: Request, res: Response) => {
  try {
    const stats = getDatabaseStats();
    const cacheStats = getDBCacheStats();

    // Get row counts
    const counts = {
      memory: (db.prepare("SELECT COUNT(*) as count FROM memory").get() as any)?.count || 0,
      usage: (db.prepare("SELECT COUNT(*) as count FROM usage").get() as any)?.count || 0,
      sessions: (db.prepare("SELECT COUNT(*) as count FROM sessions").get() as any)?.count || 0,
      workflows: (db.prepare("SELECT COUNT(*) as count FROM workflows").get() as any)?.count || 0,
    };

    res.json({
      timestamp: new Date().toISOString(),
      database: stats,
      rowCounts: counts,
      cache: cacheStats,
    });
  } catch (error: any) {
    log.error("Failed to get database metrics:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/metrics/all
 * Comprehensive metrics snapshot
 */
router.get("/all", (req: Request, res: Response) => {
  try {
    const memory = getMemoryStats();
    const tools = getToolMetrics();
    const iterations = getIterationStats();
    const database = getDatabaseStats();
    const latencyTrend = getLatencyTrend();

    res.json({
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory,
      tools: {
        tracked: Object.keys(tools).length,
        slowest: getSlowestTools(5),
      },
      iterations,
      database,
      trends: {
        latency: latencyTrend,
        memory: getMemoryTrend(),
      },
      health: {
        memoryOk: parseFloat((memory.heapPercent as string)) < 80,
        databaseOk: (database.pageCount as number) < 100000,
        performanceOk: parseFloat((iterations.avgDuration as string)) < 300,
      },
    });
  } catch (error: any) {
    log.error("Failed to get all metrics:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/metrics/health
 * Simple health check for monitoring
 */
router.get("/health", (req: Request, res: Response) => {
  try {
    const memory = getMemoryStats();
    const iterations = getIterationStats();

    const memoryPercent = parseFloat((memory.heapPercent as string)) || 0;
    const avgLatency = parseFloat((iterations.avgDuration as string)) || 0;

    // Database check
    let databaseStatus: "ok" | "critical" = "ok";
    try {
      db.prepare("SELECT 1").get();
    } catch (dbErr) {
      log.error("Database health check failed", dbErr);
      databaseStatus = "critical";
    }

    // Vector store check
    const vectorAvailable = isVectorStoreAvailable();
    const vectorStatus: "ok" | "degraded" = vectorAvailable ? "ok" : "degraded";

    // MCP status check
    const mcpServers = mcpClient.getStatus();
    let mcpStatus: "ok" | "degraded" | "critical" = "ok";
    if (mcpServers.length > 0) {
      const connectedCount = mcpServers.filter(s => s.connected).length;
      if (connectedCount === 0) {
        mcpStatus = "critical";
      } else if (connectedCount < mcpServers.length) {
        mcpStatus = "degraded";
      }
    }

    // Queue status check
    let queueStatus: "ok" | "degraded" = "ok";
    if (config.QUEUE_ENABLED && !isQueueWorkerRunning()) {
      queueStatus = "degraded";
    }

    const health = {
      status: "ok" as "ok" | "degraded" | "critical",
      timestamp: new Date().toISOString(),
      checks: {
        memory: memoryPercent < 80 ? "ok" : memoryPercent < 90 ? "degraded" : "critical",
        performance:
          avgLatency < 300 ? "ok" : avgLatency < 500 ? "degraded" : "critical",
        database: databaseStatus,
        vectorStore: vectorStatus,
        mcp: mcpStatus,
        queue: queueStatus,
        uptime: process.uptime(),
      },
    };

    // Set overall status
    if (
      health.checks.memory === "critical" ||
      health.checks.performance === "critical" ||
      health.checks.database === "critical"
    ) {
      health.status = "critical";
    } else if (
      health.checks.memory === "degraded" ||
      health.checks.performance === "degraded" ||
      health.checks.vectorStore === "degraded" ||
      health.checks.mcp === "degraded" ||
      health.checks.mcp === "critical" ||
      health.checks.queue === "degraded"
    ) {
      health.status = "degraded";
    }

    const statusCode = health.status === "ok" ? 200 : health.status === "degraded" ? 202 : 503;
    res.status(statusCode).json(health);
  } catch (error: any) {
    log.error("Failed to get health metrics:", error);
    res.status(500).json({ status: "error", error: error.message });
  }
});

export default router;
