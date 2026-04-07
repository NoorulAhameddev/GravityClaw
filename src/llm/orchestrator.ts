import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions.js";
import type OpenAI from "openai";
import { getProvider, createProvider, SYSTEM_PROMPT, type LLMResponse } from "./index.ts";
import { createLogger } from "../logger.ts";
import { db as dbModule } from "../db.ts";
import { getSessionSettings } from "../session.ts";
import { config as configModule } from "../config.ts";
import { applyThinkingToSystemPrompt, applyThinkingToMessage, type ThinkingLevel } from "../thinking.ts";
import { recordUsage } from "../usage.ts";
import { loadFactsForPrompt } from "../memory/markdown.ts";
import { getRecentAttachmentContext } from "../memory/multimodal.ts";
import { enqueueMessageSync } from "../memory/supabase.ts";
import { upsertVectorMemory } from "../memory/vector.ts";
import type { RetrievedMemory } from "../memory/retrieval.ts";
import { pruneContext } from "../memory/pruning.ts";
import { trace } from "@opentelemetry/api";
import { recordLlmCall } from "../lib/telemetry/metrics.js";
import { telemetryLogger } from "../lib/telemetry/logger.js";

const log = createLogger("llm");
const tracer = trace.getTracer("gravyclaw");

const MAX_MESSAGES = 20;

export interface OrchestratorDependencies {
    db: typeof dbModule;
    config: typeof configModule;
}

export interface PromptContext {
    relevantMemories?: RetrievedMemory[];
    sessionFacts?: string;
    attachmentContext?: string;
    executionPlan?: string;
}

function sanitizeMemoryContent(content: string): string {
    return content
        // Remove code blocks
        .replace(/```[\s\S]*?```/g, "[CODE_BLOCK_REMOVED]")

        // Strip HTML
        .replace(/<[^>]*>/g, "")

        // Normalize whitespace
        .replace(/\s+/g, " ")

        // Neutralize prompt injection patterns
        .replace(/ignore\s+(all\s+)?(previous|prior)?\s*(instructions|rules)?/gi, "[REMOVED_INJECTION]")
        .replace(/bypass\s+(security|rules|filters)?/gi, "[REMOVED_INJECTION]")
        .replace(/system\s*prompt/gi, "[REMOVED_REFERENCE]")

        // Neutralize dangerous action verbs
        .replace(/\b(run|execute|delete|drop|install|fetch|curl|wget)\b/gi, "[FILTERED]")

        // Hard cap
        .slice(0, 300)
        .trim();
}

export function buildSystemContext(basePrompt: string, ctx: PromptContext): string {
    let content = basePrompt;

    if (ctx.relevantMemories && ctx.relevantMemories.length > 0) {
        const memoriesContent = ctx.relevantMemories
            .map(m => {
                const roleLabel = m.role === "user" ? "User" :
                    m.role === "assistant" ? "Assistant" : "System";
                const date = new Date(m.timestamp).toLocaleDateString();
                return `[${roleLabel} - ${date}]\n${sanitizeMemoryContent(m.content)}`;
            })
            .join("\n\n");
        content += `\n\nRelevant Memories:\n${memoriesContent}`;
    }

    if (ctx.sessionFacts) {
        content += `\n\nSession memory facts:\n${ctx.sessionFacts}`;
    }

    if (ctx.attachmentContext) {
        content += `\n\nRecent attachment memory:\n${ctx.attachmentContext}`;
    }

    if (ctx.executionPlan) {
        content += `\n\nExecution Plan:\n${ctx.executionPlan}`;
    }

    return content;
}

export type ConversationHistory = ChatCompletionMessageParam[];

/** Retrieves conversation history from SQLite */
export function getHistory(sessionId: string, deps: OrchestratorDependencies): ConversationHistory {
    validateSessionId(sessionId);
    const rows = deps.db.prepare("SELECT message_json FROM memory WHERE session_id = ? ORDER BY timestamp ASC, id ASC").all(sessionId) as { message_json: string }[];
    const messages = rows.map((row) => JSON.parse(row.message_json));

    // STEP 5.2 — Token protection: trim oldest history if exceeds MAX_MESSAGES
    if (messages.length > MAX_MESSAGES) {
        const trimmed = messages.slice(-MAX_MESSAGES);
        log.debug(`Trimmed history from ${messages.length} to ${MAX_MESSAGES} messages`);
        return trimmed;
    }

    return messages;
}

/** Filter to prevent low-quality memory storage */
function shouldStoreMemory(content: string): boolean {
    const text = content.toLowerCase().trim();

    if (text.includes("error") || text.includes("failed") || text.includes("exception")) {
        return false;
    }

    if (text.length < 20) {
        return false;
    }

    if (
        text.includes("tool execution") ||
        text.includes("command output") ||
        text.includes("exit code")
    ) {
        return false;
    }

    return true;
}

/** Extract meaningful facts from content */
function extractFacts(content: string): string[] {
    const facts: string[] = [];
    const text = content.toLowerCase();

    const factPatterns = [
        /my project is (.+)/i,
        /i am using (.+)/i,
        /i prefer (.+)/i,
        /my name is (.+)/i,
        /i live in (.+)/i,
        /i work at (.+)/i,
        /my favorite (.+)/i,
        /i'm building (.+)/i,
        /i'm working on (.+)/i,
        /currently using (.+)/i,
    ];

    for (const pattern of factPatterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
            facts.push(match[1].trim());
        }
    }

    return facts;
}

/**
 * Validate session ID format and length
 * @throws Error if session ID is invalid
 */
function validateSessionId(sessionId: string): void {
    if (!sessionId || typeof sessionId !== 'string') {
        throw new Error('Session ID must be a non-empty string');
    }
    if (sessionId.length > 255) {
        throw new Error('Session ID exceeds maximum length of 255 characters');
    }
    // Allow alphanumeric, hyphens, underscores, colons (for sub-identifiers)
    if (!/^[a-zA-Z0-9\-_:]+$/.test(sessionId)) {
        throw new Error('Session ID contains invalid characters');
    }
}

/** Appends a user message to history */
export function addUserMessage(sessionId: string, text: string, deps: OrchestratorDependencies): void {
    validateSessionId(sessionId);
    const facts = extractFacts(text);
    const memoryType = facts.length > 0 ? "fact" : "conversation";
    
    const msg = { role: "user", content: text, memoryType };
    const row = deps.db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?) RETURNING id").get(sessionId, JSON.stringify(msg)) as { id: number } | undefined;
    const id = row?.id ? `${sessionId}:user:${row.id}` : `${sessionId}:user:${Date.now()}`;
    enqueueMessageSync({ sessionId, role: "user", content: text });
    void upsertVectorMemory({ id, sessionId, role: "user", content: text });

    const count = deps.db.prepare("SELECT COUNT(*) as cnt FROM memory WHERE session_id = ?").get(sessionId) as { cnt: number };
    if (count.cnt > 1000) {
        void pruneContext(sessionId, deps.config.LLM_MODEL);
    }
}

/** Appends an assistant message to history */
export function addAssistantMessage(
    sessionId: string,
    content: string,
    deps: OrchestratorDependencies,
    toolCalls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[]
): void {
    validateSessionId(sessionId);
    const msg = { role: "assistant", content, memoryType: "conversation" };
    if (toolCalls && toolCalls.length > 0) {
        (msg as any).tool_calls = toolCalls;
    }
    const row = deps.db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?) RETURNING id").get(sessionId, JSON.stringify(msg)) as { id: number } | undefined;
    const id = row?.id ? `${sessionId}:assistant:${row.id}` : `${sessionId}:assistant:${Date.now()}`;
    enqueueMessageSync({ sessionId, role: "assistant", content });
    if (content) void upsertVectorMemory({ id, sessionId, role: "assistant", content });
}

/** Appends a tool result to history (feeds back into the agentic loop) */
export function addToolResult(
    sessionId: string,
    toolCallId: string,
    result: string,
    deps: OrchestratorDependencies
): void {
    validateSessionId(sessionId);
    if (!shouldStoreMemory(result)) {
        return;
    }

    const msg: ChatCompletionMessageParam = {
        role: "tool",
        tool_call_id: toolCallId,
        content: result,
    };
    deps.db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)").run(sessionId, JSON.stringify(msg));
    enqueueMessageSync({ sessionId, role: "tool", content: result });
}

/** Clear entire conversation history for session */
export function clearHistory(sessionId: string, deps: OrchestratorDependencies): void {
    validateSessionId(sessionId);
    deps.db.prepare("DELETE FROM memory WHERE session_id = ?").run(sessionId);
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
    toolDefinitions: ChatCompletionTool[],
    promptContext: PromptContext | undefined,
    deps: OrchestratorDependencies
): Promise<ClaudeResponse> {
    const history = getHistory(sessionId, deps);
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

    const sessionFacts = promptContext?.sessionFacts ?? loadFactsForPrompt(sessionId);
    const attachmentContext = promptContext?.attachmentContext ?? getRecentAttachmentContext(sessionId);

    // Combine all system-level context into a single system message
    let combinedSystemContent = enhancedSystemPrompt;

    if (promptContext?.relevantMemories && promptContext.relevantMemories.length > 0) {
        const filtered = promptContext.relevantMemories.filter(m => m.role !== "tool");
        
        const facts = filtered.filter(m => (m as any).memoryType === "fact");
        const conversations = filtered.filter(m => (m as any).memoryType !== "fact");

        if (facts.length > 0) {
            const factsContent = facts.map(m => `- ${m.content}`).join("\n");
            combinedSystemContent += `
Relevant Facts (verified knowledge):
${factsContent}
`;
        }

        if (conversations.length > 0) {
            const convContent = conversations
                .map(m => {
                    const roleLabel = m.role === "user" ? "User" : "Assistant";
                    const date = new Date(m.timestamp).toLocaleDateString();
                    return `[${roleLabel} - ${date}]\n${m.content}`;
                })
                .join("\n\n");
            combinedSystemContent += `
Relevant Conversation (contextual):
These are past conversation snippets. Use them only if clearly relevant to the current task.

${convContent}
`;
        }
    }

    if (sessionFacts) {
        combinedSystemContent += `\n\nSession memory facts:\n${sessionFacts}`;
    }
    if (attachmentContext) {
        combinedSystemContent += `\n\nRecent attachment memory:\n${attachmentContext}`;
    }
    if (promptContext?.executionPlan) {
        combinedSystemContent += `\n\nExecution Plan:\n${promptContext.executionPlan}`;
    }

    // STEP 4 — TOKEN/CONTEXT PROTECTION: Prevent context overflow
    const MAX_SYSTEM_LENGTH = 8000;
    if (combinedSystemContent.length > MAX_SYSTEM_LENGTH) {
        log.warn(`System prompt exceeded ${MAX_SYSTEM_LENGTH} chars, trimming from ${combinedSystemContent.length}`);
        combinedSystemContent = combinedSystemContent.slice(-MAX_SYSTEM_LENGTH);
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

        telemetryLogger.info("llm session override", { provider: sessionProvider || "default", model: sessionModel || "default" });

        provider = createProvider({
            provider: sessionProvider,
            model: sessionModel,
        });
    }

    // Track latency
    const startTime = Date.now();

    // Create span for LLM call
    const llmSpan = tracer.startSpan("llm.call", {
        attributes: {
            "llm.provider": sessionSettings.provider || deps.config.LLM_PROVIDER,
            "llm.model": sessionSettings.model || deps.config.LLM_MODEL,
            "llm.history_length": messages.length,
        },
    });

    try {
        // Call the provider
        const response = await provider.chat(messages, toolDefinitions);
        
        const latency = Date.now() - startTime;

        // Record LLM metrics
        recordLlmCall(
            sessionSettings.provider || deps.config.LLM_PROVIDER,
            sessionSettings.model || deps.config.LLM_MODEL,
            latency,
            response.usage ? {
                prompt: response.usage.promptTokens,
                completion: response.usage.completionTokens,
            } : undefined
        );
        
        // Set span attributes
        llmSpan.setAttribute("llm.latency_ms", latency);
        if (response.usage) {
            llmSpan.setAttribute("llm.prompt_tokens", response.usage.promptTokens);
            llmSpan.setAttribute("llm.completion_tokens", response.usage.completionTokens);
            llmSpan.setAttribute("llm.total_tokens", response.usage.promptTokens + response.usage.completionTokens);
        }
        llmSpan.setStatus({ code: 0 });
        llmSpan.end();

        // Record usage stats
        if (response.usage) {
            const model = sessionSettings.model || deps.config.LLM_MODEL;
            const providerName = sessionSettings.provider || deps.config.LLM_PROVIDER;

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
    } catch (err) {
        llmSpan.setStatus({ code: 1, message: err instanceof Error ? err.message : String(err) });
        llmSpan.recordException(err as Error);
        llmSpan.end();
        throw err;
    }
}

