import { config } from "../config.ts";
import {
    readLastConsolidatedAt,
    releaseConsolidationLock,
    rollbackConsolidationLock,
    tryAcquireConsolidationLock,
} from "./consolidationLock.ts";
import { buildConsolidationPrompt } from "./consolidationPrompt.ts";
import { readAllFacts, rewriteSessionFacts } from "./markdown.ts";
import { createLogger } from "../logger.ts";
import { db } from "../db.ts";
import { runForkedAgent } from "../lib/forkedAgent.ts";
import type { MarkdownFact } from "../types/memory.js";

const log = createLogger("autoDream");

const SCAN_SESSIONS_INTERVAL_MS = 10 * 60 * 1000;

let lastSessionScanAt = 0;

function listSessionsTouchedSince(timestamp: number): string[] {
    if (timestamp === 0) {
        timestamp = 0;
    }
    const rows = db
        .prepare(
            `
            SELECT DISTINCT session_id
            FROM memory
            WHERE timestamp > datetime(? / 1000, 'unixepoch')
            ORDER BY timestamp DESC
            `
        )
        .all(timestamp) as Array<{ session_id: string }>;

    return rows.map((r) => r.session_id);
}

export function getAllSessionIds(): string[] {
    const rows = db
        .prepare(
            `SELECT DISTINCT session_id FROM memory ORDER BY timestamp DESC LIMIT 100`
        )
        .all() as Array<{ session_id: string }>;

    return rows.map((r) => r.session_id);
}

function isGateOpen(): boolean {
    if (!config.AUTO_DREAM_ENABLED) {
        return false;
    }
    return true;
}

export async function executeAutoDream(): Promise<void> {
    if (!isGateOpen()) {
        return;
    }

    let lastAt: number;
    try {
        lastAt = readLastConsolidatedAt();
    } catch (e) {
        log.error(`readLastConsolidatedAt failed: ${e}`);
        return;
    }

    const hoursSince = (Date.now() - lastAt) / 3_600_000;
    if (hoursSince < config.AUTO_DREAM_MIN_HOURS) {
        log.debug(
            `Time gate not met: ${hoursSince.toFixed(1)}h since last consolidation, need ${config.AUTO_DREAM_MIN_HOURS}h`,
        );
        return;
    }

    const sinceScanMs = Date.now() - lastSessionScanAt;
    if (sinceScanMs < SCAN_SESSIONS_INTERVAL_MS) {
        log.debug(
            `Scan throttle: last scan was ${Math.round(sinceScanMs / 1000)}s ago`,
        );
        return;
    }
    lastSessionScanAt = Date.now();

    let sessionIds: string[];
    try {
        sessionIds = listSessionsTouchedSince(lastAt);
    } catch (e) {
        log.error(`listSessionsTouchedSince failed: ${e}`);
        return;
    }

    if (sessionIds.length < config.AUTO_DREAM_MIN_SESSIONS) {
        log.debug(
            `Skip — ${sessionIds.length} sessions since last consolidation, need ${config.AUTO_DREAM_MIN_SESSIONS}`,
        );
        return;
    }

    let priorMtime: number | null;
    try {
        priorMtime = await tryAcquireConsolidationLock();
    } catch (e) {
        log.error(`Lock acquire failed: ${e}`);
        return;
    }

    if (priorMtime === null) {
        return;
    }

    log.info(
        `AutoDream firing — ${hoursSince.toFixed(1)}h since last, ${sessionIds.length} sessions to review`,
    );

    try {
        let consolidatedCount = 0;
        for (const sessionId of sessionIds) {
            const facts = readAllFacts(sessionId);
            if (facts.length < 3) {
                continue;
            }

            const prompt = `Review the facts below and consolidate them to be concise and accurate.
Remove duplicate or outdated facts, and merge similar ones into a single clear, high-quality fact. Keep only the most important and active facts.

Current facts for session ${sessionId}:
${facts.map(f => `- [${f.category}] ${f.fact}`).join("\n")}

Format each consolidated fact exactly as: "- [category] fact"`;

            const result = await runForkedAgent({
                prompt,
                sessionId: `dream-${sessionId}`,
                maxIterations: 1,
            });

            const responseText = result.messages
                .map((m) => m.content)
                .join("\n");

            const factLines = responseText
                .split("\n")
                .filter((line) => line.startsWith("- ["));

            const consolidatedFacts: MarkdownFact[] = [];
            for (const line of factLines) {
                const match = line.match(/^- \[([^\]]+)\] (.+)$/);
                if (match && match[1] && match[2]) {
                    consolidatedFacts.push({
                        timestamp: new Date().toISOString(),
                        category: match[1].trim(),
                        fact: match[2].trim(),
                    });
                }
            }

            if (consolidatedFacts.length > 0) {
                rewriteSessionFacts(sessionId, consolidatedFacts);
                log.info(`Consolidated memory for session ${sessionId}: reduced from ${facts.length} to ${consolidatedFacts.length} facts`);
                consolidatedCount++;
            }
        }

        await releaseConsolidationLock();

        log.info(
            `AutoDream completed — consolidated ${consolidatedCount} sessions`,
        );
    } catch (e) {
        log.error(`AutoDream failed: ${e}`);
        if (priorMtime !== null) {
            await rollbackConsolidationLock(priorMtime);
        }
    }
}

export function startAutoDreamScheduler(): { stop: () => void } {
    const interval = setInterval(() => {
        executeAutoDream().catch((err) => {
            log.error("AutoDream execution failed", err);
        });
    }, 10 * 60 * 1000); // Check every 10 minutes

    return {
        stop: () => {
            clearInterval(interval);
        },
    };
}