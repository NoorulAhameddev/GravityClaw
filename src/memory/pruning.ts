/**
 * Context Pruning Module
 *
 * Automatically detects when conversation approaches model context limit (80% threshold)
 * and summarizes older messages to maintain conversation history while freeing tokens.
 *
 * Strategy:
 * - Keep last 5 recent message exchanges (user/assistant pairs)
 * - Summarize everything before that into a single "context summary" message
 * - Store summary as system message in conversation history
 * - Trigger automatically before LLM call or manually via /compact command
 */

import { getHistory, addAssistantMessage } from "../llm/index.ts";
import type { LLMMessage } from "../llm/index.ts";
import { getModelPricing, isApproachingContextLimit } from "../llm/pricing.ts";
import { getProvider } from "../llm/index.ts";
import { db } from "../db.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("pruning");

/**
 * Configuration for context pruning
 */
export interface PruningConfig {
  /** Threshold as percentage (0-100) - prune when exceeded */
  contextThreshold: number;

  /** Number of recent exchanges to keep (user/assistant pairs) */
  keepRecentExchanges: number;

  /** Enable automatic pruning before LLM calls */
  autoprune: boolean;

  /** Minimum conversation size before pruning (avoid pruning very small conversations) */
  minMessageCount: number;
}

/**
 * Default pruning configuration
 */
export const DEFAULT_PRUNING_CONFIG: PruningConfig = {
  contextThreshold: 80, // Prune when 80% of context used
  keepRecentExchanges: 5, // Keep last 5 exchanges (10 messages)
  autoprune: true,
  minMessageCount: 20, // Don't prune conversations with <20 messages
};

/**
 * Calculate current context usage percentage
 * @param sessionId - Session identifier
 * @param modelName - Model name to get context window
 * @returns {number} Percentage of context window used (0-100)
 */
export function calculateContextUsage(sessionId: string, modelName: string): number {
  try {
    const history = getHistory(sessionId);
    if (history.length === 0) {
      return 0;
    }

    // Rough token estimation: ~4 characters = 1 token (simplified)
    const totalChars = history.reduce((sum, msg) => {
      return sum + (msg.content?.length ?? 0) + 50; // 50 chars for metadata
    }, 0);

    const estimatedTokens = Math.ceil(totalChars / 4);
    const pricing = getModelPricing(modelName);
    const contextWindow = pricing.contextWindow;

    return Math.min(100, Math.round((estimatedTokens / contextWindow) * 100));
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.warn(`Error calculating context usage: ${errMsg}`);
    return 0;
  }
}

/**
 * Check if context is approaching limit
 * @param sessionId - Session identifier
 * @param modelName - Model name
 * @param threshold - Percentage threshold (default: 80)
 * @returns {boolean} true if approaching limit
 */
export function isContextNearLimit(
  sessionId: string,
  modelName: string,
  threshold: number = DEFAULT_PRUNING_CONFIG.contextThreshold
): boolean {
  const usage = calculateContextUsage(sessionId, modelName);
  return usage >= threshold;
}

/**
 * Generate summary of messages for pruning
 * Uses LLM to create concise summary of conversation history
 * @param sessionId - Session identifier
 * @param messagesToSummarize - Messages to summarize
 * @returns {Promise<string>} Summary text
 */
export async function generateContextSummary(
  sessionId: string,
  messagesToSummarize: LLMMessage[]
): Promise<string> {
  try {
    if (messagesToSummarize.length === 0) {
      return "No prior context.";
    }

    // Create summary prompt
    const conversationText = messagesToSummarize
      .map((msg, i) => {
        const role = msg.role === "user" ? "User" : "Assistant";
        let content = "";

        // Handle different content types (string or array of content parts)
        if (typeof msg.content === "string") {
          content = msg.content;
        } else if (Array.isArray(msg.content)) {
          content = msg.content
            .map((part: any) => (typeof part === "object" && part.text ? part.text : ""))
            .join("");
        }

        // Truncate very long messages for summary prompt
        const truncated = content.length > 500 ? content.substring(0, 500) + "..." : content;
        return `${role} (${i + 1}): ${truncated}`;
      })
      .join("\n");

    const summaryPrompt = `Summarize the following conversation history concisely. Focus on key decisions, facts learned, and important context. Keep it brief but comprehensive. Aim for 2-3 sentences or bullet points.

Conversation:
${conversationText}

Summary:`;

    // Call LLM for summary - build message array without tool definitions
    const provider = getProvider();
    const summaryMessages = [
      {
        role: "user" as const,
        content: summaryPrompt,
      },
    ];

    const response = await provider.chat(
      summaryMessages,
      []
    );

    const summary = response.text;
    log.info(`Generated context summary with ${summary.length} characters`);
    return summary;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error(`Error generating context summary: ${errMsg}`);
    // Return fallback summary if LLM fails
    return `[Pruned ${messagesToSummarize.length} previous messages due to context limits]`;
  }
}

/**
 * Identify which messages should be summarized
 * Keeps recent exchanges, summarizes older ones
 * @param history - Full message history
 * @param keepExchanges - Number of recent exchanges to keep
 * @returns {Array} [messagesToKeep, messagesToSummarize]
 */
export function identifyPrunableMessages(
  history: LLMMessage[],
  keepExchanges: number = DEFAULT_PRUNING_CONFIG.keepRecentExchanges
): [LLMMessage[], LLMMessage[]] {
  if (history.length <= keepExchanges * 2) {
    // Not enough messages to prune
    return [history, []];
  }

  const messagesPerExchange = 2; // user + assistant
  const messagesToKeep = keepExchanges * messagesPerExchange;
  const pruneUpTo = history.length - messagesToKeep;

  const pruneable = history.slice(0, pruneUpTo);
  const recent = history.slice(pruneUpTo);

  return [recent, pruneable];
}

/**
 * Prune conversation context by summarizing old messages
 * @param sessionId - Session identifier
 * @param modelName - Model name
 * @param config - Pruning configuration
 * @returns {Promise<object>} Result with pruning metrics
 */
export async function pruneContext(
  sessionId: string,
  modelName: string,
  config: Partial<PruningConfig> = {}
): Promise<{
  wasPruned: boolean;
  contextUsageBefore: number;
  contextUsageAfter: number;
  messagesPruned: number;
  summaryLength: number;
}> {
  const finalConfig = { ...DEFAULT_PRUNING_CONFIG, ...config };

  try {
    const history = getHistory(sessionId);
    const contextUsageBefore = calculateContextUsage(sessionId, modelName);

    log.info(
      `Starting context pruning for session ${sessionId}: ${contextUsageBefore}% usage, ${history.length} messages`
    );

    // Check conditions for pruning
    if (history.length < finalConfig.minMessageCount) {
      log.debug(
        `Skipping prune: only ${history.length} messages (min: ${finalConfig.minMessageCount})`
      );
      return {
        wasPruned: false,
        contextUsageBefore,
        contextUsageAfter: contextUsageBefore,
        messagesPruned: 0,
        summaryLength: 0,
      };
    }

    if (contextUsageBefore < finalConfig.contextThreshold) {
      log.debug(`Skipping prune: context usage ${contextUsageBefore}% < threshold ${finalConfig.contextThreshold}%`);
      return {
        wasPruned: false,
        contextUsageBefore,
        contextUsageAfter: contextUsageBefore,
        messagesPruned: 0,
        summaryLength: 0,
      };
    }

    // Identify prunable messages
    const [recentMessages, prunableMessages] = identifyPrunableMessages(
      history,
      finalConfig.keepRecentExchanges
    );

    if (prunableMessages.length === 0) {
      log.debug("No messages to prune");
      return {
        wasPruned: false,
        contextUsageBefore,
        contextUsageAfter: contextUsageBefore,
        messagesPruned: 0,
        summaryLength: 0,
      };
    }

    // Generate summary
    const summary = await generateContextSummary(sessionId, prunableMessages);

    // Create summary message to insert into history
    const summaryMessage: LLMMessage = {
      role: "user",
      content: `[Context Summary]\n${summary}`,
    };

    // 1. Delete prunableMessages from the database
    db.prepare("DELETE FROM memory WHERE session_id = ? AND timestamp IN (" +
      prunableMessages.map(() => "?").join(",") + ")")
      .run(sessionId, ...prunableMessages.map(m => (m as any).timestamp));

    // Note: The above assumes we have timestamps. If not, we might need a different approach.
    // Let's refine this to use IDs if possible, but our LLMMessage doesn't have IDs.
    // Given the current schema, let's just clear and re-insert the recent ones plus summary.

    // 1. Fetch current settings to preserve them
    const { getSessionSettings } = await import("../session.ts");
    const currentSettings = getSessionSettings(sessionId);
    const settingsJson = JSON.stringify(currentSettings);

    // 2. Clear session history
    db.prepare("DELETE FROM memory WHERE session_id = ?").run(sessionId);

    // 3. Insert summary message with preserved settings
    db.prepare("INSERT INTO memory (session_id, message_json, settings) VALUES (?, ?, ?)")
      .run(sessionId, JSON.stringify(summaryMessage), settingsJson);

    // 4. Re-insert recent messages with preserved settings
    for (const msg of recentMessages) {
      db.prepare("INSERT INTO memory (session_id, message_json, settings) VALUES (?, ?, ?)")
        .run(sessionId, JSON.stringify(msg), settingsJson);
    }

    addAssistantMessage(sessionId, `Acknowledged context update. ${summary.length} characters summarized.`);

    // Calculate new context usage (approximate)
    const newHistory = getHistory(sessionId);
    const contextUsageAfter = calculateContextUsage(sessionId, modelName);

    log.info(
      `Context pruned: ${prunableMessages.length} messages → summary (${summary.length} chars), usage ${contextUsageBefore}% → ${contextUsageAfter}%`
    );

    return {
      wasPruned: true,
      contextUsageBefore,
      contextUsageAfter,
      messagesPruned: prunableMessages.length,
      summaryLength: summary.length,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error(`Error pruning context: ${errMsg}`);
    throw err;
  }
}

/**
 * Format pruning result for display
 * @param result - Pruning result
 * @returns {string} Formatted message
 */
export function formatPruningResult(result: Awaited<ReturnType<typeof pruneContext>>): string {
  if (!result.wasPruned) {
    return `Context usage: ${result.contextUsageBefore}% (no pruning needed)`;
  }

  return (
    `✂️ **Context Pruned**\n` +
    `• Messages summarized: ${result.messagesPruned}\n` +
    `• Summary size: ${result.summaryLength} chars\n` +
    `• Usage before: ${result.contextUsageBefore}%\n` +
    `• Usage after: ${result.contextUsageAfter}%\n` +
    `• Saved: ~${Math.round((result.contextUsageBefore - result.contextUsageAfter) * 10)}% context`
  );
}

/**
 * Get pruning status/metrics
 * @param sessionId - Session identifier
 * @param modelName - Model name
 * @returns {object} Status object
 */
export function getPruningStatus(sessionId: string, modelName: string) {
  const history = getHistory(sessionId);
  const contextUsage = calculateContextUsage(sessionId, modelName);
  const nearLimit = isContextNearLimit(sessionId, modelName);
  const pricing = getModelPricing(modelName);

  return {
    sessionId,
    modelName,
    contextWindow: pricing.contextWindow,
    estimatedTokensUsed: Math.ceil((contextUsage / 100) * pricing.contextWindow),
    contextUsagePercent: contextUsage,
    messageCount: history.length,
    isNearLimit: nearLimit,
    recommendedAction: nearLimit ? "Consider /compact to prune context" : "Context usage healthy",
  };
}
