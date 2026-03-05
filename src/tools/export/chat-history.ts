/**
 * Chat History Export Tool
 * Export conversation history in JSON or Markdown format
 */

import type { Tool } from "../index.js";
import { db } from "../../db.ts";
import { createLogger } from "../../logger.ts";
import { gzipSync } from "zlib";

const log = createLogger("export-chat-history");

interface ChatMessage {
  timestamp: string;
  role: "user" | "assistant" | "tool";
  content?: string;
  toolCallId?: string;
  toolCalls?: Array<{
    id: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

interface ExportMetadata {
  exportDate: string;
  sessionId: string;
  messageCount: number;
  format: string;
  compressed: boolean;
}

interface ChatHistoryExportJSON {
  metadata: ExportMetadata;
  messages: ChatMessage[];
}

/**
 * Parse message JSON from database
 */
function parseMessageJson(messageJson: string): ChatMessage | null {
  try {
    const parsed = JSON.parse(messageJson);
    // Structure the message consistently
    const result: ChatMessage = {
      timestamp: new Date().toISOString(),
      role: parsed.role || "user",
    };

    if (parsed.content) {
      result.content = typeof parsed.content === "string" 
        ? parsed.content 
        : JSON.stringify(parsed.content);
    }

    if (parsed.tool_call_id) {
      result.toolCallId = parsed.tool_call_id;
    }

    if (parsed.tool_calls) {
      result.toolCalls = parsed.tool_calls;
    }

    return result;
  } catch (err) {
      log.warn("Failed to parse message JSON", { error: err });
    return null;
  }
}

/**
 * Fetch chat history for a session with pagination
 */
function fetchChatHistory(
  sessionId: string,
  limit: number = 1000,
  offset: number = 0
): { messages: ChatMessage[]; total: number; timestamps: string[] } {
  try {
    // Get total count
    const countRow = db
      .prepare("SELECT COUNT(*) as total FROM memory WHERE session_id = ?")
      .get(sessionId) as { total: number };
    const total = countRow?.total || 0;

    // Get messages with timestamps
    const rows = db
      .prepare(
        "SELECT message_json, timestamp FROM memory WHERE session_id = ? ORDER BY timestamp ASC, id ASC LIMIT ? OFFSET ?"
      )
      .all(sessionId, limit, offset) as { message_json: string; timestamp: string }[];

    const messages: ChatMessage[] = [];
    const timestamps: string[] = [];

    for (const row of rows) {
      const msg = parseMessageJson(row.message_json);
      if (msg) {
        msg.timestamp = row.timestamp || new Date().toISOString();
        messages.push(msg);
        timestamps.push(msg.timestamp);
      }
    }

    return { messages, total, timestamps };
  } catch (err) {
    log.error("Failed to fetch chat history", err);
    return { messages: [], total: 0, timestamps: [] };
  }
}

/**
 * Format messages as markdown
 */
function formatAsMarkdown(
  sessionId: string,
  messages: ChatMessage[],
  metadata: ExportMetadata
): string {
  let markdown = `# Chat History Export\n\n`;
  markdown += `**Export Date:** ${metadata.exportDate}\n`;
  markdown += `**Session ID:** ${sessionId}\n`;
  markdown += `**Total Messages:** ${metadata.messageCount}\n\n`;
  markdown += `---\n\n`;

  for (const msg of messages) {
    const time = new Date(msg.timestamp).toLocaleString();
    const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);

    markdown += `## ${role}\n\n`;
    markdown += `*${time}*\n\n`;

    if (msg.content) {
      markdown += `${msg.content}\n\n`;
    }

    if (msg.toolCalls) {
      markdown += `**Tool Calls:**\n\n`;
      for (const call of msg.toolCalls) {
        markdown += `- \`${call.function.name}\`\n`;
        try {
          const args = JSON.parse(call.function.arguments);
          markdown += `  Arguments: \`\`\`json\n${JSON.stringify(args, null, 2)}\n\`\`\`\n`;
        } catch {
          markdown += `  Arguments: \`${call.function.arguments}\`\n`;
        }
      }
      markdown += `\n`;
    }

    markdown += `---\n\n`;
  }

  return markdown;
}

/**
 * Export chat history tool
 */
export const exportChatHistoryTool: Tool = {
  name: "exportChatHistory",
  description:
    "Export conversation history for a session in JSON or Markdown format. Returns base64 encoded data.",
  inputSchema: {
    type: "object",
    properties: {
      sessionId: {
        type: "string",
        description: "Session ID to export history for",
      },
      format: {
        type: "string",
        enum: ["json", "markdown"],
        description: "Export format (default: json)",
      },
      limit: {
        type: "number",
        description: "Maximum number of messages to export (default: 1000)",
      },
      offset: {
        type: "number",
        description: "Number of messages to skip (default: 0)",
      },
      compress: {
        type: "boolean",
        description: "Enable gzip compression (default: true)",
      },
    },
    required: ["sessionId"],
  },
  async execute(input: Record<string, unknown>): Promise<string> {
    try {
      const {
        sessionId,
        format = "json",
        limit = 1000,
        offset = 0,
        compress = true,
      } = input as {
        sessionId: string;
        format?: string;
        limit?: number;
        offset?: number;
        compress?: boolean;
      };

      if (!sessionId.trim()) {
        return JSON.stringify({
          success: false,
          error: "sessionId is required",
        });
      }

      // Fetch chat history
      const { messages, total } = fetchChatHistory(sessionId, limit, offset);

      if (messages.length === 0) {
        return JSON.stringify({
          success: true,
          warning: "No messages found for this session",
          data: {
            format,
            messageCount: 0,
            base64: "",
            filename: `chat-history-${sessionId}.${format === "json" ? "json" : "md"}`,
          },
        });
      }

      // Create metadata
      const metadata: ExportMetadata = {
        exportDate: new Date().toISOString(),
        sessionId,
        messageCount: messages.length,
        format,
        compressed: compress,
      };

      let exportData: string;

      if (format === "json") {
        const jsonExport: ChatHistoryExportJSON = {
          metadata,
          messages,
        };
        exportData = JSON.stringify(jsonExport, null, 2);
      } else {
        // Markdown format
        exportData = formatAsMarkdown(sessionId, messages, metadata);
      }

      // Compress if requested
      let finalData = exportData;
      let used_compression = false;
      if (compress && exportData.length > 1024) {
        try {
          const buffer = Buffer.from(exportData, "utf-8");
          const compressed = gzipSync(buffer);
          finalData = compressed.toString("base64");
          used_compression = true;
        } catch (err) {
          log.warn("Compression failed, returning uncompressed", { error: err });
        }
      }

      // Encode to base64 if not already compressed
      const base64Data = used_compression
        ? finalData
        : Buffer.from(exportData, "utf-8").toString("base64");

      const extension = format === "json" ? "json" : "md";
      const filename = `chat-history-${sessionId}.${extension}${
        used_compression ? ".gz" : ""
      }`;

      log.info(`Exported ${messages.length} messages for session ${sessionId}`);

      return JSON.stringify({
        success: true,
        data: {
          format,
          messageCount: messages.length,
          totalAvailable: total,
          base64: base64Data,
          filename,
          compressed: used_compression,
          size: finalData.length,
        },
      });
    } catch (err) {
      log.error("Failed to export chat history", err);
      return JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },
};
