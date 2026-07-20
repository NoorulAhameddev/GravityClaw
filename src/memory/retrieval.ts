import { isVectorStoreAvailable, vectorSemanticSearch } from "./vector.ts";
import { searchMemorySemantic } from "./supabase.ts";
import type { SemanticSearchResult } from "../types/memory.js";
import { createLogger } from "../logger.ts";

const log = createLogger("memory:retrieval");

export interface RetrievedMemory {
    id: string;
    sessionId: string;
    role: string;
    content: string;
    timestamp: string;
    similarity: number;
    finalScore: number;
    memoryType?: "fact" | "conversation";
}

export interface RetrievalOptions {
    limit?: number;
    maxChars?: number;
    modelName?: string;
    minSimilarity?: number;
}

export type RetrievalMode = "chromadb" | "bm25" | "tfidf";

export interface RetrievalResult {
    memories: RetrievedMemory[];
    retrievalMode: RetrievalMode;
}

function normalizeContent(text: string): string {
    return text
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function computeRecencyBoost(timestamp: string): number {
    const now = Date.now();
    const msgTime = new Date(timestamp).getTime();
    const daysOld = (now - msgTime) / (1000 * 60 * 60 * 24);

    if (daysOld < 1) return 1.0;
    if (daysOld < 7) return 0.8;
    if (daysOld < 30) return 0.5;
    return 0.2;
}

function computeRoleWeight(role: string): number {
    switch (role) {
        case "user":
            return 1.0;
        case "assistant":
            return 0.7;
        case "tool":
            return 0.3;
        default:
            return 0.5;
    }
}

function isTrivialContent(content: string): boolean {
    const trimmed = content.trim().toLowerCase();

    const trivialPatterns = [
        /^error:/i,
        /^tool result:/i,
        /^tool execution failed/i,
        /^none$/i,
        /^null$/i,
        /^undefined$/i,
        /^ok$/i,
        /^success$/i,
        /^done$/i,
        /^(yes|no)$/i,
    ];

    if (trivialPatterns.some(p => p.test(trimmed))) {
        return true;
    }

    if (trimmed.length < 10) {
        return true;
    }

    return false;
}

function isContextuallyRelevant(
    memory: string,
    query: string,
    similarity: number
): boolean {
    // Always allow strong semantic matches
    if (similarity >= 0.75) return true;

    const qWords = query.toLowerCase().split(/\W+/);
    const m = memory.toLowerCase();

    return qWords.some(word => word.length > 3 && m.includes(word));
}

function deduplicateByNormalizedContent(memories: RetrievedMemory[]): RetrievedMemory[] {
    const seen = new Map<string, RetrievedMemory>();

    for (const memory of memories) {
        const normalized = normalizeContent(memory.content);
        const existing = seen.get(normalized);

        if (!existing || memory.finalScore > existing.finalScore) {
            seen.set(normalized, memory);
        }
    }

    return Array.from(seen.values());
}

function safeClip(text: string, max: number): string {
    if (text.length <= max) return text;

    const clipped = text.slice(0, max);
    const lastPeriod = clipped.lastIndexOf(".");
    const threshold = Math.floor(max * 0.3);

    if (lastPeriod > threshold) {
        return clipped.slice(0, lastPeriod + 1);
    }

    return clipped + "...";
}

function fitToBudget(
    memories: RetrievedMemory[],
    maxChars: number,
    maxCount: number,
    maxPerItem: number
): RetrievedMemory[] {
    if (memories.length === 0) return [];

    const result: RetrievedMemory[] = [];
    let totalChars = 0;

    for (const memory of memories) {
        if (result.length >= maxCount) break;

        const clippedContent = safeClip(memory.content, maxPerItem);

        if (totalChars + clippedContent.length > maxChars) {
            const remainingChars = maxChars - totalChars;
            if (remainingChars > 50 && result.length < maxCount) {
                result.push({
                    ...memory,
                    content: safeClip(clippedContent, remainingChars),
                });
                totalChars = maxChars;
            }
            break;
        }

        result.push({
            ...memory,
            content: clippedContent,
        });
        totalChars += clippedContent.length;
    }

    return result;
}

export async function retrieveRelevantMemories(
    sessionId: string,
    latestUserMessage: string,
    opts?: RetrievalOptions
): Promise<RetrievedMemory[]> {
    const limit = opts?.limit ?? 8;
    const maxChars = opts?.maxChars ?? 1800;
    const minSimilarity = opts?.minSimilarity ?? 0.7;
    const maxPerItem = 260;

    const useVectorStore = isVectorStoreAvailable();
    const retrievalMode: RetrievalMode = useVectorStore ? "chromadb" : "bm25";

    if (!useVectorStore) {
        log.warn(`Vector store unavailable, using ${retrievalMode} fallback for session ${sessionId}`);
    }

    const raw: SemanticSearchResult[] = useVectorStore
        ? await vectorSemanticSearch(sessionId, latestUserMessage, limit)
        : await searchMemorySemantic(sessionId, latestUserMessage, limit);

    const ranked: RetrievedMemory[] = raw
        .filter(r => r.content.trim().length > 0 && r.similarity >= minSimilarity)
        .filter(r => !isTrivialContent(r.content))
        .filter(r => isContextuallyRelevant(r.content, latestUserMessage, r.similarity))
        .map(r => {
            const memType = ((r as SemanticSearchResult & { memoryType?: "fact" | "conversation" }).memoryType || "conversation") as "fact" | "conversation";
            return {
                id: r.id,
                sessionId: r.sessionId,
                role: r.role,
                content: r.content,
                timestamp: r.timestamp,
                similarity: r.similarity,
                memoryType: memType,
                finalScore:
                    r.similarity * 0.7 +
                    computeRecencyBoost(r.timestamp) * 0.15 +
                    computeRoleWeight(r.role) * 0.05 +
                    (memType === "fact" ? 0.1 : 0),
            };
        })
        .sort((a, b) => b.finalScore - a.finalScore);

    const deduped = deduplicateByNormalizedContent(ranked);

    const result = fitToBudget(deduped, maxChars, limit, maxPerItem) as RetrievedMemory[] & { retrievalMode?: RetrievalMode };
    result.retrievalMode = retrievalMode;
    return result;
}

export function formatRelevantMemories(memories: RetrievedMemory[]): string {
    if (memories.length === 0) return "";

    const lines: string[] = [];

    for (const memory of memories) {
        const roleLabel = memory.role === "user" ? "User" :
            memory.role === "assistant" ? "Assistant" : "System";
        const date = new Date(memory.timestamp).toLocaleDateString();
        lines.push(`[${roleLabel} - ${date}]`);
        lines.push(memory.content);
        lines.push("");
    }

    return lines.join("\n");
}
