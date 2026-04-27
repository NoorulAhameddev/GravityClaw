/**
 * Admin Tools - Group Management, Permissions, Plugins
 * Provides backend support for Admin Panel and Plugins dashboards
 */

import type { Tool } from "./index.ts";
import { db } from "../../db.ts";
import { createLogger } from "../../logger.ts";
import {
    getGroupSettings,
    DANGEROUS_TOOLS,
} from "../../groups/index.ts";

const log = createLogger("admin-tools");

/**
 * List groups where user is admin
 */
export const listGroupsForUserTool: Tool = {
    name: "listGroupsForUser",
    description: "List all groups where the user is an admin",
    inputSchema: {
        type: "object",
        properties: {
            userId: {
                type: "string",
                description: "User ID"
            },
            sessionId: {
                type: "string",
                description: "Session ID for context"
            }
        },
        required: ["sessionId"]
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            const { sessionId, userId } = input as {
                sessionId: string;
                userId?: string;
            };

            // Get groups from group_sessions table
            const groupSessions = db.prepare(`
                SELECT DISTINCT platform, group_id FROM group_sessions LIMIT 100
            `).all() as Array<{ platform: string; group_id: string }>;

            const groupsData = groupSessions.map(gs => {
                const settings = getGroupSettings(gs.platform, gs.group_id);
                return {
                    platform: gs.platform,
                    groupId: gs.group_id,
                    botUsername: settings.botUsername,
                    voiceMode: settings.voiceMode,
                    thinkingLevel: settings.thinkingLevel,
                    disabledToolCount: settings.disabledTools.length,
                    enabledToolCount: settings.enabledTools.length
                };
            });

            return JSON.stringify({
                success: true,
                data: {
                    groups: groupsData,
                    total: groupsData.length
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
 * Get group settings
 */
export const getGroupSettingsTool: Tool = {
    name: "getGroupSettings",
    description: "Get detailed settings for a specific group",
    inputSchema: {
        type: "object",
        properties: {
            platform: {
                type: "string",
                description: "Platform (telegram, whatsapp, etc)"
            },
            groupId: {
                type: "string",
                description: "Group ID"
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

            return JSON.stringify({
                success: true,
                data: settings
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
export const updateGroupToolPermissionsTool: Tool = {
    name: "updateGroupToolPermissions",
    description: "Enable or disable specific tools for a group",
    inputSchema: {
        type: "object",
        properties: {
            platform: {
                type: "string",
                description: "Platform (telegram, whatsapp, etc)"
            },
            groupId: {
                type: "string",
                description: "Group ID"
            },
            toolName: {
                type: "string",
                description: "Tool name to enable/disable"
            },
            enabled: {
                type: "boolean",
                description: "Whether to enable (true) or disable (false) the tool"
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

            const settings = getGroupSettings(platform, groupId);
            
            if (enabled) {
                // Remove from disabledTools, add to enabledTools if not already there
                settings.disabledTools = settings.disabledTools.filter(t => t !== toolName);
                if (!settings.enabledTools.includes(toolName)) {
                    settings.enabledTools.push(toolName);
                }
            } else {
                // Add to disabledTools, remove from enabledTools
                settings.enabledTools = settings.enabledTools.filter(t => t !== toolName);
                if (!settings.disabledTools.includes(toolName)) {
                    settings.disabledTools.push(toolName);
                }
            }

            // Save to database
            db.prepare(`
                INSERT OR REPLACE INTO group_settings 
                (platform, group_id, enabled_tools, disabled_tools)
                VALUES (?, ?, ?, ?)
            `).run(
                platform,
                groupId,
                JSON.stringify(settings.enabledTools),
                JSON.stringify(settings.disabledTools)
            );

            return JSON.stringify({
                success: true,
                data: {
                    toolName,
                    enabled,
                    disabledTools: settings.disabledTools,
                    enabledTools: settings.enabledTools
                }
            });
        } catch (err) {
            log.error("Failed to update tool permissions", err);
            return JSON.stringify({
                success: false,
                error: "Failed to update tool permissions"
            });
        }
    }
};

/**
 * Get dangerous tools list
 */
export const getDangerousToolsTool: Tool = {
    name: "getDangerousTools",
    description: "Get list of tools that require admin privileges",
    inputSchema: {
        type: "object",
        properties: {}
    },
    async execute(): Promise<string> {
        try {
            return JSON.stringify({
                success: true,
                data: {
                    tools: DANGEROUS_TOOLS,
                    count: DANGEROUS_TOOLS.length,
                    warning: "These tools require admin privileges to enable"
                }
            });
        } catch (err) {
            log.error("Failed to get dangerous tools", err);
            return JSON.stringify({
                success: false,
                error: "Failed to retrieve dangerous tools list"
            });
        }
    }
};

/**
 * List installed plugins
 */
export const listPluginsTool: Tool = {
    name: "listPlugins",
    description: "List all installed and available plugins",
    inputSchema: {
        type: "object",
        properties: {
            filter: {
                type: "string",
                enum: ["installed", "available", "all"],
                description: "Filter by status (default: installed)"
            }
        }
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            const { filter = "installed" } = input as { filter?: string };

            // Try to get plugins from the registry
            let plugins: Record<string, unknown>[] = [];
            try {
                const pluginRows = db.prepare(`
                    SELECT * FROM plugins ORDER BY installed_at DESC
                `).all() as any[];

                plugins = pluginRows.map(row => ({
                    id: row.id,
                    name: row.name,
                    version: row.version,
                    description: row.description,
                    status: row.status || "loaded",
                    installedAt: row.installed_at,
                    category: row.category
                }));
            } catch (err) {
                log.warn("Plugins table not available, returning empty list");
            }

            return JSON.stringify({
                success: true,
                data: {
                    plugins,
                    total: plugins.length,
                    filter
                }
            });
        } catch (err) {
            log.error("Failed to list plugins", err);
            return JSON.stringify({
                success: false,
                error: "Failed to retrieve plugins"
            });
        }
    }
};

/**
 * Get plugin details
 */
export const getPluginDetailsTool: Tool = {
    name: "getPluginDetails",
    description: "Get detailed information about a specific plugin",
    inputSchema: {
        type: "object",
        properties: {
            pluginId: {
                type: "string",
                description: "Plugin ID or name"
            }
        },
        required: ["pluginId"]
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            const { pluginId } = input as { pluginId: string };

            // Try to get plugin from database
            const plugin = db.prepare(`
                SELECT * FROM plugins WHERE id = ? OR name = ?
            `).get(pluginId, pluginId) as any;

            if (!plugin) {
                return JSON.stringify({
                    success: false,
                    error: "Plugin not found"
                });
            }

            return JSON.stringify({
                success: true,
                data: {
                    id: plugin.id,
                    name: plugin.name,
                    version: plugin.version,
                    description: plugin.description,
                    status: plugin.status || "loaded",
                    category: plugin.category,
                    permissions: JSON.parse(plugin.permissions || "[]"),
                    config: JSON.parse(plugin.config || "{}"),
                    errors: JSON.parse(plugin.errors || "[]"),
                    installedAt: plugin.installed_at
                }
            });
        } catch (err) {
            log.error("Failed to get plugin details", err);
            return JSON.stringify({
                success: false,
                error: "Failed to retrieve plugin details"
            });
        }
    }
};

/**
 * Toggle plugin enabled/disabled status
 */
export const togglePluginTool: Tool = {
    name: "togglePlugin",
    description: "Enable or disable a plugin",
    inputSchema: {
        type: "object",
        properties: {
            pluginId: {
                type: "string",
                description: "Plugin ID or name"
            },
            enabled: {
                type: "boolean",
                description: "Whether to enable (true) or disable (false)"
            }
        },
        required: ["pluginId", "enabled"]
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            const { pluginId, enabled } = input as {
                pluginId: string;
                enabled: boolean;
            };

            const status = enabled ? "loaded" : "disabled";

            db.prepare(`
                UPDATE plugins SET status = ? WHERE id = ? OR name = ?
            `).run(status, pluginId, pluginId);

            return JSON.stringify({
                success: true,
                data: {
                    pluginId,
                    status,
                    enabled
                }
            });
        } catch (err) {
            log.error("Failed to toggle plugin", err);
            return JSON.stringify({
                success: false,
                error: "Failed to toggle plugin status"
            });
        }
    }
};

/**
 * Configure plugin with custom settings
 */
export const configurePluginTool: Tool = {
    name: "configurePlugin",
    description: "Configure a plugin with custom settings and options",
    inputSchema: {
        type: "object",
        properties: {
            pluginId: {
                type: "string",
                description: "Plugin ID or name"
            },
            config: {
                type: "object",
                description: "Configuration object for the plugin"
            }
        },
        required: ["pluginId", "config"]
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            const { pluginId, config } = input as {
                pluginId: string;
                config: Record<string, unknown>;
            };

            db.prepare(`
                UPDATE plugins SET config = ? WHERE id = ? OR name = ?
            `).run(JSON.stringify(config), pluginId, pluginId);

            return JSON.stringify({
                success: true,
                data: {
                    pluginId,
                    config,
                    updated: true
                }
            });
        } catch (err) {
            log.error("Failed to configure plugin", err);
            return JSON.stringify({
                success: false,
                error: "Failed to configure plugin"
            });
        }
    }
};

/**
 * Shutdown or restart the system
 */
export const shutdownSystemTool: Tool = {
    name: "shutdownSystem",
    description: "Shutdown or restart the Gravity Claw process (Admin only)",
    inputSchema: {
        type: "object",
        properties: {
            reason: {
                type: "string",
                description: "Reason for shutdown"
            },
            restart: {
                type: "boolean",
                description: "Whether to restart (if managed by process manager)"
            }
        },
        required: ["reason"]
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        const { reason, restart } = input as { reason: string; restart?: boolean };
        log.warn(`SYSTEM SHUTDOWN REQUESTED: ${reason} (restart: ${restart})`);
        
        // Trigger shutdown in next tick to allow response to be sent
        setTimeout(() => {
            log.info("Process exiting...");
            process.exit(restart ? 0 : 0); // Both exit, process manager should handle restart
        }, 1000);

        return JSON.stringify({
            success: true,
            message: `Shutdown initiated. Reason: ${reason}`
        });
    }
};

export const adminTools = [
    listGroupsForUserTool,
    getGroupSettingsTool,
    updateGroupToolPermissionsTool,
    getDangerousToolsTool,
    listPluginsTool,
    getPluginDetailsTool,
    togglePluginTool,
    configurePluginTool,
    shutdownSystemTool
];

