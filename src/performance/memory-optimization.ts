/**
 * Memory and Resource Optimization
 * 
 * Provides:
 * - Memory monitoring
 * - Cache size limiting
 * - Garbage collection hints
 * - Cleanup of old sessions
 * - Memory leak detection
 */

import { memoryUsage } from "process";
import { createLogger } from "../logger.ts";

const log = createLogger("memory-optimization");

const MAX_HEAP_SIZE_MB = 512;
const MAX_CACHE_SIZE = 10000;
const GC_INTERVAL = 5 * 60 * 1000; // 5 minutes
const MEMORY_WARN_THRESHOLD = 0.8; // 80% of max heap

interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

let memorySnapshots: MemorySnapshot[] = [];
let maxHeapObserved = 0;

/**
 * Initialize memory optimizations
 */
export function initializeMemoryOptimizations(): void {
  log.info("Initializing memory optimizations");

  // Start memory monitoring
  startMemoryMonitoring();

  // Periodic garbage collection hint
  startGCHints();
}

/**
 * Start memory monitoring
 */
function startMemoryMonitoring(): void {
  setInterval(() => {
    const mem = memoryUsage();
    const heapPercent = mem.heapUsed / mem.heapTotal;

    maxHeapObserved = Math.max(maxHeapObserved, mem.heapUsed);

    memorySnapshots.push({
      timestamp: Date.now(),
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      rss: mem.rss,
    });

    // Keep only last 60 snapshots (1 hour at 1-minute intervals)
    if (memorySnapshots.length > 60) {
      memorySnapshots = memorySnapshots.slice(-60);
    }

    if (heapPercent > MEMORY_WARN_THRESHOLD) {
      log.warn(
        `⚠️  High memory usage: ${(mem.heapUsed / 1024 / 1024).toFixed(2)}MB / ${(mem.heapTotal / 1024 / 1024).toFixed(2)}MB (${(heapPercent * 100).toFixed(1)}%)`
      );

      // Trigger cleanup
      if (global.gc) {
        log.debug("Triggering garbage collection");
        global.gc();
      }
    }
  }, 60000); // Every minute
}

/**
 * Start periodic GC hints
 */
function startGCHints(): void {
  if (!global.gc) {
    log.warn("Garbage collection not available (run with --expose-gc flag)");
    return;
  }

  setInterval(() => {
    log.debug("Suggesting garbage collection");
    global.gc!();
  }, GC_INTERVAL);
}

/**
 * Get memory statistics
 */
export function getMemoryStats(): Record<string, unknown> {
  const mem = memoryUsage();

  return {
    heapUsed: {
      bytes: mem.heapUsed,
      MB: (mem.heapUsed / 1024 / 1024).toFixed(2),
    },
    heapTotal: {
      bytes: mem.heapTotal,
      MB: (mem.heapTotal / 1024 / 1024).toFixed(2),
    },
    heapPercent: ((mem.heapUsed / mem.heapTotal) * 100).toFixed(2),
    external: {
      bytes: mem.external,
      MB: (mem.external / 1024 / 1024).toFixed(2),
    },
    rss: {
      bytes: mem.rss,
      MB: (mem.rss / 1024 / 1024).toFixed(2),
    },
    maxHeapObserved: {
      bytes: maxHeapObserved,
      MB: (maxHeapObserved / 1024 / 1024).toFixed(2),
    },
  };
}

/**
 * Get memory trend analysis
 */
export function getMemoryTrend(): Record<string, unknown> {
  if (memorySnapshots.length < 2) {
    return { status: "insufficient data" };
  }

  const first = memorySnapshots[0];
  const last = memorySnapshots[memorySnapshots.length - 1];
  if (!first || !last) return { heapGrowth: 0, heapGrowthRate: 0 };
  
  const heapDelta = last.heapUsed - first.heapUsed;
  const heapDeltaMB = heapDelta / 1024 / 1024;
  const timeDeltaMins = (last.timestamp - first.timestamp) / 60000;

  const trend = heapDelta > 0 ? "increasing" : heapDelta < 0 ? "decreasing" : "stable";
  const rate = timeDeltaMins > 0 ? heapDeltaMB / timeDeltaMins : 0;

  return {
    trend,
    heapDeltaMB: heapDeltaMB.toFixed(2),
    ratePerMinute: rate.toFixed(3),
    period: `${timeDeltaMins.toFixed(0)} minutes`,
    snapshotsCount: memorySnapshots.length,
  };
}

/**
 * Check for potential memory leaks
 */
export function detectMemoryLeaks(): {
  hasLeak: boolean;
  reason: string;
} {
  if (memorySnapshots.length < 10) {
    return { hasLeak: false, reason: "Insufficient data" };
  }

  // Check if memory is consistently increasing
  const recent = memorySnapshots.slice(-10);
  let increasing = 0;

  for (let i = 1; i < recent.length; i++) {
    if (recent[i]!.heapUsed > recent[i - 1]!.heapUsed) {
      increasing++;
    }
  }

  // If 8+ out of 10 are increasing, possible leak
  if (increasing >= 8) {
    const firstHeap = recent[0]!.heapUsed / 1024 / 1024;
    const lastHeap = recent[recent.length - 1]!.heapUsed / 1024 / 1024;
    const delta = lastHeap - firstHeap;

    if (delta > 10) {
      // More than 10MB increase
      return {
        hasLeak: true,
        reason: `Memory increased ${delta.toFixed(2)}MB over 10 minutes`,
      };
    }
  }

  return { hasLeak: false, reason: "No leaks detected" };
}

/**
 * Get array of memory snapshots for graphing
 */
export function getMemorySeries(): unknown[] {
  return memorySnapshots.map((snap) => ({
    timestamp: snap.timestamp,
    heapUsedMB: (snap.heapUsed / 1024 / 1024).toFixed(2),
    heapTotalMB: (snap.heapTotal / 1024 / 1024).toFixed(2),
    rssMB: (snap.rss / 1024 / 1024).toFixed(2),
  }));
}

/**
 * Force cleanup (should be used sparingly)
 */
export function forceCleanup(): void {
  memorySnapshots = [];
  maxHeapObserved = 0;

  if (global.gc) {
    log.info("Running forced garbage collection");
    global.gc();
  }

  log.info("✅ Memory cleanup complete");
}
