/**
 * Session Settings Management
 * 
 * Manages per-session configuration like active model, provider, preferences, etc.
 * Settings are stored as JSON in the memory table's settings column.
 */

import { db } from "./db.ts";
import { createLogger } from "./logger.ts";

const log = createLogger("session");

/**
 * Session settings structure
 */
export interface SessionSettings {
  /**
   * Active LLM provider (overrides global config)
   */
  provider?: string;
  
  /**
   * Active model name (overrides global config)
   */
  model?: string;
  
  /**
   * Thinking level (off, low, medium, high)
   */
  thinkingLevel?: "off" | "low" | "medium" | "high";
  
  /**
   * Voice mode (off, transcribe-only, full-voice)
   */
  voiceMode?: "off" | "transcribe" | "full";
  
  /**
   * TTS provider (openai, elevenlabs)
   */
  ttsProvider?: "openai" | "elevenlabs";
  
  /**
   * Heartbeat interval in minutes
   */
  heartbeatInterval?: number;
  
  /**
   * Heartbeat enabled flag
   */
  heartbeatEnabled?: boolean;

  /**
   * Recap hour in local time (0-23)
   */
  recapHourLocal?: number;

  /**
   * Smart recommendations enabled flag
   */
  recommendationsEnabled?: boolean;

  /**
   * Last recommendations sent date (YYYY-MM-DD)
   */
  recommendationsLastSentDate?: string;
  
  /**
   * Custom system prompt override
   */
  customSystemPrompt?: string;
  
  /**
   * Temperature override (0.0 - 2.0)
   */
  temperature?: number;
  
  /**
   * Max tokens override
   */
  maxTokens?: number;
  
  /**
   * Additional custom settings
   */
  [key: string]: unknown;
}

/**
 * Get session settings from database
 * @param sessionId - Session identifier
 * @returns Session settings (empty object if not found)
 */
export function getSessionSettings(sessionId: string): SessionSettings {
  try {
    // Get the most recent settings entry for this session
    const row = db.prepare(`
      SELECT settings 
      FROM memory 
      WHERE session_id = ? 
      ORDER BY timestamp DESC 
      LIMIT 1
    `).get(sessionId) as { settings: string } | undefined;
    
    if (!row || !row.settings) {
      return {};
    }
    
    const settings = JSON.parse(row.settings) as SessionSettings;
    log.debug(`Loaded settings for session ${sessionId}: ${JSON.stringify(settings)}`);
    return settings;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error(`Error loading session settings for ${sessionId}: ${errMsg}`);
    return {};
  }
}

/**
 * Set session settings in database
 * Updates the settings for all existing rows in this session
 * If no rows exist, creates an initial system message with the settings
 * @param sessionId - Session identifier
 * @param settings - Settings to save
 */
export function setSessionSettings(sessionId: string, settings: SessionSettings): void {
  try {
    const settingsJson = JSON.stringify(settings);
    
    // Update all rows for this session with new settings
    const result = db.prepare(`
      UPDATE memory 
      SET settings = ? 
      WHERE session_id = ?
    `).run(settingsJson, sessionId);
    
    log.info(`Updated settings for session ${sessionId} (${result.changes} rows affected)`);
    
    // If no rows were updated, create an initial placeholder message with settings
    if (result.changes === 0) {
      log.debug(`Creating initial placeholder for session ${sessionId} with settings`);
      
      // Create a system-level metadata message (not visible in conversation)
      const metadataMessage = {
        role: "system",
        content: "", // Empty content - this is just for storing settings
      };
      
      db.prepare(`
        INSERT INTO memory (session_id, message_json, settings) 
        VALUES (?, ?, ?)
      `).run(sessionId, JSON.stringify(metadataMessage), settingsJson);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error(`Error saving session settings for ${sessionId}: ${errMsg}`);
    throw err;
  }
}

/**
 * Update a specific setting without overwriting others
 * @param sessionId - Session identifier
 * @param key - Setting key
 * @param value - Setting value
 */
export function updateSessionSetting(
  sessionId: string,
  key: keyof SessionSettings,
  value: unknown
): void {
  const settings = getSessionSettings(sessionId);
  settings[key] = value;
  setSessionSettings(sessionId, settings);
}

/**
 * Get a specific setting value
 * @param sessionId - Session identifier
 * @param key - Setting key
 * @param defaultValue - Default value if not set
 * @returns Setting value or default
 */
export function getSessionSetting<T>(
  sessionId: string,
  key: keyof SessionSettings,
  defaultValue?: T
): T | undefined {
  const settings = getSessionSettings(sessionId);
  const value = settings[key];
  return (value !== undefined ? value : defaultValue) as T | undefined;
}

/**
 * Delete a session and all its settings
 * @param sessionId - Session identifier
 * @returns true if session was deleted, false if not found
 */
export function deleteSession(sessionId: string): boolean {
  try {
    const result = db.prepare(`
      DELETE FROM memory 
      WHERE session_id = ?
    `).run(sessionId);
    
    log.info(`Deleted session ${sessionId} (${result.changes} rows removed)`);
    return (result.changes ?? 0) > 0;
  } catch (err) {
    log.error(`Error deleting session ${sessionId}`, err);
    throw err;
  }
}

/**
 * List all active sessions
 * @returns Array of session IDs
 */
export function listSessions(): string[] {
  try {
    const rows = db.prepare(`
      SELECT DISTINCT session_id 
      FROM memory 
      ORDER BY session_id
    `).all() as Array<{ session_id: string }>;
    
    return rows.map(row => row.session_id);
  } catch (err) {
    log.error("Error listing sessions", err);
    return [];
  }
}

/**
 * Get session statistics
 * @param sessionId - Session identifier
 * @returns Statistics (message count, user/assistant counts, timestamps)
 */
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
        MAX(timestamp) as last_msg,
        (SELECT settings FROM memory WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1) as settings
      FROM memory 
      WHERE session_id = ?
    `).get(sessionId, sessionId) as {
      count: number;
      first_msg: string | null;
      last_msg: string | null;
      settings: string | null;
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
    
    // Count user and assistant messages separately
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
      settings: row.settings ? JSON.parse(row.settings) as SessionSettings : {},
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
