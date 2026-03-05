/**
 * Index file for performance optimization modules
 */

export {
  initializePerformanceOptimizations,
  getCachedSessionSettings,
  updateCachedSessionSettings,
  getCachedSessionInfo,
  batchInsertMessages,
  queryMultipleSessions,
  getTopSessionsByActivity,
  cleanupOldData,
  vacuumDatabase,
  getDatabaseStats,
  flushCaches,
  getCacheStats,
} from "./db-optimization.ts";

export {
  initializeWSOptimizations,
  sendMessage,
  broadcastMessage,
  getWSMetrics,
  cleanupWSResources,
} from "./ws-optimization.ts";

export {
  initializeMemoryOptimizations,
  getMemoryStats,
  getMemoryTrend,
  detectMemoryLeaks,
  getMemorySeries,
  forceCleanup,
} from "./memory-optimization.ts";

export {
  trackToolExecution,
  cacheToolResult,
  getCachedToolResult,
  getToolMetrics,
  getSlowestTools,
  getMostExecutedTools,
  getToolErrorRates,
  clearOldCacheEntries,
  resetMetrics,
  getCacheStats as getToolCacheStats,
} from "./tool-optimization.ts";

export {
  trackIterationMetrics,
  getCompiledRegex,
  precompileCommonPatterns,
  getIterationStats,
  getSlowestIterations,
  getSessionsWithMostToolCalls,
  getLatencyTrend,
  clearIterationMetrics,
} from "./agent-optimization.ts";
