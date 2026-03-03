import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions.js";
import type OpenAI from "openai";
import { getProvider, createProvider, SYSTEM_PROMPT, type LLMResponse } from "./index.ts";
import { createLogger } from "../logger.ts";
import { db } from "../db.ts";
import { getSessionSettings } from "../session.ts";
import { config } from "../config.ts";
import { applyThinkingToSystemPrompt, applyThinkingToMessage, type ThinkingLevel } from "../thinking.ts";
import { recordUsage } from "../usage.ts";
import { loadFactsForPrompt } from "../memory/markdown.ts";
import { getRecentAttachmentContext } from "../memory/multimodal.ts";
import { enqueueMessageSync } from "../memory/supabase.ts";

const log = createLogger("llm");

export type ConversationHistory = ChatCompletionMessageParam[];

/** Retrieves conversation history from SQLite */
export function getHistory(sessionId: string): ConversationHistory {
    const rows = db.prepare("SELECT message_json FROM memory WHERE session_id = ? ORDER BY timestamp ASC, id ASC").all(sessionId) as { message_json: string }[];
    return rows.map((row) => JSON.parse(row.message_json));
}

/** Appends a user message to history */
export function addUserMessage(sessionId: string, text: string): void {
    const msg: ChatCompletionMessageParam = { role: "user", content: text };
    db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)").run(sessionId, JSON.stringify(msg));
    enqueueMessageSync({ sessionId, role: "user", content: text });
}

/** Appends an assistant message to history */
export function addAssistantMessage(
    sessionId: string,
    content: string,
    toolCalls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[]
): void {
    const msg: ChatCompletionMessageParam = { role: "assistant", content };
    if (toolCalls && toolCalls.length > 0) {
        (msg as OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam).tool_calls = toolCalls;
    }
    db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)").run(sessionId, JSON.stringify(msg));
    enqueueMessageSync({ sessionId, role: "assistant", content });
}

/** Appends a tool result to history (feeds back into the agentic loop) */
export function addToolResult(
    sessionId: string,
    toolCallId: string,
    result: string
): void {
    const msg: ChatCompletionMessageParam = {
        role: "tool",
        tool_call_id: toolCallId,
        content: result,
    };
    db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)").run(sessionId, JSON.stringify(msg));
    enqueueMessageSync({ sessionId, role: "tool", content: result });
}

/** Clear entire conversation history for a session */
export function clearHistory(sessionId: string): void {
    db.prepare("DELETE FROM memory WHERE session_id = ?").run(sessionId);
}

// Type aliases for common use
export type LLMMessage = ChatCompletionMessageParam;

// Legacy type alias for backward compatibility
export interface ClaudeResponse extends LLMResponse { }

/**
 * Calls the LLM with the current conversation history + tools.
 * Now uses the abstract provider system with optional session-specific overrides.
 */
export async function callClaude(
    sessionId: string,
    toolDefinitions: ChatCompletionTool[]
): Promise<ClaudeResponse> {
    const history = getHistory(sessionId);
    log.debug(`Calling LLM — history length: ${history.length}`);

    // Check for session-specific settings (provider/model/thinking level)
    const sessionSettings = getSessionSettings(sessionId);

    // Apply thinking level to system prompt
    const thinkingLevel = (sessionSettings.thinkingLevel as ThinkingLevel) || "off";
    const enhancedSystemPrompt = applyThinkingToSystemPrompt(SYSTEM_PROMPT, thinkingLevel);
    log.debug(`Thinking level: ${thinkingLevel}`);

    // Apply thinking level to user messages in history
    const enhancedHistory = history.map(msg => {
        if (msg.role === "user" && typeof msg.content === "string") {
            return {
                ...msg,
                content: applyThinkingToMessage(msg.content, thinkingLevel),
            };
        }
        return msg;
    });

    const sessionFacts = loadFactsForPrompt(sessionId);
    const attachmentContext = getRecentAttachmentContext(sessionId);

    // Combine all system-level context into a single system message
    let combinedSystemContent = enhancedSystemPrompt;
    if (sessionFacts) {
        combinedSystemContent += `\n\nSession memory facts:\n${sessionFacts}`;
    }
    if (attachmentContext) {
        combinedSystemContent += `\n\nRecent attachment memory:\n${attachmentContext}`;
    }

    const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: combinedSystemContent },
        ...enhancedHistory,
    ];

    // Check for session-specific provider/model overrides
    let provider = getProvider(); // Default global provider

    if (sessionSettings.provider || sessionSettings.model) {
        // Session has custom provider/model settings - create specialized provider
        const sessionProvider = sessionSettings.provider;
        const sessionModel = sessionSettings.model;

        log.info(`Using session override: provider=${sessionProvider || "default"}, model=${sessionModel || "default"}`);

        provider = createProvider({
            provider: sessionProvider,
            model: sessionModel,
        });
    }

    // Track latency
    const startTime = Date.now();

    // Call the provider
    const response = await provider.chat(messages, toolDefinitions);

    const latency = Date.now() - startTime;

    // Record usage stats
    if (response.usage) {
        const model = sessionSettings.model || config.LLM_MODEL;
        const providerName = sessionSettings.provider || config.LLM_PROVIDER;

        recordUsage({
            sessionId,
            model,
            promptTokens: response.usage.promptTokens,
            completionTokens: response.usage.completionTokens,
            latency,
            provider: providerName,
        });
    }

    return response;
}

