import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import Fuse from "fuse.js";
import { db } from "../db.ts";
import type { MarkdownFact, FactAccessStat } from "../types/memory.js";

export type { MarkdownFact, FactAccessStat } from "../types/memory.js";

export interface FuzzySearchResult<T> {
    item: T;
    score: number;
}

export function fuzzySearchFacts<T>(
    items: T[],
    query: string,
    keys: (keyof T)[],
    options?: { threshold?: number; limit?: number }
): FuzzySearchResult<T>[] {
    const threshold = options?.threshold ?? 0.4;
    const limit = options?.limit ?? 10;

    const fuse = new Fuse(items, {
        keys: keys as string[],
        threshold,
        includeScore: true,
        ignoreLocation: true,
        minMatchCharLength: 2,
    });

    const results = fuse.search(query);
    return results.slice(0, limit).map((r) => ({
        item: r.item,
        score: 1 - (r.score ?? 0),
    }));
}

const DEFAULT_MEMORY_ROOT = path.resolve(process.cwd(), "memory-files");
let memoryRoot = DEFAULT_MEMORY_ROOT;

// Table creation is now handled centrally by src/db/migrations/schema.ts

function sanitizeSessionId(sessionId: string): string {
    return sessionId.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function normalizeCategory(category: string): string {
    const normalized = category.trim().toLowerCase();
    return normalized.length > 0 ? normalized : "general";
}

function normalizeFactText(fact: string): string {
    return fact.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getFactHash(fact: string): string {
    return createHash("sha1").update(normalizeFactText(fact)).digest("hex");
}

export function touchFactAccess(
    sessionId: string,
    category: string,
    fact: string,
    options?: { importanceDelta?: number; incrementCount?: boolean }
): void {
    const normalizedFact = fact.trim();
    if (!sessionId.trim() || !normalizedFact) {
        return;
    }

    const factHash = getFactHash(normalizedFact);
    const incrementCount = options?.incrementCount ?? true;
    const importanceDelta = options?.importanceDelta ?? 0;
    const normalizedCategory = normalizeCategory(category);

    const existing = db
        .prepare(
            `
            SELECT access_count, importance
            FROM fact_stats
            WHERE session_id = ? AND fact_hash = ?
            `
        )
        .get(sessionId, factHash) as { access_count: number; importance: number } | undefined;

    if (existing) {
        db.prepare(
            `
            UPDATE fact_stats
            SET
              fact_text = ?,
              category = ?,
              access_count = ?,
              last_accessed = CURRENT_TIMESTAMP,
              importance = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE session_id = ? AND fact_hash = ?
            `
        ).run(
            normalizedFact,
            normalizedCategory,
            incrementCount ? existing.access_count + 1 : existing.access_count,
            existing.importance + importanceDelta,
            sessionId,
            factHash
        );
        return;
    }

    db.prepare(
        `
        INSERT INTO fact_stats (
          session_id,
          fact_hash,
          fact_text,
          category,
          access_count,
          last_accessed,
          importance
        ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
        `
    ).run(
        sessionId,
        factHash,
        normalizedFact,
        normalizedCategory,
        incrementCount ? 1 : 0,
        importanceDelta
    );
}

export function getFactStats(sessionId: string): FactAccessStat[] {
    const rows = db
        .prepare(
            `
            SELECT session_id, fact_hash, fact_text, category, access_count, last_accessed, importance
            FROM fact_stats
            WHERE session_id = ?
            ORDER BY importance DESC, access_count DESC, updated_at DESC
            `
        )
        .all(sessionId) as Array<{
        session_id: string;
        fact_hash: string;
        fact_text: string;
        category: string;
        access_count: number;
        last_accessed: string;
        importance: number;
    }>;

    return rows.map((row) => ({
        sessionId: row.session_id,
        factHash: row.fact_hash,
        factText: row.fact_text,
        category: row.category,
        accessCount: row.access_count,
        lastAccessed: row.last_accessed,
        importance: row.importance,
    }));
}

export function rewriteSessionFacts(sessionId: string, facts: MarkdownFact[]): void {
    ensureSessionMemoryDir(sessionId);
    const filePath = getSessionFactsFilePath(sessionId);

    const lines = facts.map((entry) => {
        const ts = entry.timestamp || new Date().toISOString();
        const category = normalizeCategory(entry.category);
        return `- [${ts}] [${category}] ${entry.fact.trim()}`;
    });

    const content = lines.length > 0 ? `${lines.join("\n")}\n` : "";
    fs.writeFileSync(filePath, content, "utf8");
}

export function getMemoryRoot(): string {
    return memoryRoot;
}

export function setMemoryRootForTests(rootPath: string): void {
    memoryRoot = rootPath;
}

export function resetMemoryRoot(): void {
    memoryRoot = DEFAULT_MEMORY_ROOT;
}

export function getSessionMemoryDir(sessionId: string): string {
    return path.join(memoryRoot, sanitizeSessionId(sessionId));
}

export function getSessionFactsFilePath(sessionId: string): string {
    return path.join(getSessionMemoryDir(sessionId), "facts.md");
}

function ensureSessionMemoryDir(sessionId: string): void {
    fs.mkdirSync(getSessionMemoryDir(sessionId), { recursive: true });
}

export function saveFact(sessionId: string, category: string, fact: string): MarkdownFact {
    const trimmedFact = fact.trim();
    if (!sessionId.trim()) {
        throw new Error("sessionId is required");
    }
    if (!trimmedFact) {
        throw new Error("fact is required");
    }

    ensureSessionMemoryDir(sessionId);

    const timestamp = new Date().toISOString();
    const normalizedCategory = normalizeCategory(category);
    const filePath = getSessionFactsFilePath(sessionId);
    const line = `- [${timestamp}] [${normalizedCategory}] ${trimmedFact}\n`;

    fs.appendFileSync(filePath, line, "utf8");

    touchFactAccess(sessionId, normalizedCategory, trimmedFact, {
        importanceDelta: 1,
        incrementCount: true,
    });

    return {
        timestamp,
        category: normalizedCategory,
        fact: trimmedFact,
    };
}

export function readAllFacts(sessionId: string): MarkdownFact[] {
    const filePath = getSessionFactsFilePath(sessionId);
    if (!fs.existsSync(filePath)) {
        return [];
    }

    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    const facts: MarkdownFact[] = [];
    const lineRegex = /^- \[(.+?)\] \[(.+?)\] (.+)$/;

    for (const line of lines) {
        const match = line.match(lineRegex);
        if (!match) {
            continue;
        }

        const timestamp = match[1];
        const category = match[2];
        const fact = match[3];

        if (timestamp && category && fact) {
            facts.push({ timestamp, category, fact });
        }
    }

    return facts;
}

export function recallFacts(sessionId: string, query: string, limit = 10): MarkdownFact[] {
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery) {
        return [];
    }

    const allFacts = readAllFacts(sessionId);
    if (allFacts.length === 0) {
        return [];
    }

    let matched: MarkdownFact[];

    const fuzzyResults = fuzzySearchFacts(
        allFacts,
        trimmedQuery,
        ["fact", "category"],
        { threshold: 0.4, limit }
    );

    if (fuzzyResults.length > 0) {
        matched = fuzzyResults.map((r) => r.item);
    } else {
        matched = allFacts.filter((item) => {
            return (
                item.fact.toLowerCase().includes(trimmedQuery) ||
                item.category.toLowerCase().includes(trimmedQuery)
            );
        });
    }

    const limited = matched.slice(0, Math.max(1, limit));
    for (const item of limited) {
        touchFactAccess(sessionId, item.category, item.fact, {
            importanceDelta: 0.25,
            incrementCount: true,
        });
    }
    return limited;
}

export function loadFactsForPrompt(sessionId: string, maxChars = 4000): string {
    const filePath = getSessionFactsFilePath(sessionId);
    if (!fs.existsSync(filePath)) {
        return "";
    }

    const content = fs.readFileSync(filePath, "utf8").trim();
    if (!content) {
        return "";
    }

    if (content.length <= maxChars) {
        return content;
    }

    const suffix = "\n... [truncated for context window]";
    return content.slice(0, Math.max(0, maxChars - suffix.length)) + suffix;
}
