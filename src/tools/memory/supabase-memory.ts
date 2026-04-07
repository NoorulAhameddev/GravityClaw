import type { Tool } from "./index.ts";
import { vectorSemanticSearch, isVectorStoreAvailable } from "../../memory/vector.ts";
import { searchMemorySemantic } from "../../memory/supabase.ts";

function getSessionIdFromInput(input: Record<string, unknown>): string {
  return String(input["__sessionId"] ?? "").trim();
}

export const searchMemorySemanticTool: Tool = {
  name: "search_memory_semantic",
  description:
    "Performs semantic (meaning-based) memory search over past conversation messages. Uses a local ChromaDB vector database for accurate results, with automatic fallback to SQLite when ChromaDB is unavailable.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Natural-language semantic search query",
      },
      limit: {
        type: "number",
        description: "Maximum number of matches (default 5, max 50)",
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

    // Prefer local ChromaDB vector store (True RAG)
    if (isVectorStoreAvailable()) {
      const matches = await vectorSemanticSearch(sessionId, query, limit);
      return JSON.stringify({
        engine: "chromadb",
        count: matches.length,
        matches,
      });
    }

    // Fall back to Supabase pgvector or local SQLite
    const matches = await searchMemorySemantic(sessionId, query, limit);
    return JSON.stringify({
      engine: isVectorStoreAvailable() ? "supabase" : "sqlite-fallback",
      count: matches.length,
      matches,
    });
  },
};

