/**
 * Tool Permission System
 * 
 * Wraps tool execution with permission checks for group chats.
 */

import { createLogger } from "../logger.ts";
import { isToolAllowedForUser, DANGEROUS_TOOLS } from "../groups/index.ts";
import type { Tool } from "../tools/index.ts";

const log = createLogger("tool-permissions");

/**
 * Context for tool execution (extracted from session)
 */
export interface ToolExecutionContext {
  sessionId: string;
  userId?: string;
  platform?: string;
  groupId?: string;
  isGroup?: boolean;
}

/**
 * Create a permission-checked wrapper for a tool
 */
export function wrapToolWithPermissionCheck(tool: Tool): Tool {
  return {
    ...tool,
    async execute(input: Record<string, unknown>): Promise<string> {
      // Extract context from input (passed via __sessionId, __userId, etc.)
      const sessionId = String(input["__sessionId"] || "");
      const userId = String(input["__userId"] || "");
      const platform = String(input["__platform"] || "");
      const groupId = String(input["__groupId"] || "");
      const isGroup = Boolean(input["__isGroup"]);

      if (!isGroup || !groupId || !platform || !userId) {
        return "Error: Deprecated permission wrapper disabled. Use ToolExecutor for tool execution.";
      }

      // Check if user has permission to execute this tool
      const allowed = isToolAllowedForUser(platform, groupId, userId, tool.name);

      if (!allowed) {
        const isDangerous = DANGEROUS_TOOLS.includes(tool.name);
        if (isDangerous) {
          log.warn(
            `User ${userId} attempted to use admin-only tool ${tool.name} in group ${platform}:${groupId}`
          );
          return `Error: The tool "${tool.name}" requires administrator privileges in this group.`;
        } else {
          log.warn(
            `User ${userId} attempted to use disabled tool ${tool.name} in group ${platform}:${groupId}`
          );
          return `Error: The tool "${tool.name}" is disabled in this group.`;
        }
      }

      return "Error: Deprecated permission wrapper disabled. Use ToolExecutor for tool execution.";
    },
  };
}

/**
 * Extract execution context from UnifiedMessage
 */
export function createExecutionContext(message: {
  sessionId?: string;
  userId?: string;
  platform?: string;
  groupId?: string;
  isGroup?: boolean;
}): Record<string, unknown> {
  return {
    __sessionId: message.sessionId,
    __userId: message.userId,
    __platform: message.platform,
    __groupId: message.groupId,
    __isGroup: message.isGroup,
  };
}
