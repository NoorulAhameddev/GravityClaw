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
const MEMORY_WARN_COOLDOWN = 5 * 60 * 1000; // 5 minutes between warnings

let lastMemoryWarning = 0;

interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class CircularBuffer<T> {
  private buffer: T[] = [];
  private index = 0;
  private full = false;

  constructor(private capacity: number) {}

  push(item: T): void {
    if (this.capacity === 0) return;
    
    if (this.full) {
      this.buffer[this.index] = item;
    } else {
      this.buffer.push(item);
      if (this.buffer.length === this.capacity) {
        this.full = true;
      }
    }
    this.index = (this.index + 1) % this.capacity;
  }

  toArray(): T[] {
    if (!this.full) return [...this.buffer];
    return [
      ...this.buffer.slice(this.index),
      ...this.buffer.slice(0, this.index)
    ];
  }

  clear(): void {
    this.buffer = [];
    this.index = 0;
    this.full = false;
  }

  get length(): number {
    return this.full ? this.capacity : this.buffer.length;
  }
}

class MemoryEfficientCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private accessOrder: K[] = [];

  constructor(
    private maxSize: number,
    private ttlMs: number = 30 * 60 * 1000
  ) {}

  set(key: K, value: V, customTTL?: number): void {
    const now = Date.now();
    
    while (this.cache.size >= this.maxSize && this.accessOrder.length > 0) {
      const oldestKey = this.accessOrder.shift()!;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      value,
      expiresAt: now + (customTTL ?? this.ttlMs)
    });
    
    this.accessOrder.push(key);
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      const idx = this.accessOrder.indexOf(key);
      if (idx > -1) this.accessOrder.splice(idx, 1);
      return undefined;
    }

    const idx = this.accessOrder.indexOf(key);
    if (idx > -1) {
      this.accessOrder.splice(idx, 1);
      this.accessOrder.push(key);
    }
    
    return entry.value;
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): boolean {
    const idx = this.accessOrder.indexOf(key);
    if (idx > -1) this.accessOrder.splice(idx, 1);
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  get size(): number {
    return this.cache.size;
  }

  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        const idx = this.accessOrder.indexOf(key);
        if (idx > -1) this.accessOrder.splice(idx, 1);
        cleaned++;
      }
    }
    
    return cleaned;
  }
}

let memorySnapshots: CircularBuffer<MemorySnapshot>;
let maxHeapObserved = 0;
let globalCache: MemoryEfficientCache<string, unknown>;

/**
 * Initialize memory optimizations
 */
export function initializeMemoryOptimizations(): void {
  log.info("Initializing memory optimizations");

  memorySnapshots = new CircularBuffer<MemorySnapshot>(60);
  globalCache = new MemoryEfficientCache<string, unknown>(MAX_CACHE_SIZE);

  startMemoryMonitoring();
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

    if (heapPercent > MEMORY_WARN_THRESHOLD) {
      const now = Date.now();
      if (now - lastMemoryWarning > MEMORY_WARN_COOLDOWN) {
        lastMemoryWarning = now;
        log.warn(
          `⚠️  High memory usage: ${(mem.heapUsed / 1024 / 1024).toFixed(2)}MB / ${(mem.heapTotal / 1024 / 1024).toFixed(2)}MB (${(heapPercent * 100).toFixed(1)}%)`
        );

        if (globalCache) {
          globalCache.cleanup();
        }

        if (global.gc) {
          log.debug("Triggering garbage collection");
          global.gc();
        }
      }
    }
  }, 60000);
}

/**
 * Start periodic GC hints
 */
function startGCHints(): void {
  if (!global.gc) {
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
  const snapshots = memorySnapshots.toArray();
  if (snapshots.length < 2) {
    return { status: "insufficient data" };
  }

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
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
    snapshotsCount: snapshots.length,
  };
}

/**
 * Check for potential memory leaks
 */
export function detectMemoryLeaks(): {
  hasLeak: boolean;
  reason: string;
} {
  const snapshots = memorySnapshots.toArray();
  if (snapshots.length < 10) {
    return { hasLeak: false, reason: "Insufficient data" };
  }

  const recent = snapshots.slice(-10);
  let increasing = 0;

  for (let i = 1; i < recent.length; i++) {
    if (recent[i]!.heapUsed > recent[i - 1]!.heapUsed) {
      increasing++;
    }
  }

  if (increasing >= 8) {
    const firstHeap = recent[0]!.heapUsed / 1024 / 1024;
    const lastHeap = recent[recent.length - 1]!.heapUsed / 1024 / 1024;
    const delta = lastHeap - firstHeap;

    if (delta > 10) {
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
  return memorySnapshots.toArray().map((snap) => ({
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
  memorySnapshots.clear();
  if (globalCache) {
    globalCache.clear();
  }
  maxHeapObserved = 0;

  if (global.gc) {
    log.info("Running forced garbage collection");
    global.gc();
  }

  log.info("✅ Memory cleanup complete");
}
