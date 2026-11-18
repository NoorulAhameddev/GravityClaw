/**
 * Context Scorer & Contradiction Resolution Module
 *
 * Implements the WRAI.TH context ranking formula:
 * Score = Priority * Relevance * Freshness
 *
 * Features:
 * - Exponential decay freshness weighting based on timestamp age.
 * - Semantic priority weights by category (decisions, preferences, facts, tool outputs).
 * - Multi-token relevance intersection against active query.
 * - Active contradiction detection to deprioritize superseded or conflicting memories.
 */

export type MemoryCategory =
  | 'decision'
  | 'user_preference'
  | 'fact'
  | 'bugfix'
  | 'conversation'
  | 'tool_output';

export interface ScoredContextItem {
  id: string;
  category: MemoryCategory;
  content: string;
  timestamp: number;
  priorityScore: number;
  relevanceScore: number;
  freshnessScore: number;
  finalScore: number;
  isDeprecated?: boolean;
  supersededBy?: string;
}

export interface ScorerOptions {
  decayHalfLifeHours?: number; // default: 24 hours
  categoryWeights?: Partial<Record<MemoryCategory, number>>;
}

const DEFAULT_CATEGORY_WEIGHTS: Record<MemoryCategory, number> = {
  decision: 1.0,
  user_preference: 0.95,
  fact: 0.85,
  bugfix: 0.8,
  conversation: 0.45,
  tool_output: 0.25,
};

/**
 * Calculates exponential freshness score: e^(-lambda * deltaHours)
 */
export function calculateFreshness(timestamp: number, now: number = Date.now(), halfLifeHours: number = 24): number {
  const deltaMs = Math.max(0, now - timestamp);
  const deltaHours = deltaMs / (1000 * 60 * 60);
  const lambda = Math.LN2 / Math.max(1, halfLifeHours);
  return Math.exp(-lambda * deltaHours);
}

/**
 * Computes term-overlap relevance score between content and active query.
 */
export function calculateRelevance(content: string, query: string): number {
  if (!query.trim()) return 0.5; // neutral relevance when query is blank

  const tokenize = (text: string): Set<string> => {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9_\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
  };

  const contentTokens = tokenize(content);
  const queryTokens = tokenize(query);

  if (queryTokens.size === 0) return 0.5;

  let matches = 0;
  for (const token of queryTokens) {
    if (contentTokens.has(token)) {
      matches++;
    }
  }

  // Ratio of query tokens present in content
  const matchRatio = matches / queryTokens.size;
  return Math.min(1.0, Math.max(0.1, matchRatio));
}

/**
 * Detects contradictory pairs among context items.
 * When a conflict is found, the newer item supersedes the older item.
 */
export function resolveContradictions(items: ScoredContextItem[]): ScoredContextItem[] {
  // Sort descending by timestamp (newest first)
  const sorted = [...items].sort((a, b) => b.timestamp - a.timestamp);
  const resolved = new Map<string, ScoredContextItem>();

  // Patterns indicating negation, override, or replacement
  const contradictionPatterns = [
    /\b(?:switch(?:ed)? to|migrated to|replaced with|now using|deprecated)\s+([a-z0-9_-]+)/i,
    /\b(?:port|host|database|engine|framework)\s*(?:is|=|:)\s*([a-z0-9_.-]+)/i,
    /\b(?:no longer|stop using|disable|disallow)\s+([a-z0-9_-]+)/i,
  ];

  for (let i = 0; i < sorted.length; i++) {
    const rawCurrent = sorted[i];
    if (!rawCurrent) continue;
    const current = { ...rawCurrent };

    for (let j = 0; j < i; j++) {
      const newer = sorted[j];
      if (!newer) continue;

      // Check for mutual entity overrides
      for (const pattern of contradictionPatterns) {
        const newerMatch = newer.content.match(pattern);
        const currentMatch = current.content.match(pattern);

        if (newerMatch && currentMatch && newerMatch[0] && currentMatch[0] && newerMatch[1] && currentMatch[1]) {
          // If the subjects match but values diverge, newer overrides older
          const newerSubject = newerMatch[0].split(/\s+/)[0]?.toLowerCase();
          const currentSubject = currentMatch[0].split(/\s+/)[0]?.toLowerCase();

          if (newerSubject && currentSubject && newerSubject === currentSubject && newerMatch[1].toLowerCase() !== currentMatch[1].toLowerCase()) {
            current.isDeprecated = true;
            current.supersededBy = newer.id;
            current.finalScore = 0; // nullify older conflicting score
            break;
          }
        }
      }

      // Check explicit direct preference override
      if (
        current.category === 'user_preference' &&
        newer.category === 'user_preference' &&
        (newer.content.toLowerCase().includes('do not use') || newer.content.toLowerCase().includes('instead of'))
      ) {
        const tokens = current.content.toLowerCase().split(/\s+/);
        if (tokens.some((t) => t.length > 3 && newer.content.toLowerCase().includes(t))) {
          current.isDeprecated = true;
          current.supersededBy = newer.id;
          current.finalScore = 0;
        }
      }
    }

    resolved.set(current.id, current);
  }

  return items.map((orig) => resolved.get(orig.id) ?? orig);
}

/**
 * Scores and ranks a collection of context items according to the WRAI.TH formula:
 * Score = Priority * Relevance * Freshness
 */
export function scoreAndRankContext(
  items: Array<{ id: string; category: MemoryCategory; content: string; timestamp: number }>,
  activeQuery: string,
  options?: ScorerOptions,
): ScoredContextItem[] {
  const now = Date.now();
  const halfLife = options?.decayHalfLifeHours ?? 24;
  const weights = { ...DEFAULT_CATEGORY_WEIGHTS, ...options?.categoryWeights };

  const scored: ScoredContextItem[] = items.map((item) => {
    const priority = weights[item.category] ?? 0.5;
    const relevance = calculateRelevance(item.content, activeQuery);
    const freshness = calculateFreshness(item.timestamp, now, halfLife);
    const finalScore = Number((priority * relevance * freshness).toFixed(4));

    return {
      id: item.id,
      category: item.category,
      content: item.content,
      timestamp: item.timestamp,
      priorityScore: priority,
      relevanceScore: Number(relevance.toFixed(4)),
      freshnessScore: Number(freshness.toFixed(4)),
      finalScore,
    };
  });

  // Resolve contradictions before returning
  const contradictionResolved = resolveContradictions(scored);

  // Return sorted by finalScore descending
  return contradictionResolved.sort((a, b) => b.finalScore - a.finalScore);
}
