import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../db.ts";
import { config } from "../config.ts";
import { addUserMessage, addAssistantMessage } from "../llm/index.ts";
import {
  searchMemorySemantic,
  setSupabaseMemoryAdapterForTests,
  syncMessageToSupabase,
  type SemanticSearchResult,
} from "../memory/supabase.ts";

const SESSION_ID = "supabase:test";
const testDeps = { db, config };

describe("Supabase + pgvector Memory", () => {
  beforeEach(() => {
    db.prepare("DELETE FROM memory WHERE session_id = ?").run(SESSION_ID);
    setSupabaseMemoryAdapterForTests(null);
  });

  afterEach(() => {
    db.prepare("DELETE FROM memory WHERE session_id = ?").run(SESSION_ID);
    setSupabaseMemoryAdapterForTests(null);
  });

  it("falls back to local semantic search when Supabase is not configured", async () => {
    addUserMessage(SESSION_ID, "I prefer concise TypeScript responses with examples", testDeps);
    addAssistantMessage(SESSION_ID, "Understood, I will keep responses concise.", testDeps);
    addUserMessage(SESSION_ID, "Use pgvector semantic search for memory recall", testDeps);

    const matches = await searchMemorySemantic(SESSION_ID, "semantic memory search", 3);

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]?.sessionId).toBe(SESSION_ID);
    expect(matches.some((m) => m.content.toLowerCase().includes("semantic"))).toBe(true);
  });

  it("uses adapter semantic search when provided", async () => {
    const adapterResults: SemanticSearchResult[] = [
      {
        id: "m1",
        sessionId: SESSION_ID,
        role: "user",
        content: "adapter result",
        timestamp: new Date().toISOString(),
        similarity: 0.99,
      },
    ];

    setSupabaseMemoryAdapterForTests({
      async upsertSession() { },
      async insertMessage() { },
      async semanticSearch() {
        return adapterResults;
      },
    });

    const matches = await searchMemorySemantic(SESSION_ID, "anything", 5);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.content).toBe("adapter result");
    expect(matches[0]?.similarity).toBeCloseTo(0.99, 3);
  });

  it("syncMessageToSupabase sends session and message payload via adapter", async () => {
    let sessionUpserted = false;
    let messageInserted = false;

    setSupabaseMemoryAdapterForTests({
      async upsertSession(payload) {
        sessionUpserted = payload.id === SESSION_ID;
      },
      async insertMessage(payload) {
        messageInserted = payload.session_id === SESSION_ID && payload.content.includes("hello");
      },
      async semanticSearch() {
        return [];
      },
    });

    const synced = await syncMessageToSupabase({
      sessionId: SESSION_ID,
      role: "user",
      content: "hello from sync",
    });

    expect(synced).toBe(true);
    expect(sessionUpserted).toBe(true);
    expect(messageInserted).toBe(true);
  });

  it("returns empty results for blank semantic query", async () => {
    const matches = await searchMemorySemantic(SESSION_ID, "   ", 5);
    expect(matches).toEqual([]);
  });
});
