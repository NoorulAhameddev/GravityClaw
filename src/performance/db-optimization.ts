/**
 * Database Performance Optimizations
 * 
 * Provides:
 * - Query caching
 * - Connection pooling helpers
 * - Batch operation optimization
 * - Index management
 * - Query performance monitoring
 */

import { db } from "../db.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("db-optimization");

// In-memory cache for frequently accessed data
const sessionSettingsCache = new Map<string, Record<string, unknown>>();
const sessionInfoCache = new Map<string, { info: Record<string, unknown>; ttl: number }>();
const toolsCache = { data: null as unknown, ttl: 0 };

const CACHE_TTL = 60000; // 60 seconds

/**
 * Initialize performance optimizations
 */
export function initializePerformanceOptimizations(): void {
  log.info("Initializing database performance optimizations");

  // Create additional indexes for frequently queried columns
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_memory_timestamp ON memory(timestamp);
      CREATE INDEX IF NOT EXISTS idx_memory_session_timestamp ON memory(session_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_usage_session_timestamp ON usage(session_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_workflows_session_status ON workflows(session_id, status);
      CREATE INDEX IF NOT EXISTS idx_workflow_tasks_status ON workflow_tasks(workflow_id, status);
    `);
    log.info("✅ Database indexes created");
  } catch (error) {
    log.warn("Could not create indexes (may already exist)");
  }

  // Set performance pragmas
  try {
    db.pragma("foreign_keys = ON");
    db.pragma("synchronous = NORMAL"); // Balance safety/performance
    db.pragma("temp_store = MEMORY");
    db.pragma("mmap_size = 30000000"); // 30MB mmap
    db.pragma("query_only = OFF");
    log.info("✅ Performance pragmas applied");
  } catch (error) {
    log.warn("Could not apply pragmas:", { error });
  }

  // Start cache cleanup interval
  startCacheCleanup();
}

/**
 * Get cached session settings or fetch from database
 */
export function getCachedSessionSettings(sessionId: string): Record<string, unknown> {
  // Check in-memory cache first
  if (sessionSettingsCache.has(sessionId)) {
    return sessionSettingsCache.get(sessionId)!;
  }

  // Fetch from database
  const row = db
    .prepare("SELECT settings FROM memory WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1")
    .get(sessionId) as { settings: string } | undefined;

  if (row) {
    const settings = JSON.parse(row.settings || "{}");
    sessionSettingsCache.set(sessionId, settings);
    return settings;
  }

  return {};
}

/**
 * Update session settings and invalidate cache
 */
export function updateCachedSessionSettings(
  sessionId: string,
  settings: Record<string, unknown>
): void {
  sessionSettingsCache.set(sessionId, settings);
  // Settings will be persisted by the agent loop
}

/**
 * Get cached session info
 */
export function getCachedSessionInfo(sessionId: string): Record<string, unknown> | null {
  const cached = sessionInfoCache.get(sessionId);
  if (cached && Date.now() < cached.ttl) {
    return cached.info;
  }

  // Fetch from database
  const row = db
    .prepare(
      `SELECT COUNT(*) as message_count, MAX(timestamp) as last_active
       FROM memory WHERE session_id = ?`
    )
    .get(sessionId) as { message_count: number; last_active: string } | undefined;

  if (row) {
    const info = {
      sessionId,
      messageCount: row.message_count,
      lastActive: row.last_active,
    };
    sessionInfoCache.set(sessionId, { info, ttl: Date.now() + CACHE_TTL });
    return info;
  }

  return null;
}

/**
 * Batch insert multiple messages to database
 * More efficient than individual inserts
 */
export function batchInsertMessages(
  messages: { sessionId: string; timestamp: string; messageJson: string }[]
): void {
  if (messages.length === 0) return;

  const insert = db.prepare(
    `INSERT INTO memory (session_id, timestamp, message_json)
     VALUES (?, ?, ?)`
  );

  const transaction = db.transaction(() => {
    for (const msg of messages) {
      insert.run(msg.sessionId, msg.timestamp, msg.messageJson);
    }
  });

  transaction();
}

/**
 * Query multiple sessions with pagination
 */
export function queryMultipleSessions(
  sessionIds: string[],
  limit: number = 50
): Record<string, unknown[]> {
  const result: Record<string, unknown[]> = {};

  for (const sessionId of sessionIds) {
    const messages = db
      .prepare(
        `SELECT id, session_id, timestamp, message_json
         FROM memory WHERE session_id = ?
         ORDER BY timestamp DESC LIMIT ?`
      )
      .all(sessionId, limit);

    result[sessionId] = messages;
  }

  return result;
}

/**
 * Get top N sessions by message count
 */
export function getTopSessionsByActivity(limit: number = 100): unknown[] {
  return db
    .prepare(
      `SELECT session_id, COUNT(*) as message_count, MAX(timestamp) as last_active
       FROM memory
       GROUP BY session_id
       ORDER BY message_count DESC
       LIMIT ?`
    )
    .all(limit);
}

/**
 * Cleanup old sessions and expired data
 */
export function cleanupOldData(daysOld: number = 30): number {
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();

  const result = db.prepare("DELETE FROM memory WHERE timestamp < ?").run(cutoffDate);

  log.info(`Cleaned up ${result.changes} old memory entries`);

  // Clear associated caches
  sessionSettingsCache.clear();
  sessionInfoCache.clear();

  return result.changes;
}

/**
 * Vacuum database to reclaim space (run periodically)
 */
export function vacuumDatabase(): void {
  log.info("Running database VACUUM");
  db.exec("VACUUM");
  log.info("✅ Database vacuumed");
}

/**
 * Get database statistics
 */
export function getDatabaseStats(): Record<string, unknown> {
  const pageSize = (db.pragma("page_size", { simple: true }) as number) || 4096;
  const pageCount = (db.pragma("page_count", { simple: true }) as number) || 0;
  const freePages = (db.pragma("freelist_count", { simple: true }) as number) || 0;

  const memory = db
    .prepare("SELECT COUNT(*) as count FROM memory")
    .get() as { count: number };
  const usage = db
    .prepare("SELECT COUNT(*) as count FROM usage")
    .get() as { count: number };
  const sessions = db
    .prepare("SELECT COUNT(*) as count FROM sessions")
    .get() as { count: number };

  return {
    pageSize,
    pageCount,
    freePages,
    totalSizeMB: ((pageCount * pageSize) / 1024 / 1024).toFixed(2),
    memoryRows: memory.count,
    usageRows: usage.count,
    sessionsCount: sessions.count,
  };
}

/**
 * Start automatic cache cleanup
 */
function startCacheCleanup(): void {
  setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    // Clean expired session info cache
    for (const [key, value] of sessionInfoCache.entries()) {
      if (now >= value.ttl) {
        sessionInfoCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log.debug(`Cleaned ${cleaned} expired cache entries`);
    }
  }, 5 * 60 * 1000); // Every 5 minutes
}

/**
 * Prepare database for shutdown (flush caches, etc.)
 */
export function flushCaches(): void {
  sessionSettingsCache.clear();
  sessionInfoCache.clear();
  log.info("✅ Caches flushed");
}

/**
 * Get cache statistics
 */
export function getCacheStats(): Record<string, unknown> {
  return {
    sessionSettingsCacheSize: sessionSettingsCache.size,
    sessionInfoCacheSize: sessionInfoCache.size,
    toolsCached: toolsCache.data !== null,
    cacheTTL: CACHE_TTL,
  };
}
