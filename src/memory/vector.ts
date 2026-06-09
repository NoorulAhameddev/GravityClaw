/**
 * Local Vector Memory (True RAG)
 *
 * Primary: ChromaDB HTTP server (if available at CHROMA_URL)
 * Fallback: SQLite with BM25 keyword search + TF-IDF similarity
 */
import { ChromaClient, type Collection, type EmbeddingFunction } from "chromadb";
import { createLogger } from "../logger.ts";
import { generateEmbedding, fallbackLocalSemanticSearch } from "./supabase.ts";
import { db } from "../db.ts";
import type { SemanticSearchResult } from "../types/memory.js";
import { CHROMA_URL } from "../config.ts";
import { meter } from "../lib/telemetry/metrics.ts";

const log = createLogger("memory:vector");

const COLLECTION_NAME = "gravity_claw_memory";

let client: ChromaClient | null = null;
let collection: Collection | null = null;
let chromaAvailable = false;

// Create observable gauge for ChromaDB availability
const vectorStoreAvailableGauge = meter.createObservableGauge("vector_store_available", {
    description: "Whether the vector store (ChromaDB) is currently available (1) or not (0)",
    unit: "1",
});

vectorStoreAvailableGauge.addCallback((observableResult) => {
    observableResult.observe(chromaAvailable ? 1 : 0);
});

function setChromaAvailable(available: boolean): void {
    if (available !== chromaAvailable) {
        if (available) {
            log.info("ChromaDB vector store has become AVAILABLE.");
        } else {
            log.warn("⚠️ ChromaDB vector store has become UNAVAILABLE. Falling back to SQLite/BM25.");
        }
        chromaAvailable = available;
    }
}

const openaiEmbeddingFunction = {
    name: "openai",
    generate: async (inputs: string[]): Promise<number[][]> => {
        return Promise.all(inputs.map((input) => generateEmbedding(input)));
    },
};

/**
 * Initialise the ChromaDB client + collection (idempotent).
 * Called lazily on first use so startup is never blocked.
 */
async function ensureChroma(): Promise<Collection | null> {
    if (!CHROMA_URL || CHROMA_URL.trim() === "") {
        log.info("ChromaDB disabled (CHROMA_URL not configured)");
        return null;
    }

    if (collection) return collection;

    try {
        if (!client) {
            client = new ChromaClient({ path: CHROMA_URL });
        }

        // getOrCreateCollection is idempotent
        collection = await client.getOrCreateCollection({
            name: COLLECTION_NAME,
            metadata: { "hnsw:space": "cosine" },
            embeddingFunction: openaiEmbeddingFunction,
        });

        setChromaAvailable(true);
        log.info(`✅ ChromaDB vector store ready — collection: ${COLLECTION_NAME}`);
        return collection;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.info(`ChromaDB unavailable at ${CHROMA_URL} (${msg}). Using SQLite fallback.`);
        setChromaAvailable(false);
        return null;
    }
}

/**
 * Upsert a message into the ChromaDB vector store.
 * Called every time a message is added to the conversation (user, assistant, tool).
 */
export async function upsertVectorMemory(opts: {
    id: string;
    sessionId: string;
    role: string;
    content: string;
    timestamp?: string;
}): Promise<void> {
    const col = await ensureChroma();
    if (!col) return;

    const { id, sessionId, role, content, timestamp } = opts;

    if (!content.trim()) return;

    try {
        const embedding = await generateEmbedding(content);

        await col.upsert({
            ids: [id],
            embeddings: [embedding],
            documents: [content],
            metadatas: [
                {
                    sessionId,
                    role,
                    timestamp: timestamp ?? new Date().toISOString(),
                },
            ],
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn(`Vector upsert failed for id=${id}: ${msg}`);
        throw err; // Re-throw so caller can track failure
    }
}

/**
 * Perform a semantic similarity search over the vector store.
 * Returns the top `limit` results ranked by cosine similarity.
 */
export async function vectorSemanticSearch(
    sessionId: string,
    query: string,
    limit = 5
): Promise<SemanticSearchResult[]> {
    const col = await ensureChroma();

    if (!col) {
        // ChromaDB not available — fall back to SQLite TF-IDF
        return fallbackLocalSemanticSearch(sessionId, query, limit);
    }

    try {
        const queryEmbedding = await generateEmbedding(query);

        const results = await col.query({
            queryEmbeddings: [queryEmbedding],
            nResults: Math.max(1, Math.min(50, limit)),
            where: { sessionId },
        });

        const ids = results.ids[0] ?? [];
        const documents = results.documents[0] ?? [];
        const metadatas = results.metadatas[0] ?? [];
        const distances = results.distances?.[0] ?? [];

        return ids.map((id, i) => ({
            id: String(id),
            sessionId,
            role: String((metadatas[i] as any)?.role ?? "unknown"),
            content: String(documents[i] ?? ""),
            timestamp: String((metadatas[i] as any)?.timestamp ?? ""),
            // ChromaDB returns L2 distance with cosine space — convert to similarity
            similarity: 1 - (distances[i] ?? 0),
        }));
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn(`Vector search failed, resetting ChromaDB availability and falling back to SQLite: ${msg}`);
        setChromaAvailable(false);
        return fallbackLocalSemanticSearch(sessionId, query, limit);
    }
}

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 1);
}

function computeTermFrequencies(doc: string): Map<string, number> {
    const tokens = tokenize(doc);
    const tf = new Map<string, number>();
    for (const token of tokens) {
        tf.set(token, (tf.get(token) ?? 0) + 1);
    }
    return tf;
}

function scoreBM25(
    query: string,
    doc: string,
    avgDocLen: number,
    docFreqs: Map<string, number>,
    totalDocs: number,
    k1 = 1.5,
    b = 0.75
): number {
    const queryTokens = tokenize(query);
    const docTf = computeTermFrequencies(doc);
    const docLen = tokenize(doc).length;

    let score = 0;
    for (const term of queryTokens) {
        const tf = docTf.get(term) ?? 0;
        if (tf === 0) continue;

        const df = docFreqs.get(term) ?? 0;
        const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1);

        const numerator = tf * (k1 + 1);
        const denominator = tf + k1 * (1 - b + (b * docLen) / avgDocLen);
        score += idf * (numerator / denominator);
    }
    return score;
}

async function keywordBM25Search(
    sessionId: string,
    query: string,
    limit: number
): Promise<SemanticSearchResult[]> {
    if (!db) {
        return fallbackLocalSemanticSearch(sessionId, query, limit);
    }

    try {
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

        const documents: Array<{ id: string; sessionId: string; role: string; content: string; timestamp: string }> = [];

        for (const row of rows) {
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

            documents.push({
                id: String(row.id),
                sessionId: row.session_id,
                role,
                content,
                timestamp: row.timestamp,
            });
        }

        const validDocs = documents.filter((d) => d.content.length > 0);

        if (validDocs.length === 0) {
            return [];
        }

        const docFreqs = new Map<string, number>();
        const docLengths: number[] = [];

        for (const doc of validDocs) {
            const tokens = tokenize(doc.content);
            docLengths.push(tokens.length);
            const uniqueTokens = new Set(tokens);
            for (const token of uniqueTokens) {
                docFreqs.set(token, (docFreqs.get(token) ?? 0) + 1);
            }
        }

        const avgDocLen = docLengths.reduce((a, b) => a + b, 0) / docLengths.length;
        const totalDocs = validDocs.length;

        const scored = validDocs.map((doc) => ({
            ...doc,
            score: scoreBM25(query, doc.content, avgDocLen, docFreqs, totalDocs),
        }));

        scored.sort((a, b) => b.score - a.score);

        return scored.slice(0, limit).map((r) => ({
            id: r.id,
            sessionId: r.sessionId,
            role: r.role,
            content: r.content,
            timestamp: r.timestamp,
            similarity: r.score,
        }));
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn(`BM25 fallback failed: ${msg}`);
        return fallbackLocalSemanticSearch(sessionId, query, limit);
    }
}

export async function vectorSemanticSearchWithFallback(
    sessionId: string,
    query: string,
    limit = 5
): Promise<SemanticSearchResult[]> {
    const results = await vectorSemanticSearch(sessionId, query, limit);

    if (results.length === 0 && query.trim().length > 0) {
        log.info("Vector search returned no results, falling back to BM25 keyword search");
        return keywordBM25Search(sessionId, query, limit);
    }

    return results;
}

/**
 * Returns true if ChromaDB has been successfully initialised.
 */
export function isVectorStoreAvailable(): boolean {
    return chromaAvailable;
}

// Kick off initialisation eagerly (but don't block startup)
void ensureChroma();
