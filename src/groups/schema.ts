/**
 * Group Management Schema
 * 
 * Database schema for managing group chat settings and permissions.
 */

import { db } from "../db.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("group-schema");

/**
 * Initialize group management tables
 */
export function initializeGroupTables(): void {
  try {
    // Group settings table
    db.exec(`
      CREATE TABLE IF NOT EXISTS group_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        group_id TEXT NOT NULL,
        bot_username TEXT,
        voice_mode TEXT DEFAULT 'off',
        thinking_level TEXT DEFAULT 'medium',
        tts_provider TEXT DEFAULT 'openai',
        enabled_tools TEXT DEFAULT '[]',
        disabled_tools TEXT DEFAULT '[]',
        settings_json TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(platform, group_id)
      );
      CREATE INDEX IF NOT EXISTS idx_group_settings_platform_group 
        ON group_settings(platform, group_id);
    `);

    // Group admins table
    db.exec(`
      CREATE TABLE IF NOT EXISTS group_admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        group_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        is_owner INTEGER DEFAULT 0,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(platform, group_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_group_admins_platform_group 
        ON group_admins(platform, group_id);
      CREATE INDEX IF NOT EXISTS idx_group_admins_user 
        ON group_admins(platform, group_id, user_id);
    `);

    // Group sessions table (for isolated memory per group)
    db.exec(`
      CREATE TABLE IF NOT EXISTS group_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        group_id TEXT NOT NULL,
        session_id TEXT NOT NULL UNIQUE,
        last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(platform, group_id)
      );
      CREATE INDEX IF NOT EXISTS idx_group_sessions_platform_group 
        ON group_sessions(platform, group_id);
      CREATE INDEX IF NOT EXISTS idx_group_sessions_session_id 
        ON group_sessions(session_id);
    `);

    log.info("Group management tables initialized successfully");
  } catch (error) {
    log.error("Failed to initialize group tables:", error);
    throw error;
  }
}

// Initialize tables on module load
initializeGroupTables();
