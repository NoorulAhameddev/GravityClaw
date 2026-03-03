/**
 * Dashboard Tools - Analytics, Settings, and Configuration
 * Provides backend support for the admin dashboard
 */

import type { Tool } from "./index.ts";
import { getUsageStats, getRecentUsage } from "../../usage.ts";
import type { UsageRecord, UsageStats } from "../../usage.ts";
import { db } from "../../db.ts";
import { createLogger } from "../../logger.ts";
import { getSessionSettings, setSessionSettings } from "../../session.ts";

const log = createLogger("dashboard-tools");

/**
 * Get usage statistics for a session
 */
export const getUsageStatsTool: Tool = {
    name: "getUsageStats",
    description: "Get usage statistics (tokens, costs, latency) for the current session",
    inputSchema: {
        type: "object",
        properties: {
            sessionId: {
                type: "string",
                description: "Session ID to get stats for"
            }
        },
        required: ["sessionId"]
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            const { sessionId } = input as { sessionId: string };
            const stats = getUsageStats(sessionId);
            
            return JSON.stringify({
                success: true,
                data: stats
            });
        } catch (err) {
            log.error("Failed to get usage stats", err);
            return JSON.stringify({
                success: false,
                error: "Failed to retrieve usage statistics"
            });
        }
    }
};

/**
 * Get usage history with pagination
 */
export const getUsageHistoryTool: Tool = {
    name: "getUsageHistory",
    description: "Get paginated usage history for a session",
    inputSchema: {
        type: "object",
        properties: {
            sessionId: {
                type: "string",
                description: "Session ID to get history for"
            },
            limit: {
                type: "number",
                description: "Maximum number of records to return (default: 50)"
            },
            offset: {
                type: "number",
                description: "Number of records to skip (default: 0)"
            }
        },
        required: ["sessionId"]
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            const { sessionId, limit = 50, offset = 0 } = input as {
                sessionId: string;
                limit?: number;
                offset?: number;
            };

            const records = getRecentUsage(limit, sessionId);
            
            return JSON.stringify({
                success: true,
                data: {
                    records,
                    total: records.length,
                    limit,
                    offset
                }
            });
        } catch (err) {
            log.error("Failed to get usage history", err);
            return JSON.stringify({
                success: false,
                error: "Failed to retrieve usage history"
            });
        }
    }
};

/**
 * Get model breakdown with costs
 */
export const getModelBreakdownTool: Tool = {
    name: "getModelBreakdown",
    description: "Get cost and token breakdown by AI model for a session",
    inputSchema: {
        type: "object",
        properties: {
            sessionId: {
                type: "string",
                description: "Session ID to get breakdown for"
            }
        },
        required: ["sessionId"]
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            const { sessionId } = input as { sessionId: string };
            const stats = getUsageStats(sessionId);
            
            // Return just the models array in a more consumable format
            const breakdown = stats.models.map(m => ({
                model: m.model,
                calls: m.calls,
                totalTokens: m.tokens,
                totalCost: m.cost,
                costPerToken: m.tokens > 0 ? m.cost / m.tokens : 0
            }));

            return JSON.stringify({
                success: true,
                data: breakdown
            });
        } catch (err) {
            log.error("Failed to get model breakdown", err);
            return JSON.stringify({
                success: false,
                error: "Failed to retrieve model breakdown"
            });
        }
    }
};

/**
 * Get session information
 */
export const getSessionInfoTool: Tool = {
    name: "getSessionInfo",
    description: "Get current session information and settings",
    inputSchema: {
        type: "object",
        properties: {
            sessionId: {
                type: "string",
                description: "Session ID to get info for"
            }
        },
        required: ["sessionId"]
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            const { sessionId } = input as { sessionId: string };
            const settings = getSessionSettings(sessionId);
            
            // Get session creation time from database
            const sessionRow = db.prepare(
                "SELECT created_at FROM sessions WHERE id = ?"
            ).get(sessionId) as { created_at: string } | undefined;

            const createdAt = sessionRow?.created_at || new Date().toISOString();
            const uptime = new Date().getTime() - new Date(createdAt).getTime();

            return JSON.stringify({
                success: true,
                data: {
                    sessionId,
                    createdAt,
                    uptime,
                    uptimeFormatted: formatUptime(uptime),
                    settings
                }
            });
        } catch (err) {
            log.error("Failed to get session info", err);
            return JSON.stringify({
                success: false,
                error: "Failed to retrieve session information"
            });
        }
    }
};

/**
 * Set notification preferences
 */
export const setNotificationPreferencesTool: Tool = {
    name: "setNotificationPreferences",
    description: "Set notification preferences for the current session",
    inputSchema: {
        type: "object",
        properties: {
            sessionId: {
                type: "string",
                description: "Session ID"
            },
            notifications: {
                type: "object",
                description: "Notification preferences",
                properties: {
                    successNotifications: { type: "boolean" },
                    warningNotifications: { type: "boolean" },
                    errorNotifications: { type: "boolean" },
                    desktopNotifications: { type: "boolean" },
                    soundEnabled: { type: "boolean" },
                    frequency: { 
                        type: "string",
                        enum: ["realtime", "batched", "hourly", "minimal"]
                    }
                }
            }
        },
        required: ["sessionId", "notifications"]
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            const { sessionId, notifications } = input as {
                sessionId: string;
                notifications: Record<string, unknown>;
            };

            const settings = getSessionSettings(sessionId);
            const updated = {
                ...settings,
                notifications
            };
            
            setSessionSettings(sessionId, updated);

            return JSON.stringify({
                success: true,
                data: updated
            });
        } catch (err) {
            log.error("Failed to set notification preferences", err);
            return JSON.stringify({
                success: false,
                error: "Failed to save notification preferences"
            });
        }
    }
};

/**
 * Get notification preferences
 */
export const getNotificationPreferencesTool: Tool = {
    name: "getNotificationPreferences",
    description: "Get current notification preferences",
    inputSchema: {
        type: "object",
        properties: {
            sessionId: {
                type: "string",
                description: "Session ID"
            }
        },
        required: ["sessionId"]
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            const { sessionId } = input as { sessionId: string };
            const settings = getSessionSettings(sessionId);
            
            return JSON.stringify({
                success: true,
                data: settings.notifications || {
                    successNotifications: true,
                    warningNotifications: true,
                    errorNotifications: true,
                    desktopNotifications: false,
                    soundEnabled: true,
                    frequency: "realtime"
                }
            });
        } catch (err) {
            log.error("Failed to get notification preferences", err);
            return JSON.stringify({
                success: false,
                error: "Failed to retrieve notification preferences"
            });
        }
    }
};

// Helper function to format uptime
function formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

export const dashboardTools = [
    getUsageStatsTool,
    getUsageHistoryTool,
    getModelBreakdownTool,
    getSessionInfoTool,
    setNotificationPreferencesTool,
    getNotificationPreferencesTool
];
