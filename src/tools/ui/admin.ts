/**
 * Admin Panel Tools - Group and Permission Management
 * Provides backend support for admin dashboard functionality
 */

import type { Tool } from "./index.ts";
import { db } from "../../db.ts";
import { getGroupSettings, updateGroupSettings, getGroupAdmins, DANGEROUS_TOOLS } from "../../groups/index.ts";
import { createLogger } from "../../logger.ts";

const log = createLogger("admin-tools");

/**
 * List all groups for a user
 */
export const listGroupsForUserTool: Tool = {
    name: "listGroupsForUser",
    description: "List all groups the current user has access to or manages",
    inputSchema: {
        type: "object",
        properties: {
            sessionId: {
                type: "string",
                description: "Session ID of the current user (optional)"
            }
        },
        required: []
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            // Get all distinct groups from group_settings table
            const groups = db.prepare(`
                SELECT DISTINCT
                    platform,
                    group_id,
                    bot_username,
                    voice_mode,
                    thinking_level,
                    tts_provider,
                    enabled_tools,
                    disabled_tools,
                    created_at,
                    updated_at
                FROM group_settings
                ORDER BY updated_at DESC
            `).all() as any[];

            const groupsList = groups.map(g => {
                const enabledCount = JSON.parse(g.enabled_tools || "[]").length;
                const disabledCount = JSON.parse(g.disabled_tools || "[]").length;
                
                return {
                    platform: g.platform,
                    groupId: g.group_id,
                    botUsername: g.bot_username,
                    voiceMode: g.voice_mode,
                    thinkingLevel: g.thinking_level,
                    ttsProvider: g.tts_provider,
                    enabledToolCount: enabledCount,
                    disabledToolCount: disabledCount,
                    createdAt: g.created_at,
                    updatedAt: g.updated_at
                };
            });

            return JSON.stringify({
                success: true,
                data: {
                    groups: groupsList,
                    total: groupsList.length
                }
            });
        } catch (err) {
            log.error("Failed to list groups", err);
            return JSON.stringify({
                success: false,
                error: "Failed to retrieve groups"
            });
        }
    }
};

/**
 * Get settings for a specific group
 */
export const getGroupSettingsTool: Tool = {
    name: "getGroupSettings",
    description: "Get detailed settings and permissions for a specific group",
    inputSchema: {
        type: "object",
        properties: {
            platform: {
                type: "string",
                description: "Platform identifier (telegram, whatsapp, etc.)"
            },
            groupId: {
                type: "string",
                description: "Group ID on the platform"
            }
        },
        required: ["platform", "groupId"]
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            const { platform, groupId } = input as {
                platform: string;
                groupId: string;
            };

            const settings = getGroupSettings(platform, groupId);
            const admins = getGroupAdmins(platform, groupId);

            return JSON.stringify({
                success: true,
                data: {
                    platform: settings.platform,
                    groupId: settings.groupId,
                    botUsername: settings.botUsername,
                    voiceMode: settings.voiceMode,
                    thinkingLevel: settings.thinkingLevel,
                    ttsProvider: settings.ttsProvider,
                    enabledTools: settings.enabledTools,
                    disabledTools: settings.disabledTools,
                    admins: admins,
                    dangerousToolsCount: DANGEROUS_TOOLS.filter(t => 
                        !settings.enabledTools.includes(t)
                    ).length,
                    totalDangerousTools: DANGEROUS_TOOLS.length
                }
            });
        } catch (err) {
            log.error("Failed to get group settings", err);
            return JSON.stringify({
                success: false,
                error: "Failed to retrieve group settings"
            });
        }
    }
};

/**
 * Update group tool permissions
 */
export const updateGroupToolsTool: Tool = {
    name: "updateGroupTools",
    description: "Enable or disable tools for a group",
    inputSchema: {
        type: "object",
        properties: {
            platform: {
                type: "string",
                description: "Platform identifier"
            },
            groupId: {
                type: "string",
                description: "Group ID"
            },
            toolName: {
                type: "string",
                description: "Tool name to toggle"
            },
            enabled: {
                type: "boolean",
                description: "Whether to enable or disable the tool"
            }
        },
        required: ["platform", "groupId", "toolName", "enabled"]
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            const { platform, groupId, toolName, enabled } = input as {
                platform: string;
                groupId: string;
                toolName: string;
                enabled: boolean;
            };

            const current = getGroupSettings(platform, groupId);
            const enabledToolsSet = new Set(current.enabledTools);
            const disabledToolsSet = new Set(current.disabledTools);

            if (enabled) {
                enabledToolsSet.add(toolName);
                disabledToolsSet.delete(toolName);
            } else {
                disabledToolsSet.add(toolName);
                enabledToolsSet.delete(toolName);
            }

            updateGroupSettings(platform, groupId, {
                enabledTools: Array.from(enabledToolsSet),
                disabledTools: Array.from(disabledToolsSet)
            });

            return JSON.stringify({
                success: true,
                data: {
                    platform,
                    groupId,
                    toolName,
                    enabled,
                    message: `Tool ${toolName} ${enabled ? 'enabled' : 'disabled'} for group`
                }
            });
        } catch (err) {
            log.error("Failed to update group tools", err);
            return JSON.stringify({
                success: false,
                error: "Failed to update group tools"
            });
        }
    }
};

/**
 * Update group voice and thinking settings
 */
export const updateGroupSettingsTool: Tool = {
    name: "updateGroupSettings",
    description: "Update group configuration (voice, thinking level, TTS provider)",
    inputSchema: {
        type: "object",
        properties: {
            platform: {
                type: "string",
                description: "Platform identifier"
            },
            groupId: {
                type: "string",
                description: "Group ID"
            },
            voiceMode: {
                type: "string",
                enum: ["off", "transcribe-only", "full-voice"],
                description: "Voice mode setting"
            },
            thinkingLevel: {
                type: "string",
                enum: ["off", "low", "medium", "high"],
                description: "Thinking level"
            },
            ttsProvider: {
                type: "string",
                enum: ["openai", "elevenlabs"],
                description: "Text-to-speech provider"
            }
        },
        required: ["platform", "groupId"]
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            const { platform, groupId, voiceMode, thinkingLevel, ttsProvider } = input as {
                platform: string;
                groupId: string;
                voiceMode?: string;
                thinkingLevel?: string;
                ttsProvider?: string;
            };

            const updates: Record<string, any> = {};
            if (voiceMode) updates.voiceMode = voiceMode as any;
            if (thinkingLevel) updates.thinkingLevel = thinkingLevel as any;
            if (ttsProvider) updates.ttsProvider = ttsProvider as any;

            if (Object.keys(updates).length === 0) {
                return JSON.stringify({
                    success: false,
                    error: "No settings provided to update"
                });
            }

            updateGroupSettings(platform, groupId, updates);

            const updated = getGroupSettings(platform, groupId);

            return JSON.stringify({
                success: true,
                data: {
                    platform: updated.platform,
                    groupId: updated.groupId,
                    voiceMode: updated.voiceMode,
                    thinkingLevel: updated.thinkingLevel,
                    ttsProvider: updated.ttsProvider,
                    message: "Group settings updated successfully"
                }
            });
        } catch (err) {
            log.error("Failed to update group settings", err);
            return JSON.stringify({
                success: false,
                error: "Failed to update group settings"
            });
        }
    }
};

export const uiAdminTools = [
    listGroupsForUserTool,
    getGroupSettingsTool,
    updateGroupToolsTool,
    updateGroupSettingsTool
];
