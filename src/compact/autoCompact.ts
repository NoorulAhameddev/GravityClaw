import { config } from "../config.ts";
import { db } from "../db.ts";
import { callClaude, type ClaudeResponse } from "../llm/orchestrator.ts";
import { createLogger } from "../logger.ts";
import type { Message } from "../types/llm.js";
import { runForkedAgent } from "../lib/forkedAgent.js";
import type { CompactSummary, CompactionResult } from "./types.js";

const log = createLogger("autoCompact");

const COMPACT_STATES_KEY = "compact_states";
const MAX_CONTEXT_TOKENS = 150000;
const COMPACT_THRESHOLD = 0.8;

export interface AutoCompactOptions {
    model?: string;
    maxOutputTokens?: number;
    threshold?: number;
}

async function generateSummary(
    messages: Message[],
    options: AutoCompactOptions,
): Promise<CompactionResult> {
    const recentMessages = messages.slice(-20);

    const conversationText = recentMessages
        .map((m) => {
            const role = m.role;
            const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
            const truncated = content.slice(0, 2000);
            return `${role}: ${truncated}`;
        })
        .join("\n\n");

    const systemPrompt = `You are a conversation summarizer. Summarize the key points from the conversation below.

Focus on:
1. What the user requested or questions asked
2. Any important decisions or conclusions
3. Technical details or code that was written
4. Any errors encountered and how they were resolved
5. Important file paths or commands mentioned

Keep the summary concise but comprehensive.`;

    const summaryPrompt = `## Recent Conversation\n\n${conversationText}\n\n## Task\nProvide a concise summary (3-5 sentences) of the key points above.`;

    try {
        const forkedResult = await runForkedAgent({
            prompt: summaryPrompt,
            maxIterations: 1,
        });

        const summaryText = forkedResult.messages
            .map((m) => m.content)
            .join("\n");

        const summaryMessage = {
            role: "system" as const,
            content: `## Previous Conversation Summary\n\n${summaryText}`,
        };

        const newMessages = messages.slice(-10);
        newMessages.unshift(summaryMessage);

        return {
            summaryMessages: [summaryMessage],
            preCompactTokenCount: Math.ceil(conversationText.length / 4),
            postCompactTokenCount: Math.ceil(summaryText.length / 4),
            compactor: "autoCompact",
        };
    } catch (e) {
        log.error(`Summary generation failed: ${e}`);
        throw e;
    }
}

function loadCompactStates(): Record<string, CompactSummary> {
    try {
        const row = db.prepare("SELECT value FROM state WHERE key = ?").get(COMPACT_STATES_KEY) as
            | { value: string }
            | undefined;
        if (row) {
            return JSON.parse(row.value) as Record<string, CompactSummary>;
        }
    } catch (e) {
        log.debug(`No compact states found: ${e}`);
    }
    return {};
}

function saveCompactStates(states: Record<string, CompactSummary>): void {
    db.prepare(
        "INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)",
    ).run(COMPACT_STATES_KEY, JSON.stringify(states));
}

export async function checkAndCompact(
    sessionId: string,
    messages: Message[],
    options: AutoCompactOptions = {},
): Promise<{
    shouldCompact: boolean;
    result?: CompactionResult;
    newMessages?: Message[];
}> {
    const threshold = options.threshold ?? COMPACT_THRESHOLD;
    const model = options.model ?? config.LLM_MODEL;

    const messageCount = messages.length;
    if (messageCount < 20) {
        return { shouldCompact: false };
    }

    const totalChars = messages.reduce(
        (sum, m) => sum + (typeof m.content === "string" ? m.content.length : JSON.stringify(m.content).length),
        0,
    );
    const estimatedTokens = Math.ceil(totalChars / 4);
    const contextUsage = estimatedTokens / MAX_CONTEXT_TOKENS;

    if (contextUsage < threshold) {
        return { shouldCompact: false };
    }

    log.info(
        `Context usage at ${Math.round(contextUsage * 100)}%, triggering auto-compact for session ${sessionId}`,
    );

    try {
        const result = await generateSummary(messages, options);

        const newMessages: Message[] = [
            { role: "system", content: result.summaryMessages[0]?.content ?? "" },
        ];
        for (const msg of messages.slice(-10)) {
            newMessages.push(msg);
        }

        const states = loadCompactStates();
        states[sessionId] = {
            timestamp: new Date().toISOString(),
            messageCount: messages.length,
            tokenCount: estimatedTokens,
            summary: result.summaryMessages[0]?.content ?? "",
        };
        saveCompactStates(states);

        log.info(`Auto-compact completed for session ${sessionId}`);

        return {
            shouldCompact: true,
            result,
            newMessages,
        };
    } catch (e) {
        log.error(`Auto-compact failed: ${e}`);
        return { shouldCompact: false };
    }
}