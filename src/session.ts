import { db } from "./db.ts";
import { createLogger } from "./logger.ts";
import { safeJsonParse } from "./utils/json.ts";
import type { DbProvider } from "./db/provider.ts";

const log = createLogger("session");

// Ensure the session_settings table exists (idempotent — safe if migrations already ran)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_settings (
      session_id TEXT PRIMARY KEY,
      settings_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
} catch (err) {
  log.warn("Could not create session_settings table (may already exist via migrations)", { error: err instanceof Error ? err.message : String(err) });
}

/**
 * Session settings structure
 */
export interface SessionSettings {
  provider?: string;
  model?: string;
  thinkingLevel?: "off" | "low" | "medium" | "high";
  voiceMode?: "off" | "transcribe" | "full";
  ttsProvider?: "openai" | "elevenlabs";
  heartbeatInterval?: number;
  heartbeatEnabled?: boolean;
  recapHourLocal?: number;
  recommendationsEnabled?: boolean;
  recommendationsLastSentDate?: string | undefined;
  customSystemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  [key: string]: unknown;
}

/**
 * Get session settings from the dedicated session_settings table.
 *
 * Uses direct lookup by primary key — O(1) instead of scanning memory rows.
 * Falls back to empty settings if no row exists.
 */
export function getSessionSettings(sessionId: string): SessionSettings {
  try {
    const row = db.prepare(
      "SELECT settings_json FROM session_settings WHERE session_id = ?",
    ).get(sessionId) as { settings_json: string } | undefined;

    if (!row || !row.settings_json) {
      return {};
    }

    const parseResult = safeJsonParse<SessionSettings>(
      row.settings_json,
      {} as SessionSettings,
      "session settings",
    );
    const settings = parseResult.success && parseResult.data ? parseResult.data : {};
    return settings;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error(`Error loading session settings for ${sessionId}: ${errMsg}`);
    return {};
  }
}

/**
 * Set session settings using UPSERT (INSERT OR REPLACE).
 *
 * This is safe because session_id is the PRIMARY KEY of session_settings.
 * No more scanning memory rows or updating all rows in a session.
 */
export function setSessionSettings(sessionId: string, settings: SessionSettings): void {
  const settingsJson = JSON.stringify(settings);

  try {
    db.prepare(`
      INSERT INTO session_settings (session_id, settings_json, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(session_id) DO UPDATE SET
        settings_json = excluded.settings_json,
        updated_at = datetime('now')
    `).run(sessionId, settingsJson);
    log.info(`Saved settings for session ${sessionId}`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error(`Error saving session settings for ${sessionId}: ${errMsg}`);
    throw err;
  }
}

/**
 * Update a single setting without overwriting others.
 */
export function updateSessionSetting(
  sessionId: string,
  key: keyof SessionSettings,
  value: unknown,
): void {
  const settings = getSessionSettings(sessionId);
  settings[key] = value;
  setSessionSettings(sessionId, settings);
}

/**
 * Get a specific setting value with optional default.
 */
export function getSessionSetting<T>(
  sessionId: string,
  key: keyof SessionSettings,
  defaultValue?: T,
): T | undefined {
  const settings = getSessionSettings(sessionId);
  const value = settings[key];
  return (value !== undefined ? value : defaultValue) as T | undefined;
}

/**
 * Delete all settings for a session.
 */
export function deleteSessionSettings(sessionId: string): void {
  try {
    db.prepare("DELETE FROM session_settings WHERE session_id = ?").run(sessionId);
    log.info(`Deleted session settings for ${sessionId}`);
  } catch (err) {
    log.error(`Error deleting session settings for ${sessionId}`, err);
    throw err;
  }
}

/**
 * Delete a session and all its messages.
 * Does NOT delete session_settings — they persist independently.
 */
export function deleteSession(sessionId: string): boolean {
  try {
    const result = db.prepare("DELETE FROM memory WHERE session_id = ?").run(sessionId);
    log.info(`Deleted session ${sessionId} (${result.changes} rows removed)`);
    return (result.changes ?? 0) > 0;
  } catch (err) {
    log.error(`Error deleting session ${sessionId}`, err);
    throw err;
  }
}

/**
 * List all active sessions.
 */
export function listSessions(): string[] {
  try {
    const rows = db.prepare(
      "SELECT DISTINCT session_id FROM memory ORDER BY session_id",
    ).all() as Array<{ session_id: string }>;

    return rows.map((row) => row.session_id);
  } catch (err) {
    log.error("Error listing sessions", err);
    return [];
  }
}

export function getSessionStats(sessionId: string): {
  messageCount: number;
  userMessages: number;
  assistantMessages: number;
  firstMessage: Date | null;
  lastMessage: Date | null;
  settings: SessionSettings;
} {
  try {
    const row = db.prepare(`
      SELECT
        COUNT(*) as count,
        MIN(timestamp) as first_msg,
        MAX(timestamp) as last_msg
      FROM memory
      WHERE session_id = ?
    `).get(sessionId) as {
      count: number;
      first_msg: string | null;
      last_msg: string | null;
    } | undefined;

    if (!row) {
      return {
        messageCount: 0,
        userMessages: 0,
        assistantMessages: 0,
        firstMessage: null,
        lastMessage: null,
        settings: {},
      };
    }

    const roleCounts = db.prepare(`
      SELECT
        SUM(CASE WHEN json_extract(message_json, '$.role') = 'user' THEN 1 ELSE 0 END) as user_count,
        SUM(CASE WHEN json_extract(message_json, '$.role') = 'assistant' THEN 1 ELSE 0 END) as assistant_count
      FROM memory
      WHERE session_id = ?
    `).get(sessionId) as {
      user_count: number;
      assistant_count: number;
    } | undefined;

    return {
      messageCount: row.count,
      userMessages: roleCounts?.user_count || 0,
      assistantMessages: roleCounts?.assistant_count || 0,
      firstMessage: row.first_msg ? new Date(row.first_msg) : null,
      lastMessage: row.last_msg ? new Date(row.last_msg) : null,
      settings: getSessionSettings(sessionId),
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error(`Error getting session stats for ${sessionId}: ${errMsg}`);
    return {
      messageCount: 0,
      userMessages: 0,
      assistantMessages: 0,
      firstMessage: null,
      lastMessage: null,
      settings: {},
    };
  }
}
