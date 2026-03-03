import * as fs from "node:fs";
import * as path from "node:path";
import { db } from "../db.ts";
import { createLogger } from "../logger.ts";
import {
  readAllFacts,
  rewriteSessionFacts,
  getFactStats,
  touchFactAccess,
  type MarkdownFact,
} from "./markdown.ts";

const log = createLogger("memory:evolution");
const EVOLUTION_LOG_PATH = path.resolve(process.cwd(), "logs", "memory-evolution.log");

export interface EvolutionConfig {
  duplicateSimilarityThreshold: number;
  staleDays: number;
  lowImportanceThreshold: number;
}

export interface EvolutionReport {
  sessionId: string;
  startedAt: string;
  finishedAt: string;
  totalFactsBefore: number;
  totalFactsAfter: number;
  mergedFacts: number;
  removedFacts: number;
  categoryChanges: number;
  categoriesSuggested: number;
  notes: string[];
}

const DEFAULT_CONFIG: EvolutionConfig = {
  duplicateSimilarityThreshold: 0.9,
  staleDays: 90,
  lowImportanceThreshold: 1,
};

export interface CategoryOrganizerInput {
  category: string;
  facts: string[];
}

export type CategoryOrganizer = (
  groups: CategoryOrganizerInput[]
) => Promise<Record<string, string>>;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function toFrequency(tokens: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const token of tokens) {
    map.set(token, (map.get(token) ?? 0) + 1);
  }
  return map;
}

function cosineSimilarity(a: string, b: string): number {
  const aFreq = toFrequency(tokenize(a));
  const bFreq = toFrequency(tokenize(b));

  if (aFreq.size === 0 || bFreq.size === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const [, countA] of aFreq) {
    normA += countA * countA;
  }

  for (const [token, countB] of bFreq) {
    normB += countB * countB;
    const countA = aFreq.get(token) ?? 0;
    dot += countA * countB;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function appendEvolutionLog(report: EvolutionReport): void {
  const dir = path.dirname(EVOLUTION_LOG_PATH);
  fs.mkdirSync(dir, { recursive: true });

  const line = JSON.stringify(report);
  fs.appendFileSync(EVOLUTION_LOG_PATH, `${line}\n`, "utf8");
}

function isStale(lastAccessed: string | undefined, staleDays: number, now: Date): boolean {
  if (!lastAccessed) {
    return true;
  }

  const accessedAt = new Date(lastAccessed);
  if (Number.isNaN(accessedAt.getTime())) {
    return true;
  }

  const ageMs = now.getTime() - accessedAt.getTime();
  const thresholdMs = staleDays * 24 * 60 * 60 * 1000;
  return ageMs >= thresholdMs;
}

function normalizeCategory(value: string): string {
  const cleaned = value.trim().toLowerCase();
  return cleaned || "general";
}

async function reorganizeCategories(
  facts: MarkdownFact[],
  organizer?: CategoryOrganizer
): Promise<{ updatedFacts: MarkdownFact[]; changedCount: number; suggestions: number }> {
  if (!organizer || facts.length === 0) {
    return { updatedFacts: facts, changedCount: 0, suggestions: 0 };
  }

  const categoryMap = new Map<string, string[]>();
  for (const fact of facts) {
    const key = normalizeCategory(fact.category);
    const list = categoryMap.get(key) ?? [];
    list.push(fact.fact);
    categoryMap.set(key, list);
  }

  const grouped: CategoryOrganizerInput[] = [...categoryMap.entries()].map(([category, items]) => ({
    category,
    facts: items,
  }));

  const mapping = await organizer(grouped);
  let changedCount = 0;

  const updatedFacts = facts.map((fact) => {
    const key = normalizeCategory(fact.category);
    const mapped = mapping[key];

    if (!mapped) {
      return fact;
    }

    const newCategory = normalizeCategory(mapped);
    if (newCategory === key) {
      return fact;
    }

    changedCount += 1;
    return {
      ...fact,
      category: newCategory,
    };
  });

  return {
    updatedFacts,
    changedCount,
    suggestions: Object.keys(mapping).length,
  };
}

export async function runMemoryEvolution(
  sessionId: string,
  options?: {
    now?: Date;
    config?: Partial<EvolutionConfig>;
    categoryOrganizer?: CategoryOrganizer;
  }
): Promise<EvolutionReport> {
  if (!sessionId.trim()) {
    throw new Error("sessionId is required");
  }

  const now = options?.now ?? new Date();
  const finalConfig: EvolutionConfig = {
    ...DEFAULT_CONFIG,
    ...options?.config,
  };

  const startedAt = new Date().toISOString();
  const notes: string[] = [];

  const allFacts = readAllFacts(sessionId);
  const stats = getFactStats(sessionId);
  const statsByText = new Map(stats.map((s) => [s.factText.toLowerCase(), s]));

  const duplicateIndexes = new Set<number>();
  let mergedFacts = 0;

  for (let i = 0; i < allFacts.length; i++) {
    if (duplicateIndexes.has(i)) {
      continue;
    }

    for (let j = i + 1; j < allFacts.length; j++) {
      if (duplicateIndexes.has(j)) {
        continue;
      }

      const first = allFacts[i];
      const second = allFacts[j];
      if (!first || !second) {
        continue;
      }

      const similarity = cosineSimilarity(first.fact, second.fact);
      if (similarity >= finalConfig.duplicateSimilarityThreshold) {
        duplicateIndexes.add(j);
        mergedFacts += 1;
      }
    }
  }

  let evolvedFacts = allFacts.filter((_, idx) => !duplicateIndexes.has(idx));

  if (mergedFacts > 0) {
    notes.push(`Merged ${mergedFacts} duplicate facts.`);
  }

  const staleRemoved: MarkdownFact[] = [];
  evolvedFacts = evolvedFacts.filter((fact) => {
    const stat = statsByText.get(fact.fact.toLowerCase());
    const stale = isStale(stat?.lastAccessed, finalConfig.staleDays, now);
    const importance = stat?.importance ?? 0;

    const shouldRemove = stale && importance <= finalConfig.lowImportanceThreshold;
    if (shouldRemove) {
      staleRemoved.push(fact);
      return false;
    }

    return true;
  });

  if (staleRemoved.length > 0) {
    notes.push(`Removed ${staleRemoved.length} stale low-importance facts.`);
  }

  const reorg = await reorganizeCategories(evolvedFacts, options?.categoryOrganizer);
  evolvedFacts = reorg.updatedFacts;

  if (reorg.changedCount > 0) {
    notes.push(`Reorganized categories for ${reorg.changedCount} facts.`);
  }

  rewriteSessionFacts(sessionId, evolvedFacts);

  for (const fact of evolvedFacts) {
    touchFactAccess(sessionId, fact.category, fact.fact, {
      importanceDelta: 0,
      incrementCount: false,
    });
  }

  const report: EvolutionReport = {
    sessionId,
    startedAt,
    finishedAt: new Date().toISOString(),
    totalFactsBefore: allFacts.length,
    totalFactsAfter: evolvedFacts.length,
    mergedFacts,
    removedFacts: staleRemoved.length,
    categoryChanges: reorg.changedCount,
    categoriesSuggested: reorg.suggestions,
    notes,
  };

  appendEvolutionLog(report);
  log.info(
    `Memory evolution complete for ${sessionId}: ${allFacts.length} -> ${evolvedFacts.length} facts`
  );

  return report;
}

export function getEvolutionLogPath(): string {
  return EVOLUTION_LOG_PATH;
}

export function getEntityAccessStats(sessionId: string): Array<{
  name: string;
  type: string;
  accessCount: number;
  lastAccessed: string | null;
}> {
  const rows = db
    .prepare(
      `
      SELECT name, type, COALESCE(access_count, 0) as access_count, last_accessed
      FROM entities
      WHERE session_id = ?
      ORDER BY access_count DESC, updated_at DESC
      `
    )
    .all(sessionId) as Array<{
    name: string;
    type: string;
    access_count: number;
    last_accessed: string | null;
  }>;

  return rows.map((row) => ({
    name: row.name,
    type: row.type,
    accessCount: row.access_count,
    lastAccessed: row.last_accessed,
  }));
}
