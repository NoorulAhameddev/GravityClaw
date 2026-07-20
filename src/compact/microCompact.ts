import { config } from "../config.ts";
import { createLogger } from "../logger.ts";
import type { Message } from "../types/llm.js";

const log = createLogger("microCompact");

export interface MicrocompactResult {
    messages: Message[];
    tokensFreed: number;
    compactedCount: number;
}

const TIME_BASED_MC_CLEARED_MESSAGE = "[Old tool result content cleared]";

const COMPACTABLE_TOOLS = new Set([
    "bash",
    "shell",
    "read",
    "grep",
    "glob",
    "web_fetch",
    "web_search",
    "edit",
    "write",
]);

function roughTokenCount(text: string): number {
    return Math.ceil((text?.length ?? 0) / 4);
}

function shouldCompactTool(toolName: string): boolean {
    const name = toolName.toLowerCase();
    return COMPACTABLE_TOOLS.has(name);
}

function getToolResultSize(result: string): number {
    return result?.length ?? 0;
}

function isLargeToolResult(
    content: unknown,
    maxChars: number,
): { isLarge: boolean; resultText: string } {
    if (!content) {
        return { isLarge: false, resultText: "" };
    }

    if (typeof content === "string") {
        const isLarge = content.length > maxChars;
        return { isLarge, resultText: content };
    }

    if (Array.isArray(content)) {
        let totalSize = 0;
        let resultText = "";

        for (const block of content) {
            if (typeof block === "object" && block !== null && "content" in block) {
                const blockContent = String(block.content ?? "");
                totalSize += blockContent.length;
                if (!resultText) {
                    resultText = blockContent;
                }
            }
        }

        return { isLarge: totalSize > maxChars, resultText };
    }

    return { isLarge: false, resultText: String(content ?? "") };
}

export async function applyMicrocompact(
    messages: Message[],
    options?: {
        maxToolResultChars?: number;
        maxTools?: number;
        enabled?: boolean;
    },
): Promise<MicrocompactResult> {
    const enabled = options?.enabled ?? config.ENABLE_MICROCOMPACT;
    if (!enabled) {
        return { messages, tokensFreed: 0, compactedCount: 0 };
    }

    const maxToolResultChars =
        options?.maxToolResultChars ?? config.MICROCOMPACT_MAX_TOOL_RESULT_CHARS ?? 10000;
    const maxTools = options?.maxTools ?? config.MICROCOMPACT_MAX_TOOLS ?? 3;

    const resultMessages: Message[] = [];
    let tokensFreed = 0;
    let compactedCount = 0;
    let toolsCompacted = 0;

    for (const message of messages) {
        const role = message.role;

        if (role === "tool") {
            const toolName = message.name ?? "unknown";
            if (!shouldCompactTool(toolName)) {
                resultMessages.push(message);
                continue;
            }

            const content = message.content;
            const { isLarge, resultText } = isLargeToolResult(content, maxToolResultChars);

            if (isLarge && toolsCompacted < maxTools) {
                const originalTokens = roughTokenCount(resultText);
                const truncatedText =
                    resultText.slice(0, Math.floor(maxToolResultChars / 2)) +
                    `\n\n${TIME_BASED_MC_CLEARED_MESSAGE}`;
                const newTokens = roughTokenCount(truncatedText);

                compactedCount++;
                toolsCompacted++;
                tokensFreed += Math.max(0, originalTokens - newTokens);

                resultMessages.push({
                    ...message,
                    content: truncatedText,
                });

                continue;
            }

            resultMessages.push(message);
            continue;
        }

        resultMessages.push(message);
    }

    if (compactedCount > 0) {
        log.debug(
            `Microcompact: ${compactedCount} tools compacted, ~${tokensFreed} tokens freed`,
        );
    }

    return {
        messages: resultMessages,
        tokensFreed,
        compactedCount,
    };
}

export function shouldRunMicrocompact(
    messageCount: number,
    lastApiCallTokens?: number,
): boolean {
    if (!config.ENABLE_MICROCOMPACT) {
        return false;
    }

    if (messageCount < 10) {
        return false;
    }

    if (lastApiCallTokens && lastApiCallTokens > 100000) {
        return true;
    }

    return messageCount > 20;
}