/**
 * Agent-to-Agent Communication Tools
 *
 * Tools for inter-agent messaging, session listings, and permission management.
 * Integrates with the AgentMessaging system for secure cross-session communication.
 */

import { AgentMessaging } from "../../agents/communication.ts";
import type { Tool } from "./index.ts";
import { createLogger } from "../../logger.ts";

const log = createLogger("communication-tools");

/**
 * List all active sessions
 */
export const sessionsListTool: Tool = {
  name: "sessions_list",
  description: "List all active agent sessions with metadata (ID, last activity, messaging status)",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  async execute(): Promise<string> {
    try {
      const sessions = AgentMessaging.listSessions();

      if (sessions.length === 0) {
        return JSON.stringify({
          success: true,
          sessions: [],
          count: 0,
          message: "No active sessions found",
        });
      }

      return JSON.stringify({
        success: true,
        sessions: sessions.map((s) => ({
          id: s.id,
          active: s.active,
          lastActivity: s.lastActivity.toISOString(),
          allowMessages: s.allowMessages,
        })),
        count: sessions.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`sessions_list error: ${message}`);
      return JSON.stringify({
        success: false,
        error: message,
      });
    }
  },
};

/**
 * Read another session's message history (requires permission)
 */
export const sessionsHistoryTool: Tool = {
  name: "sessions_history",
  description:
    "Read message history from another session (requires target session to have messaging enabled). Use limit to retrieve most recent N messages.",
  inputSchema: {
    type: "object",
    properties: {
      session_id: {
        type: "string",
        description: "Target session ID to read history from",
      },
      limit: {
        type: "number",
        description: "Maximum number of messages to return (optional, default: all)",
      },
    },
    required: ["session_id"],
  },
  async execute(input: Record<string, unknown>): Promise<string> {
    const sessionId = String(input.session_id ?? "");
    const limit = typeof input.limit === "number" ? input.limit : undefined;

    if (!sessionId) {
      return JSON.stringify({
        success: false,
        error: "Missing required parameter: session_id",
      });
    }

    try {
      // Check if target session allows messages
      if (!AgentMessaging.canReceiveMessages(sessionId)) {
        return JSON.stringify({
          success: false,
          error: `Session ${sessionId} does not allow message reading`,
        });
      }

      const messages = AgentMessaging.readHistory(sessionId, limit);

      return JSON.stringify({
        success: true,
        messages: messages.map((m) => ({
          id: m.id,
          fromSessionId: m.fromSessionId,
          toSessionId: m.toSessionId,
          content: m.content,
          timestamp: m.timestamp.toISOString(),
        })),
        count: messages.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`sessions_history error: ${message}`);
      return JSON.stringify({
        success: false,
        error: message,
      });
    }
  },
};

/**
 * Send a message to another session
 */
export const sessionsSendTool: Tool = {
  name: "sessions_send",
  description: "Send a message to another agent session. Target session must have messaging enabled.",
  inputSchema: {
    type: "object",
    properties: {
      session_id: {
        type: "string",
        description: "Target session ID",
      },
      message: {
        type: "string",
        description: "Message content to send",
      },
    },
    required: ["session_id", "message"],
  },
  async execute(input: Record<string, unknown>): Promise<string> {
    const sessionId = String(input.session_id ?? "");
    const message = String(input.message ?? "");

    if (!sessionId || !message) {
      return JSON.stringify({
        success: false,
        error: "Missing required parameters: session_id and message",
      });
    }

    try {
      AgentMessaging.sendMessage("system", sessionId, message);

      return JSON.stringify({
        success: true,
        message: `Message sent to session ${sessionId}`,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error(`sessions_send error: ${errMsg}`);
      return JSON.stringify({
        success: false,
        error: errMsg,
      });
    }
  },
};

/**
 * Grant permission for cross-session access
 */
export const sessionsGrantPermissionTool: Tool = {
  name: "sessions_grant_permission",
  description:
    "Grant or enable messaging permissions for a session. Use this to allow other agents to read history or send messages.",
  inputSchema: {
    type: "object",
    properties: {
      session_id: {
        type: "string",
        description: "Session ID to enable messaging for",
      },
      allow_messages: {
        type: "boolean",
        description: "Enable/disable message reception for this session",
      },
    },
    required: ["session_id"],
  },
  async execute(input: Record<string, unknown>): Promise<string> {
    const sessionId = String(input.session_id ?? "");
    const allowMessages = input.allow_messages !== false;

    if (!sessionId) {
      return JSON.stringify({
        success: false,
        error: "Missing required parameter: session_id",
      });
    }

    try {
      AgentMessaging.setAllowMessages(sessionId, allowMessages);

      return JSON.stringify({
        success: true,
        message: `Session ${sessionId} messaging ${allowMessages ? "enabled" : "disabled"}`,
        sessionId,
        allowMessages,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error(`sessions_grant_permission error: ${errMsg}`);
      return JSON.stringify({
        success: false,
        error: errMsg,
      });
    }
  },
};

/**
 * Export all communication tools
 */
export const communicationTools: Tool[] = [sessionsListTool, sessionsHistoryTool, sessionsSendTool, sessionsGrantPermissionTool];
