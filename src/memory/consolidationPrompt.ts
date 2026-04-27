import { config } from "../config.ts";
import { loadFactsForPrompt, readAllFacts, rewriteSessionFacts } from "./markdown.ts";
import type { MarkdownFact } from "../types/memory.js";

export async function buildConsolidationPrompt(
    sessionIds: string[],
): Promise<string> {
    const allFacts: MarkdownFact[] = [];

    for (const sessionId of sessionIds) {
        const sessionFacts = readAllFacts(sessionId);
        allFacts.push(...sessionFacts);
    }

    const duplicates = new Map<string, { fact: MarkdownFact; count: number }>();
    for (const fact of allFacts) {
        const key = fact.fact.toLowerCase();
        const existing = duplicates.get(key);
        if (existing) {
            existing.count++;
        } else {
            duplicates.set(key, { fact, count: 1 });
        }
    }

    const uniqueFacts = Array.from(duplicates.values())
        .filter((d) => d.count >= 1)
        .sort((a, b) => b.count - a.count)
        .map((d) => d.fact);

    const factSummary = uniqueFacts
        .slice(0, 50)
        .map((f) => `- [${f.timestamp || "unknown"}] [${f.category}] ${f.fact}`)
        .join("\n");

    return `## Memory Consolidation

You are consolidating memories from ${sessionIds.length} sessions.

### Current Facts
${factSummary || "No facts found."}

### Task
Review the facts above and:
1. Remove duplicate or outdated facts
2. Merge similar facts into more general ones
3. Keep the most important and accurate facts
4. Rewrite the final facts to the memory file

Focus on keeping facts that are:
- Unique and not repeated
- Important for understanding the user's projects
- Still relevant and accurate

Return a summary of what you consolidated.`;
}