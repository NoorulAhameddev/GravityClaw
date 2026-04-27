import { db } from "../db.ts";
import { config } from "../config.ts";
import { saveFact, readAllFacts, getSessionFactsFilePath } from "../memory/markdown.ts";
import { createLogger } from "../logger.ts";
import { runForkedAgent } from "../lib/forkedAgent.ts";

const log = createLogger("extractMemories");

let lastExtractionAt = 0;
let turnCountSinceExtraction = 0;
const EXTRACTION_INTERVAL_MS = 10 * 60 * 1000;

export function getTurnCountSinceExtraction(): number {
    return turnCountSinceExtraction;
}

export function incrementTurnCount(): void {
    turnCountSinceExtraction++;
}

export function resetTurnCount(): void {
    turnCountSinceExtraction = 0;
}

export interface ExtractionOptions {
    sessionId: string;
    force?: boolean;
}

export async function executeExtractMemories(
    options: ExtractionOptions,
): Promise<{ extractedCount: number }> {
    const { sessionId, force = false } = options;

    if (!config.ENABLE_MEMORY_EXTRACTION && !force) {
        log.debug("Memory extraction is disabled");
        return { extractedCount: 0 };
    }

    if (!force) {
        const sinceLastExtraction = Date.now() - lastExtractionAt;
        if (sinceLastExtraction < EXTRACTION_INTERVAL_MS) {
            log.debug(
                `Extraction throttle: ${Math.round(sinceLastExtraction / 1000)}s since last`,
            );
            return { extractedCount: 0 };
        }
    }

    lastExtractionAt = Date.now();

    try {
        const rows = db
            .prepare(
                `
                SELECT id, message_json
                FROM memory
                WHERE session_id = ?
                ORDER BY id DESC
                LIMIT 20
                `,
            )
            .all(sessionId) as Array<{ id: number; message_json: string }>;

        if (rows.length < 5) {
            log.debug(`Not enough messages for extraction: ${rows.length}`);
            return { extractedCount: 0 };
        }

        const recentMessages = rows
            .reverse()
            .map((r) => JSON.parse(r.message_json))
            .filter(
                (m: { role: string }) =>
                    m.role === "user" || m.role === "assistant",
            );

        const conversation = recentMessages
            .map((m: { role: string; content?: string }) =>
                m.content
                    ? `${m.role}: ${m.content.slice(0, 500)}`
                    : "",
            )
            .filter(Boolean)
            .join("\n\n");

        const prompt = `Review the conversation below and extract any important facts that should be remembered.

Extract facts about:
- User preferences or requirements
- Important project details or decisions
- Technical constraints or patterns
- Any confirmed information that should not be forgotten

Format each fact as: "- [category] fact"

Conversation:
${conversation}`;

        const result = await runForkedAgent({
            prompt,
            sessionId: `extract-${sessionId}`,
            maxIterations: 1,
        });

        const responseText = result.messages
            .map((m) => m.content)
            .join("\n");

        const factLines = responseText
            .split("\n")
            .filter((line) => line.startsWith("- ["));

        let extractedCount = 0;
        for (const line of factLines) {
            const match = line.match(/^- \[([^\]]+)\] (.+)$/);
            if (match && match[1] && match[2]) {
                const category = match[1];
                const fact = match[2];
                try {
                    saveFact(sessionId, category, fact);
                    extractedCount++;
                } catch (e) {
                    log.debug(`Failed to save fact: ${e}`);
                }
            }
        }

        log.info(`Extracted ${extractedCount} memories from session`);
        return { extractedCount };
    } catch (e) {
        log.error(`Extraction failed: ${e}`);
        return { extractedCount: 0 };
    }
}