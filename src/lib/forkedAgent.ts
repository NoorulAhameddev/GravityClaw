import { randomUUID } from "crypto";
import { callClaude, addUserMessage, type ClaudeResponse } from "../llm/orchestrator.ts";
import { db } from "../db.ts";
import { config } from "../config.ts";
import { createLogger } from "../logger.ts";
import type { Tool } from "../types/tools.ts";

const log = createLogger("forkedAgent");

export interface CacheSafeParams {
    systemPrompt: string;
    userContext: Record<string, string>;
    systemContext: Record<string, string>;
    tools: Tool[];
    forkContextMessages: Array<{ role: string; content: string }>;
}

let lastCacheSafeParams: CacheSafeParams | null = null;

export function saveCacheSafeParams(params: CacheSafeParams | null): void {
    lastCacheSafeParams = params;
}

export function getLastCacheSafeParams(): CacheSafeParams | null {
    return lastCacheSafeParams;
}

export interface ForkedAgentOptions {
    prompt: string;
    sessionId?: string;
    parentSessionId?: string;
    maxIterations?: number;
    tools?: Tool[];
    onProgress?: (text: string) => Promise<void>;
    skipTranscript?: boolean;
}

export interface ForkedAgentResult {
    messages: Array<{ role: string; content: string; toolCalls?: Array<{ name: string; input: Record<string, unknown> }> }>;
    totalUsage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

const orchestratorDeps = { db, config };

export async function runForkedAgent(
    options: ForkedAgentOptions,
): Promise<ForkedAgentResult> {
    const {
        prompt,
        sessionId = `fork-${randomUUID()}`,
        parentSessionId,
        maxIterations = 5,
        tools,
        onProgress,
        skipTranscript = false,
    } = options;

    log.debug(`Starting forked agent: ${sessionId} (parent: ${parentSessionId})`);

    // Add user prompt to database memory so that callClaude can fetch it when building history
    addUserMessage(sessionId, prompt, orchestratorDeps);

    const messages: ForkedAgentResult["messages"] = [];
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    const toolDefs = tools
        ?.map((t) => ({
            type: "function" as const,
            function: {
                name: t.name,
                description: t.description,
                parameters: t.inputSchema,
            },
        }))
        ?? [];

    for (let i = 0; i < maxIterations; i++) {
        const response: ClaudeResponse = await callClaude(
            sessionId,
            toolDefs,
            {},
            orchestratorDeps,
        );

        totalPromptTokens += response.usage?.promptTokens ?? 0;
        totalCompletionTokens += response.usage?.completionTokens ?? 0;

        const message = {
            role: "assistant" as const,
            content: response.text,
            toolCalls: response.toolCalls?.map((tc) => ({
                name: tc.function.name,
                input: tc.function.arguments
                    ? JSON.parse(tc.function.arguments)
                    : {},
            })),
        };
        messages.push(message);

        if (onProgress && response.text) {
            await onProgress(response.text);
        }

        if (!response.toolCalls || response.toolCalls.length === 0) {
            break;
        }
    }

    const result: ForkedAgentResult = {
        messages,
        totalUsage: {
            promptTokens: totalPromptTokens,
            completionTokens: totalCompletionTokens,
            totalTokens: totalPromptTokens + totalCompletionTokens,
        },
    };

    log.debug(
        `Forked agent completed: ${sessionId}, ` +
        `${result.totalUsage.totalTokens} tokens used`,
    );

    return result;
}