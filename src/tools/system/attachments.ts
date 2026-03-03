import type { Tool } from "./index.ts";
import { searchAttachments } from "../../memory/multimodal.ts";

function getSessionIdFromInput(input: Record<string, unknown>): string {
  return String(input["__sessionId"] ?? "").trim();
}

export const searchAttachmentsTool: Tool = {
  name: "search_attachments",
  description:
    "Searches extracted text from session attachments (images/audio/documents) and returns matching attachment records.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search text to find in attachment extracted text",
      },
      limit: {
        type: "number",
        description: "Maximum number of results (default 10)",
      },
    },
    required: ["query"],
  },
  async execute(input) {
    const sessionId = getSessionIdFromInput(input);
    if (!sessionId) {
      return "Error: search_attachments requires active session context.";
    }

    const query = String(input["query"] ?? "");
    const limitRaw = Number(input["limit"] ?? 10);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 10;

    const results = searchAttachments(sessionId, query, limit);
    return JSON.stringify({
      count: results.length,
      attachments: results,
    });
  },
};
