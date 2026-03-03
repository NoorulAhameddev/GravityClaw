import type { Tool } from "./index.ts";
import { searchMemorySemantic } from "../../memory/supabase.ts";

function getSessionIdFromInput(input: Record<string, unknown>): string {
  return String(input["__sessionId"] ?? "").trim();
}

export const searchMemorySemanticTool: Tool = {
  name: "search_memory_semantic",
  description:
    "Performs semantic memory search over session messages using Supabase pgvector when configured, with local fallback when unavailable.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Natural-language semantic search query",
      },
      limit: {
        type: "number",
        description: "Maximum number of matches (default 5)",
      },
    },
    required: ["query"],
  },
  async execute(input) {
    const sessionId = getSessionIdFromInput(input);
    if (!sessionId) {
      return "Error: search_memory_semantic requires active session context.";
    }

    const query = String(input["query"] ?? "");
    const limitRaw = Number(input["limit"] ?? 5);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 5;

    const matches = await searchMemorySemantic(sessionId, query, limit);

    return JSON.stringify({
      count: matches.length,
      matches,
    });
  },
};
