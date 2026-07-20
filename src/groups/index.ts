/**
 * Group Management Module
 * 
 * Handles group chat settings, admin permissions, and tool restrictions.
 */

import { db } from "../db.ts";
import { createLogger } from "../logger.ts";
import "./schema.ts"; // Initialize tables

const log = createLogger("groups");

export interface GroupSettings {
  platform: string;
  groupId: string;
  botUsername?: string;
  voiceMode: "off" | "transcribe-only" | "full-voice";
  thinkingLevel: "off" | "low" | "medium" | "high";
  ttsProvider: "openai" | "elevenlabs";
  enabledTools: string[];
  disabledTools: string[];
  settingsJson: Record<string, unknown>;
}

/**
 * Dangerous tools that require admin privileges
 */
export const DANGEROUS_TOOLS = [
  "run_shell",
  "read_file",
  "write_file",
  "list_files",
  "delete_file",
  "execute_code",
  "create_file",
  "move_file",
  "copy_file",
];

/**
 * Get or create session ID for a group
 */
export function getGroupSessionId(platform: string, groupId: string): string {
  const existing = db
    .prepare("SELECT session_id FROM group_sessions WHERE platform = ? AND group_id = ?")
    .get(platform, groupId) as { session_id: string } | undefined;

  if (existing) {
    // Update last message timestamp
    db.prepare(
      "UPDATE group_sessions SET last_message_at = CURRENT_TIMESTAMP WHERE platform = ? AND group_id = ?"
    ).run(platform, groupId);
    return existing.session_id;
  }

  // Create new session for this group
  const sessionId = `${platform}-group-${groupId}-${Date.now()}`;
  db.prepare(
    "INSERT INTO group_sessions (platform, group_id, session_id) VALUES (?, ?, ?)"
  ).run(platform, groupId, sessionId);

  log.info(`Created new group session: ${sessionId}`);
  return sessionId;
}

/**
 * Get group settings
 */
export function getGroupSettings(platform: string, groupId: string): GroupSettings {
  interface GroupSettingsRow {
    platform: string;
    group_id: string;
    bot_username: string | null;
    voice_mode: string | null;
    thinking_level: string | null;
    tts_provider: string | null;
    enabled_tools: string | null;
    disabled_tools: string | null;
    settings_json: string | null;
  }

  const row = db
    .prepare("SELECT * FROM group_settings WHERE platform = ? AND group_id = ?")
    .get(platform, groupId) as GroupSettingsRow | undefined;

  if (!row) {
    // Return defaults
    return {
      platform,
      groupId,
      voiceMode: "off",
      thinkingLevel: "medium",
      ttsProvider: "openai",
      enabledTools: [],
      disabledTools: [],
      settingsJson: {},
    };
  }

  return {
    platform: row.platform,
    groupId: row.group_id,
    ...(row.bot_username ? { botUsername: row.bot_username } : {}),
    voiceMode: (row.voice_mode || "off") as GroupSettings["voiceMode"],
    thinkingLevel: (row.thinking_level || "medium") as GroupSettings["thinkingLevel"],
    ttsProvider: (row.tts_provider || "openai") as GroupSettings["ttsProvider"],
    enabledTools: JSON.parse(row.enabled_tools || "[]"),
    disabledTools: JSON.parse(row.disabled_tools || "[]"),
    settingsJson: JSON.parse(row.settings_json || "{}"),
  };
}

/**
 * Update group settings
 */
export function updateGroupSettings(
  platform: string,
  groupId: string,
  settings: Partial<Omit<GroupSettings, "platform" | "groupId">>
): void {
  const current = getGroupSettings(platform, groupId);
  const merged = { ...current, ...settings };

  db.prepare(`
    INSERT INTO group_settings 
      (platform, group_id, bot_username, voice_mode, thinking_level, tts_provider, 
       enabled_tools, disabled_tools, settings_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(platform, group_id) DO UPDATE SET
      bot_username = excluded.bot_username,
      voice_mode = excluded.voice_mode,
      thinking_level = excluded.thinking_level,
      tts_provider = excluded.tts_provider,
      enabled_tools = excluded.enabled_tools,
      disabled_tools = excluded.disabled_tools,
      settings_json = excluded.settings_json,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    platform,
    groupId,
    merged.botUsername || null,
    merged.voiceMode,
    merged.thinkingLevel,
    merged.ttsProvider,
    JSON.stringify(merged.enabledTools),
    JSON.stringify(merged.disabledTools),
    JSON.stringify(merged.settingsJson)
  );

  log.info(`Updated group settings for ${platform}:${groupId}`);
}

/**
 * Check if user is admin in a group
 */
export function isGroupAdmin(platform: string, groupId: string, userId: string): boolean {
  const row = db
    .prepare(
      "SELECT 1 FROM group_admins WHERE platform = ? AND group_id = ? AND user_id = ?"
    )
    .get(platform, groupId, userId);

  return !!row;
}

/**
 * Add admin to group
 */
export function addGroupAdmin(
  platform: string,
  groupId: string,
  userId: string,
  isOwner: boolean = false
): void {
  db.prepare(`
    INSERT INTO group_admins (platform, group_id, user_id, is_owner)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(platform, group_id, user_id) DO UPDATE SET
      is_owner = excluded.is_owner
  `).run(platform, groupId, userId, isOwner ? 1 : 0);

  log.info(`Added admin ${userId} to group ${platform}:${groupId}`);
}

/**
 * Remove admin from group
 */
export function removeGroupAdmin(platform: string, groupId: string, userId: string): void {
  db.prepare(
    "DELETE FROM group_admins WHERE platform = ? AND group_id = ? AND user_id = ?"
  ).run(platform, groupId, userId);

  log.info(`Removed admin ${userId} from group ${platform}:${groupId}`);
}

/**
 * Get all admins for a group
 */
export function getGroupAdmins(platform: string, groupId: string): Array<{
  userId: string;
  isOwner: boolean;
  addedAt: string;
}> {
  const rows = db
    .prepare(
      "SELECT user_id, is_owner, added_at FROM group_admins WHERE platform = ? AND group_id = ?"
    )
    .all(platform, groupId) as any[];

  return rows.map((row) => ({
    userId: row.user_id,
    isOwner: row.is_owner === 1,
    addedAt: row.added_at,
  }));
}

/**
 * Check if a tool is allowed for non-admin users
 */
export function isToolAllowedForUser(
  platform: string,
  groupId: string,
  userId: string,
  toolName: string
): boolean {
  // Check if tool is dangerous
  const isDangerous = DANGEROUS_TOOLS.includes(toolName);

  // If tool is dangerous, user must be admin
  if (isDangerous) {
    return isGroupAdmin(platform, groupId, userId);
  }

  // Check group-specific disabled tools
  const settings = getGroupSettings(platform, groupId);
  if (settings.disabledTools.includes(toolName)) {
    return false;
  }

  // If enabled tools list is not empty, tool must be in it
  if (settings.enabledTools.length > 0) {
    return settings.enabledTools.includes(toolName);
  }

  return true;
}

/**
 * Check if message mentions the bot
 */
export function isBotMentioned(text: string, botUsername: string): boolean {
  if (!botUsername) return false;
  
  const mentionPattern = new RegExp(`@${botUsername}\\b`, "i");
  return mentionPattern.test(text);
}

/**
 * Remove bot mention from text
 */
export function removeBotMention(text: string, botUsername: string): string {
  if (!botUsername) return text;
  
  const mentionPattern = new RegExp(`@${botUsername}\\s*`, "gi");
  return text.replace(mentionPattern, "").trim();
}
