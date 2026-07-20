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
import { applyMicrocompact } from "../compact/microCompact.js";
import type { Message, StreamCallback } from "../types/llm.js";
import { pruneContext } from "../memory/pruning.ts";
import { trace } from "@opentelemetry/api";
import { recordLlmCall } from "../lib/telemetry/metrics.js";
import { telemetryLogger } from "../lib/telemetry/logger.js";
import { trackBackgroundTask } from "../lib/background.ts";

const log = createLogger("llm");
const tracer = trace.getTracer("gravyclaw");

const MAX_MESSAGES = 20;

export interface OrchestratorDependencies {
    db: typeof dbModule;
    config: typeof configModule;
}

import type { MicrocompactResult } from "../compact/microCompact.js";

export interface PromptContext {
    relevantMemories?: RetrievedMemory[];
    sessionFacts?: string;
    attachmentContext?: string;
    executionPlan?: string;
    mcResult?: MicrocompactResult;
}

function sanitizeMemoryContent(content: string): string {
    return content
        .normalize("NFC")

        // Remove zero-width characters
        .replace(/[\u200B\u200C\u200D\u200E\u200F\uFEFF\u00AD]/g, "")

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
        .replace(/you\s+are\s+now/gi, "[REMOVED_ROLE]")
        .replace(/ignore\s+all\s+previous/gi, "[REMOVED_INJECTION]")
        .replace(/disregard\s+(all\s+)?(previous|prior)?/gi, "[REMOVED_INJECTION]")
        .replace(/forget\s+(all\s+)?(previous|prior|your)?/gi, "[REMOVED_INJECTION]")
        .replace(/new\s+instructions/gi, "[REMOVED_INJECTION]")
        .replace(/override\s+(system|previous)?/gi, "[REMOVED_INJECTION]")
        .replace(/\[INST\]/gi, "[MARKER_REMOVED]")
        .replace(/\[SYS\]/gi, "[MARKER_REMOVED]")

        // Neutralize dangerous action verbs
        .replace(/\b(run|execute|delete|drop|install|fetch|curl|wget)\b/gi, "[FILTERED]")

        // Neutralize role confusion attempts
        .replace(/^i\s+am\s+(?:the\s+)?(ai|assistant|model|bot|agent)/gim, "[ROLE_CLAIM_BLOCKED]")
        .replace(/^you\s+(?:are|should|must)\s+/gim, "[INSTRUCTION_BLOCKED]")
        .replace(/^ignore\s+prior/gim, "[REMOVED_INJECTION]")

        // Block common jailbreak patterns
        .replace(/DAN\.?\.?/gi, "[JAILBREAK_BLOCKED]")
        .replace(/developer\s+mode/gi, "[JAILBREAK_BLOCKED]")
        .replace(/jailbreak/gi, "[JAILBREAK_BLOCKED]")
        .replace(/do\s+anything\s+now/gi, "[JAILBREAK_BLOCKED]")
        .replace(/act\s+as\s+(an?\s+)?(unrestricted|unfiltered)/gi, "[JAILBREAK_BLOCKED]")
        .replace(/pretend\s+(to\s+be|you\s+are)/gi, "[JAILBREAK_BLOCKED]")
        .replace(/roleplay\s+as/gi, "[JAILBREAK_BLOCKED]")

        // Hard cap
        .slice(0, 10000)
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
    const rows = deps.db.prepare("SELECT message_json FROM (SELECT id, message_json, timestamp FROM memory WHERE session_id = ? ORDER BY timestamp DESC, id DESC LIMIT 200) sub ORDER BY timestamp ASC, id ASC").all(sessionId) as { message_json: string }[];
    const messages = rows.map((row) => JSON.parse(row.message_json));

    // Token protection: trim oldest history if exceeds MAX_MESSAGES
    if (messages.length > MAX_MESSAGES) {
        let trimmed = messages.slice(-MAX_MESSAGES);
        
        // Find first 'user' message to ensure conversation structure is valid for strict providers
        const firstUserIndex = trimmed.findIndex(m => m.role === "user");
        if (firstUserIndex > 0) {
            trimmed = trimmed.slice(firstUserIndex);
        } else if (firstUserIndex === -1) {
            // If no user message found in the last MAX_MESSAGES, take the absolute last few turns
            // and force the first one to be a dummy user message if necessary (rare edge case)
            log.warn(`No user message found in last ${MAX_MESSAGES} messages during trimming`);
        }
        
        log.debug(`Trimmed history from ${messages.length} to ${trimmed.length} messages starting with role: ${trimmed[0]?.role}`);
        return trimmed;
    }

    return messages;
}

/** Filter to prevent low-quality memory storage for user/assistant messages */
function shouldStoreMemory(content: string): boolean {
    const text = content.toLowerCase().trim();

    if (text.length < 5) {
        return false;
    }

    // Block injection attempts from being stored as facts
    const injectionPatterns = [
        'ignore',
        'forget',
        'disregard',
        'override',
        'new instructions',
        'bypass',
        'security',
        'system prompt',
    ];
    
    for (const pattern of injectionPatterns) {
        if (text.includes(pattern)) {
            log.debug(`Blocked potential injection from memory storage: ${pattern}`);
            return false;
        }
    }

    return true;
}

/**
 * Sanitize fact content to prevent injection attacks
 */
function sanitizeFact(fact: string): string {
    // Remove any content that looks like instructions
    const cleaned = fact
        .replace(/^(ignore|forget|disregard|override|bypass)/gi, '')
        .replace(/all previous/gi, '')
        .replace(/your instructions/gi, '')
        .replace(/system prompt/gi, '')
        .replace(/\[.*\]/g, '') // Remove bracketed content
        .trim();
    
    // Only return if there's still meaningful content
    if (cleaned.length < 2) {
        return '';
    }
    
    return cleaned.slice(0, 100); // Limit fact length
}

/** Extract meaningful facts from content */
function extractFacts(content: string): string[] {
    if (typeof content !== 'string') {
        return [];
    }
    const facts: string[] = [];
    const text = content.toLowerCase();

    // Block obvious injection attempts before processing
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes('ignore all') || 
        lowerContent.includes('forget everything') ||
        lowerContent.includes('disregard all') ||
        lowerContent.includes('new instructions') ||
        lowerContent.includes('override ') ||
        lowerContent.includes('bypass ') ||
        lowerContent.includes('system:') ||
        lowerContent.includes('[system]') ||
        lowerContent.startsWith('my ') && lowerContent.includes('is ') && (lowerContent.includes(' to ') || lowerContent.includes(' and '))) {
        // Looks like injection, don't extract any facts
        log.debug('Blocked potential prompt injection from fact extraction');
        return [];
    }

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
            const extracted = match[1].trim();
            // Sanitize before storing
            const safe = sanitizeFact(extracted);
            if (safe && safe.length >= 2) {
                facts.push(safe);
            }
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
    // Allow alphanumeric, hyphens, underscores, and colons (used for channel prefixes)
    if (!/^[a-zA-Z0-9\-_:]+$/.test(sessionId)) {
        throw new Error('Session ID contains invalid characters. Only alphanumeric, hyphens, underscores, and colons are allowed.');
    }
}

/**
 * Validate that user is authorized to use this session
 * In production, this should verify the user owns the session
 */
function validateSessionAccess(sessionId: string, userId?: string): void {
    // In a full implementation, verify session ownership via database
    // For now, we ensure session ID doesn't contain suspicious patterns
    
    // Block session fixation attempts - allow colons for channel prefixes but block path traversal
    if (sessionId.includes('..')) {
        throw new Error('Invalid session ID format');
    }
}

/** Appends a user message to history */
export function addUserMessage(sessionId: string, text: string, deps: OrchestratorDependencies): void {
    validateSessionId(sessionId);
    const facts = extractFacts(text);
    const memoryType = facts.length > 0 ? "fact" : "conversation";
    
    const sanitizedText = text.normalize("NFC").replace(/[\u200B\u200C\u200D\u200E\u200F\uFEFF\u00AD]/g, "");
    const msg = { role: "user", content: sanitizedText, memoryType };
    const row = deps.db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?) RETURNING id").get(sessionId, JSON.stringify(msg)) as { id: number } | undefined;
    const id = row?.id ? `${sessionId}:user:${row.id}` : `${sessionId}:user:${Date.now()}`;
    
    // Track async side effects through the background task manager
    // These must not block the main flow but failures are surfaced to telemetry
    trackBackgroundTask("memory_sync", sessionId, () =>
        enqueueMessageSync({ sessionId, role: "user", content: text }),
    );
    trackBackgroundTask("vector_upsert", sessionId, () =>
        upsertVectorMemory({ id, sessionId, role: "user", content: text }),
    );

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
    toolCalls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
    thought?: string,
    thoughtSignature?: string
): void {
    validateSessionId(sessionId);
    const msg: {
        role: string;
        content: string;
        memoryType: string;
        tool_calls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
        thought?: string;
        thoughtSignature?: string;
    } = { role: "assistant", content, memoryType: "conversation" };
    if (toolCalls && toolCalls.length > 0) {
        msg.tool_calls = toolCalls;
    }
    if (thought) msg.thought = thought;
    if (thoughtSignature) msg.thoughtSignature = thoughtSignature;
    const row = deps.db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?) RETURNING id").get(sessionId, JSON.stringify(msg)) as { id: number } | undefined;
    const id = row?.id ? `${sessionId}:assistant:${row.id}` : `${sessionId}:assistant:${Date.now()}`;
    
    // Track async side effects through the background task manager
    trackBackgroundTask("memory_sync_assistant", sessionId, () =>
        enqueueMessageSync({ sessionId, role: "assistant", content }),
    );

    if (content) {
        trackBackgroundTask("vector_upsert_assistant", sessionId, () =>
            upsertVectorMemory({ id, sessionId, role: "assistant", content }),
        );
    }
}

/** Appends a tool result to history (feeds back into the agentic loop) */
export function addToolResult(
    sessionId: string,
    toolCallId: string,
    result: string,
    deps: OrchestratorDependencies,
    toolName?: string
): void {
    validateSessionId(sessionId);

    const content = result || "(empty result)";
    const msg: {
        role: string;
        tool_call_id: string;
        content: string;
        name?: string;
    } = {
        role: "tool",
        tool_call_id: toolCallId,
        content,
    };
    if (toolName) msg.name = toolName;
    
    deps.db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)").run(sessionId, JSON.stringify(msg));
    
    // Track async side effects through the background task manager
    trackBackgroundTask("memory_sync_tool", sessionId, () =>
        enqueueMessageSync({ sessionId, role: "tool", content }),
    );
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
    deps: OrchestratorDependencies,
    onToken?: StreamCallback
): Promise<ClaudeResponse> {
    const history = getHistory(sessionId, deps);
    log.debug(`Calling LLM — history length: ${history.length}`);

    const shouldCompact = configModule.ENABLE_MICROCOMPACT && history.length >= 10;
    let mcResult: MicrocompactResult | undefined;
    let compactedHistory = history;
    
    if (shouldCompact) {
        try {
            mcResult = await applyMicrocompact(history as Message[]);
            if (mcResult && mcResult.messages.length > 0) {
                compactedHistory = mcResult.messages as ChatCompletionMessageParam[];
                log.debug(`Applied microcompact: ${mcResult.compactedCount} tools compacted, ~${mcResult.tokensFreed} tokens freed`);
            }
        } catch (e) {
            log.debug(`Microcompact failed: ${e}`);
            compactedHistory = history;
        }
    }

    // Check for session-specific settings (provider/model/thinking level)
    const sessionSettings = getSessionSettings(sessionId);

    // Apply thinking level to system prompt
    const thinkingLevel = (sessionSettings.thinkingLevel as ThinkingLevel) || "off";
    const enhancedSystemPrompt = applyThinkingToSystemPrompt(SYSTEM_PROMPT, thinkingLevel);
    log.debug(`Thinking level: ${thinkingLevel}`);

    // Apply thinking level to user messages in history
    const enhancedHistory = compactedHistory.map(msg => {
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
    
    let systemPromptContent = enhancedSystemPrompt;
    
    if (configModule.MEMORY_DIRECTORY_ENABLED) {
        try {
            const { loadMemoryPrompt } = await import("../memory/memdir.js");
            const memoryPrompt = await loadMemoryPrompt();
            if (memoryPrompt) {
                systemPromptContent += `\n\n${memoryPrompt}`;
            }
        } catch (e) {
            log.debug(`Memory directory not available: ${e}`);
        }
    }

    if (promptContext?.relevantMemories && promptContext.relevantMemories.length > 0) {
        const filtered = promptContext.relevantMemories.filter(m => m.role !== "tool");
        
        const facts = filtered.filter(m => m.memoryType === "fact");
        const conversations = filtered.filter(m => m.memoryType !== "fact");

        if (facts.length > 0) {
            const factsContent = facts.map(m => `- ${m.content}`).join("\n");
            systemPromptContent += `
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
            systemPromptContent += `
Relevant Conversation (contextual):
These are past conversation snippets. Use them only if clearly relevant to the current task.

${convContent}
`;
        }
    }

    if (sessionFacts) {
        systemPromptContent += `\n\nSession memory facts:\n${sessionFacts}`;
    }
    if (attachmentContext) {
        systemPromptContent += `\n\nRecent attachment memory:\n${attachmentContext}`;
    }
    if (promptContext?.executionPlan) {
        systemPromptContent += `\n\nExecution Plan:\n${promptContext.executionPlan}`;
    }
    const MAX_SYSTEM_LENGTH = 50000;
    if (systemPromptContent.length > MAX_SYSTEM_LENGTH) {
        log.warn(`System prompt exceeded ${MAX_SYSTEM_LENGTH} chars, trimming from ${systemPromptContent.length}`);
        systemPromptContent = systemPromptContent.slice(-MAX_SYSTEM_LENGTH);
    }

const messagesWithSystem: ChatCompletionMessageParam[] = [
        { role: "system", content: systemPromptContent },
        ...compactedHistory,
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
            "llm.history_length": messagesWithSystem.length,
        },
    });

    try {
        let response: LLMResponse;
        
        const useStream = onToken !== undefined && typeof provider.chatStream === "function";
        
        if (useStream) {
            response = await provider.chatStream!(messagesWithSystem, toolDefinitions, { onToken });
        } else if (deps.config.RETRY_MAX_RETRIES && deps.config.RETRY_MAX_RETRIES > 0) {
            const { withRetrySimple } = await import("./retry.js");
            response = await withRetrySimple(async () => provider.chat(messagesWithSystem, toolDefinitions));
        } else {
            response = await provider.chat(messagesWithSystem, toolDefinitions);
        }
        
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
