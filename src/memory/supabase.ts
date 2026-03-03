import OpenAI from "openai";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.ts";
import { createLogger } from "../logger.ts";
import { db } from "../db.ts";

const log = createLogger("memory:supabase");

export interface SemanticSearchResult {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  timestamp: string;
  similarity: number;
}

interface SessionSyncPayload {
  id: string;
  user_id?: string;
  channel_id?: string;
  chat_id?: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
}

interface MessageSyncPayload {
  id: string;
  session_id: string;
  role: string;
  content: string;
  timestamp: string;
  embedding?: number[];
}

interface SupabaseMemoryAdapter {
  upsertSession(payload: SessionSyncPayload): Promise<void>;
  insertMessage(payload: MessageSyncPayload): Promise<void>;
  semanticSearch(payload: {
    sessionId: string;
    queryEmbedding: number[];
    limit: number;
  }): Promise<SemanticSearchResult[]>;
}

let adapterOverride: SupabaseMemoryAdapter | null = null;

let client: SupabaseClient | null = null;

function isSupabaseConfigured(): boolean {
  return Boolean(config.SUPABASE_URL && config.SUPABASE_KEY);
}

function getClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!client) {
    client = createClient(config.SUPABASE_URL!, config.SUPABASE_KEY!);
  }

  return client;
}

function parseSessionId(sessionId: string): { channelId?: string; chatId?: string } {
  const [channelId, ...rest] = sessionId.split(":");
  const chatId = rest.length > 0 ? rest.join(":") : undefined;

  const parsed: { channelId?: string; chatId?: string } = {};
  if (channelId) {
    parsed.channelId = channelId;
  }
  if (chatId) {
    parsed.chatId = chatId;
  }

  return parsed;
}

function hashTokenToIndex(token: string, dims: number): number {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
  }
  return hash % dims;
}

function normalizeVector(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    return vector;
  }
  return vector.map((value) => value / norm);
}

function fallbackEmbedding(text: string, dims = 64): number[] {
  const vector = Array.from({ length: dims }, () => 0);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  for (const token of tokens) {
    const idx = hashTokenToIndex(token, dims);
    vector[idx] = (vector[idx] ?? 0) + 1;
  }

  return normalizeVector(vector);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const cleaned = text.trim();
  if (!cleaned) {
    return fallbackEmbedding("empty");
  }

  if (!config.OPENAI_API_KEY) {
    return fallbackEmbedding(cleaned);
  }

  try {
    const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
    const response = await openai.embeddings.create({
      model: config.OPENAI_EMBEDDING_MODEL,
      input: cleaned,
    });

    const embedding = response.data[0]?.embedding;
    if (!embedding) {
      return fallbackEmbedding(cleaned);
    }

    return embedding;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    log.warn(`Embedding API failed, using fallback embedding: ${message}`);
    return fallbackEmbedding(cleaned);
  }
}

function createDefaultAdapter(): SupabaseMemoryAdapter {
  return {
    async upsertSession(payload) {
      const supabase = getClient();
      if (!supabase) {
        return;
      }

      const { error } = await supabase.from("sessions").upsert(payload, {
        onConflict: "id",
      });

      if (error) {
        throw new Error(`Supabase upsert session failed: ${error.message}`);
      }
    },

    async insertMessage(payload) {
      const supabase = getClient();
      if (!supabase) {
        return;
      }

      const { error } = await supabase.from("messages").insert(payload);

      if (error) {
        throw new Error(`Supabase insert message failed: ${error.message}`);
      }
    },

    async semanticSearch(payload) {
      const supabase = getClient();
      if (!supabase) {
        return [];
      }

      const { data, error } = await supabase.rpc("search_memory_semantic", {
        query_session_id: payload.sessionId,
        query_embedding: payload.queryEmbedding,
        match_count: payload.limit,
      });

      if (error) {
        throw new Error(`Supabase semantic search failed: ${error.message}`);
      }

      const rows = (data ?? []) as Array<{
        id: string;
        session_id: string;
        role: string;
        content: string;
        timestamp: string;
        similarity: number;
      }>;

      return rows.map((row) => ({
        id: row.id,
        sessionId: row.session_id,
        role: row.role,
        content: row.content,
        timestamp: row.timestamp,
        similarity: row.similarity,
      }));
    },
  };
}

function getAdapter(): SupabaseMemoryAdapter {
  return adapterOverride ?? createDefaultAdapter();
}

export function setSupabaseMemoryAdapterForTests(adapter: SupabaseMemoryAdapter | null): void {
  adapterOverride = adapter;
}

export function isSupabaseMemoryEnabled(): boolean {
  return isSupabaseConfigured() || adapterOverride !== null;
}

export async function syncMessageToSupabase(input: {
  sessionId: string;
  role: string;
  content: string;
  timestamp?: string;
}): Promise<boolean> {
  if (!isSupabaseMemoryEnabled()) {
    return false;
  }

  try {
    const timestamp = input.timestamp ?? new Date().toISOString();
    const embedding = await generateEmbedding(input.content);
    const { channelId, chatId } = parseSessionId(input.sessionId);

    const adapter = getAdapter();

    const sessionPayload: SessionSyncPayload = {
      id: input.sessionId,
      metadata: {
        source: "gravityclaw",
      },
      embedding,
    };

    if (channelId) {
      sessionPayload.channel_id = channelId;
    }
    if (chatId) {
      sessionPayload.chat_id = chatId;
    }

    await adapter.upsertSession(sessionPayload);

    await adapter.insertMessage({
      id: `${input.sessionId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      session_id: input.sessionId,
      role: input.role,
      content: input.content,
      timestamp,
      embedding,
    });

    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    log.warn(`Supabase async sync failed: ${message}`);
    return false;
  }
}

export function enqueueMessageSync(input: {
  sessionId: string;
  role: string;
  content: string;
  timestamp?: string;
}): void {
  void syncMessageToSupabase(input);
}

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function fallbackLocalSemanticSearch(sessionId: string, query: string, limit: number): SemanticSearchResult[] {
  const rows = db
    .prepare(
      `
      SELECT id, session_id, timestamp, message_json
      FROM memory
      WHERE session_id = ?
      ORDER BY timestamp DESC, id DESC
      LIMIT 200
      `
    )
    .all(sessionId) as Array<{
    id: number;
    session_id: string;
    timestamp: string;
    message_json: string;
  }>;

  const queryEmbedding = fallbackEmbedding(query);

  const scored = rows
    .map((row) => {
      let role = "unknown";
      let content = "";

      try {
        const message = JSON.parse(row.message_json) as { role?: string; content?: unknown };
        role = message.role ?? "unknown";
        if (typeof message.content === "string") {
          content = message.content;
        } else if (Array.isArray(message.content)) {
          content = message.content.map((item) => (typeof item === "string" ? item : "")).join(" ");
        }
      } catch {
        content = row.message_json;
      }

      const similarity = cosineSimilarity(queryEmbedding, fallbackEmbedding(content));

      return {
        id: String(row.id),
        sessionId: row.session_id,
        role,
        content,
        timestamp: row.timestamp,
        similarity,
      } satisfies SemanticSearchResult;
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, Math.max(1, Math.min(50, limit)));

  return scored;
}

export async function searchMemorySemantic(
  sessionId: string,
  query: string,
  limit = 5
): Promise<SemanticSearchResult[]> {
  const cleaned = query.trim();
  if (!cleaned) {
    return [];
  }

  const clampedLimit = Math.max(1, Math.min(50, Math.floor(limit)));

  if (!isSupabaseMemoryEnabled()) {
    return fallbackLocalSemanticSearch(sessionId, cleaned, clampedLimit);
  }

  try {
    const queryEmbedding = await generateEmbedding(cleaned);
    const adapter = getAdapter();
    const results = await adapter.semanticSearch({
      sessionId,
      queryEmbedding,
      limit: clampedLimit,
    });

    if (results.length === 0) {
      return fallbackLocalSemanticSearch(sessionId, cleaned, clampedLimit);
    }

    return results;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    log.warn(`Semantic search fallback to SQLite due to error: ${message}`);
    return fallbackLocalSemanticSearch(sessionId, cleaned, clampedLimit);
  }
}
