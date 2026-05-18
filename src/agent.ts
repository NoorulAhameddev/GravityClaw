import { config as appConfig } from "./config.ts";
import { createLogger, sanitizeForLogs } from "./logger.ts";
import { registry as toolRegistry } from "./tools/index.ts";
import {
    callClaude,
    addUserMessage,
    addAssistantMessage,
    addToolResult,
} from "./llm/index.ts";
import { retrieveRelevantMemories } from "./memory/retrieval.ts";
import { trackIterationMetrics } from "./performance/agent-optimization.ts";
import { trackToolExecution } from "./performance/tool-optimization.ts";
import { performance } from "perf_hooks";
import { withSpanAsync, withSpan, SpanKind, injectTraceContext, tracer } from "./lib/telemetry/tracer.js";
import { recordAgentRun } from "./lib/telemetry/metrics.js";
import { telemetryLogger } from "./lib/telemetry/logger.js";
import crypto from "crypto";
import { createBudgetTracker, checkTokenBudget } from "./query/tokenBudget.ts";
import { executeExtractMemories, incrementTurnCount } from "./memory/extractMemories.ts";
import { ToolExecutor } from "./tools/executor.ts";

const log = createLogger("agent");

export function isMeaningfulProgress(result: string): boolean {
    if (!result) return false;

    const normalized = result.toLowerCase();

    // allow explicit negative statements that report success by invocation
    if (normalized.includes("no error") || normalized.includes("no errors") || normalized.includes("not failed")) {
        return true;
    }

    // Only treat as non-progress if the ENTIRE result is an error message
    // (not if it just contains the word "error" somewhere in legitimate content)
    if (normalized.startsWith("error:") || normalized.startsWith("failed:")) {
        return false;
    }

    // Any non-empty result of reasonable length is progress
    if (normalized.length < 5) return false;

    return true;
}

function hashResult(result: string): string {
    return crypto
        .createHash("sha1")
        .update(result)
        .digest("hex");
}

/**
 * Dependencies that MUST be injected into runAgent
 * No fallback to module-level imports - explicit injection required
 */
export interface AgentDependencies {
    config: typeof appConfig;
    toolRegistry: typeof toolRegistry;
    toolExecutor?: ToolExecutor;
    db: typeof import("./db.ts").db;
}

export interface AgentRunOptions {
    message: string;
    sessionId: string;
    requestConfirmation?: (command: string) => Promise<boolean>;
    onProgress?: (text: string) => Promise<void>;
    userId?: string | undefined;
    platform?: string | undefined;
    groupId?: string | undefined;
    isGroup?: boolean | undefined;
    depth?: number;
    /** Override default max iterations (used for bounded DAG execution) */
    maxIterations?: number;
    /** Track total tool calls across nested agent invocations */
    parentToolCallCount?: number;
    /** Maximum total tool calls allowed including nested calls */
    maxTotalToolCalls?: number;
    /** REQUIRED: Injected dependencies - no fallback to module-level imports */
    dependencies: AgentDependencies;
}

export interface AgentRunResult {
    text: string;
    toolCallCount: number;
    hitLimit: boolean;
    toolCalls: Array<{ name: string; input: any; result?: any; success: boolean }>;
}

/**
 * The agentic loop.
 *
 * 1. Add user message to history
 * 2. Call LLM (via OpenRouter)
 * 3. If LLM wants tools → execute → feed results back → repeat
 * 4. If stop reason is "stop" with no tool calls → return final text
 * 5. If max iterations hit → inform user and stop
 */
export async function runAgent(options: AgentRunOptions): Promise<AgentRunResult> {
    // Enforce dependency injection - no silent fallbacks
    if (!options.dependencies) {
        throw new Error("Agent dependencies not provided - must inject { config, toolRegistry }");
    }

    return await withSpanAsync(
        "agent.run",
        async (span) => {
            span.setAttribute("session.id", options.sessionId);
            span.setAttribute("agent.source", options.platform || "unknown");

            const { message, sessionId, requestConfirmation, onProgress, dependencies, depth = 0, maxIterations: userMaxIterations, parentToolCallCount = 0, maxTotalToolCalls: parentMaxToolCalls } = options;
            const config = dependencies.config;
            const registry = dependencies.toolRegistry;
            const executor = dependencies.toolExecutor ?? new ToolExecutor(registry);
            const maxIterations = userMaxIterations ?? config.AGENT_MAX_ITERATIONS;
            const isBoundedRun = userMaxIterations !== undefined;
            const maxToolsTotal = (parentMaxToolCalls ?? config.AGENT_MAX_TOOLS_TOTAL) - parentToolCallCount;

            if (depth > 2) {
                throw new Error("Max agent depth exceeded (max: 2)");
            }
            
            if (maxToolsTotal <= 0) {
                telemetryLogger.warn("agent_nested_tool_limit", { session_id: sessionId, parent_tool_calls: parentToolCallCount });
                return {
                    text: "Maximum tool call limit reached from parent agent.",
                    toolCallCount: parentToolCallCount,
                    hitLimit: true,
                    toolCalls: [],
                };
            }
            
            const orchestratorDeps = {
                db: dependencies.db,
                config: dependencies.config,
            };
            
            // Filter tools to relevant subset based on user message (max 8)
            const relevantTools = registry.getRelevantTools(message);
            const toolDefs = registry.getOpenAIDefinitionsForTools(relevantTools);
            
            // STEP 6.1 — Add span for memory retrieval
            const relevantMemories = await withSpanAsync(
                "agent.memory.retrieval",
                async () => retrieveRelevantMemories(sessionId, message, {
                    limit: 8,
                    maxChars: 1800,
                }),
                { session_id: sessionId },
                SpanKind.INTERNAL
            );
            
            const runStartTime = performance.now();

            telemetryLogger.info("agent started", { session_id: sessionId, memory_count: relevantMemories.length });

            addUserMessage(sessionId, message, orchestratorDeps);

            let iteration = 0;
            let totalToolCalls = 0;
            let totalTokens = 0;
            const collectedText: string[] = [];
            const previousCalls = new Set<string>();
            let progressMade = false;
            let lastResultHash = "";
            let consecutiveNoProgress = 0;
            const maxToolsPerIteration = config.AGENT_MAX_TOOLS_PER_ITERATION;
            let hitToolLimit = false;
            const toolExecutionHistory: AgentRunResult['toolCalls'] = [];
            let budgetTracker = config.TOKEN_BUDGET_ENABLED ? createBudgetTracker() : null;

            while (iteration < maxIterations) {
                iteration++;
                const iterationStartTime = performance.now();
                log.debug(`Iteration ${iteration}/${maxIterations}`);

                let iterationProgressMade = false;
                let iterationToolCalls = 0;

                const response = await withSpanAsync(
                    "agent.plan",
                    async () => callClaude(sessionId, toolDefs, { relevantMemories }, orchestratorDeps),
                    { session_id: sessionId, iteration: iteration },
                    SpanKind.INTERNAL
                );

                if (response.usage) {
                    totalTokens += response.usage.promptTokens + response.usage.completionTokens;
                }

                if (config.TOKEN_BUDGET_ENABLED && budgetTracker) {
                    const budgetDecision = checkTokenBudget(budgetTracker, config.TOKEN_BUDGET_MAX, totalTokens);
                    if (budgetDecision.action === "continue") {
                        log.debug(budgetDecision.nudgeMessage);
                    } else if (budgetDecision.action === "stop" && budgetDecision.completionEvent) {
                        telemetryLogger.info("agent stopped by token budget", {
                            session_id: sessionId,
                            diminishing_returns: budgetDecision.completionEvent.diminishingReturns,
                            duration_ms: budgetDecision.completionEvent.durationMs,
                        });
                        break;
                    }
                }

                if (response.text) {
                    collectedText.push(response.text);
                    if (onProgress) {
                        await onProgress(response.text);
                    }
                }

                addAssistantMessage(
                    sessionId, 
                    response.text, 
                    orchestratorDeps, 
                    response.toolCalls.length > 0 ? response.toolCalls : undefined,
                    response.thought,
                    response.thoughtSignature
                );

                if (response.toolCalls.length === 0) {
                    const iterationDuration = performance.now() - iterationStartTime;
                    trackIterationMetrics({
                        sessionId,
                        iterationNumber: iteration,
                        duration: iterationDuration,
                        toolCallCount: 0,
                        messageLength: message.length,
                        timestamp: Date.now(),
                    });
                    recordAgentRun(true);

                    span.setAttribute("agent.success", true);

                    return withSpan(
                        "agent.respond",
                        () => {
                            telemetryLogger.info("agent completed", { session_id: sessionId, tool_calls: totalToolCalls });
                            return {
                                text: collectedText.join("\n").trim() || "(no response)",
                                toolCallCount: totalToolCalls,
                                hitLimit: false,
                                toolCalls: toolExecutionHistory,
                            };
                        },
                        { session_id: sessionId },
                        SpanKind.INTERNAL
                    );
                }

                await withSpanAsync(
                    "agent.execute",
                    async () => {
                        for (const toolCall of response.toolCalls) {
                            // Check per-iteration limit
                            if (iterationToolCalls >= maxToolsPerIteration) {
                                log.warn(`Max tools per iteration reached (${maxToolsPerIteration})`);
                                telemetryLogger.warn("agent_tool_limit_reached", {
                                    session_id: sessionId,
                                    limit_type: "per_iteration",
                                    limit_value: maxToolsPerIteration,
                                    iteration: iteration,
                                    total_tools: totalToolCalls
                                });
                                addToolResult(
                                    sessionId,
                                    toolCall.id,
                                    JSON.stringify({
                                        success: false,
                                        tool: toolCall.function.name,
                                        error: {
                                            type: "rate_limit",
                                            message: `Maximum ${maxToolsPerIteration} tool calls per iteration reached`
                                        }
                                    }),
                                    orchestratorDeps,
                                    toolCall.function.name
                                );
                                continue;
                            }
                            
                            // Check total limit
                            if (totalToolCalls >= maxToolsTotal) {
                                log.warn(`Max total tool calls reached (${maxToolsTotal})`);
                                telemetryLogger.warn("agent_tool_limit_reached", {
                                    session_id: sessionId,
                                    limit_type: "total",
                                    limit_value: maxToolsTotal,
                                    iteration: iteration,
                                    total_tools: totalToolCalls,
                                    parent_tool_calls: parentToolCallCount
                                });
                                // Add error result for this tool call
                                addToolResult(
                                    sessionId,
                                    toolCall.id,
                                    JSON.stringify({
                                        success: false,
                                        tool: toolCall.function.name,
                                        error: {
                                            type: "rate_limit",
                                            message: `Maximum total tool calls limit (${maxToolsTotal}) reached`
                                        }
                                    }),
                                    orchestratorDeps,
                                    toolCall.function.name
                                );
                                // Set flag and break out of for loop
                                hitToolLimit = true;
                                break;
                            }
                            
                            totalToolCalls++;
                            iterationToolCalls++;
                            const name = toolCall.function.name;
                            log.info(`Tool call: ${name}`);

                            let input: Record<string, unknown> = {};
                            try {
                                input = JSON.parse(toolCall.function.arguments || "{}") as Record<string, unknown>;
                            } catch {
                                addToolResult(
                                    sessionId,
                                    toolCall.id,
                                    JSON.stringify({
                                        success: false,
                                        tool: name,
                                        error: {
                                            type: "validation",
                                            message: "Could not parse tool arguments as JSON."
                                        }
                                    }),
                                    orchestratorDeps,
                                    name
                                );
                                continue;
                            }

                            // STEP 6.1 — Add span for validation
                            const normalizedInput = JSON.stringify(input, Object.keys(input).sort())
                                .replace(/\s+/g, "")
                                .replace(/\.\/+/g, "");
                            const callKey = `${name}:${normalizedInput}`;
                            if (previousCalls.has(callKey)) {
                                log.warn("Repeated tool call detected, breaking loop");
                                return {
                                    text: "Stopping due to repeated actions without progress.",
                                    toolCallCount: totalToolCalls,
                                    hitLimit: false,
                                };
                            }
                            previousCalls.add(callKey);

                            // STEP 6.1 — Add span for rate limit check
                            let approval: { approvedBy: string; reason: string } | undefined;
                            const tool = registry.get(name);
                            if (tool?.requiresApproval) {
                                if (!requestConfirmation) {
                                    const message = `Approval required for tool "${name}".`;
                                    addToolResult(
                                        sessionId,
                                        toolCall.id,
                                        JSON.stringify({
                                            success: false,
                                            tool: name,
                                            error: {
                                                type: "approval_required",
                                                message,
                                            }
                                        }),
                                        orchestratorDeps,
                                        name
                                    );
                                    toolExecutionHistory.push({
                                        name,
                                        input,
                                        result: message,
                                        success: false
                                    });
                                    continue;
                                }

                                const approvalSubject = name === "run_shell"
                                    ? String(input["command"] ?? "")
                                    : `${name} ${JSON.stringify(sanitizeForLogs(input))}`;
                                const confirmed = await requestConfirmation(approvalSubject);
                                if (!confirmed) {
                                    const message = "User declined to run this tool.";
                                    addToolResult(
                                        sessionId,
                                        toolCall.id,
                                        JSON.stringify({
                                            success: false,
                                            tool: name,
                                            error: {
                                                type: "approval_required",
                                                message,
                                            }
                                        }),
                                        orchestratorDeps,
                                        name
                                    );
                                    toolExecutionHistory.push({
                                        name,
                                        input,
                                        result: message,
                                        success: false
                                    });
                                    continue;
                                }
                                approval = { approvedBy: "interactive-confirmation", reason: "User confirmed in channel" };
                            }

                            const toolStartTime = performance.now();
                            const execution = await executor.execute({
                                toolName: name,
                                input,
                                context: {
                                    sessionId,
                                    userId: options.userId,
                                    platform: options.platform,
                                    groupId: options.groupId,
                                    isGroup: options.isGroup,
                                    depth: depth + 1,
                                    source: isBoundedRun ? "scheduler" : "agent",
                                },
                                approval,
                                timeoutMs: config.AGENT_TOOL_TIMEOUT_MS,
                            });

                            if (execution.success) {
                                const result = execution.result ?? "";
                                const toolDuration = performance.now() - toolStartTime;
                                trackToolExecution(name, toolDuration, false);

                                log.debug(`Tool result (${name}): ${result.substring(0, 80)}…`);
                                addToolResult(
                                    sessionId,
                                    toolCall.id,
                                    JSON.stringify({
                                        success: true,
                                        tool: name,
                                        data: result
                                    }),
                                    orchestratorDeps,
                                    name
                                );
                                toolExecutionHistory.push({
                                    name,
                                    input,
                                    result,
                                    success: true
                                });
                                const resultString = JSON.stringify(result);
                                const currentHash = hashResult(resultString);
                                if (currentHash === lastResultHash && lastResultHash !== "") {
                                    log.warn("No meaningful progress (same result), breaking loop");
                                    break;
                                }
                                lastResultHash = currentHash;
                                iterationProgressMade = iterationProgressMade || isMeaningfulProgress(resultString);
                            } else {
                                const toolDuration = performance.now() - toolStartTime;
                                trackToolExecution(name, toolDuration, true);

                                // STEP 6.3 — Error logging standard: tool name, input, stack trace
                                const error = execution.error ?? {
                                    type: "execution" as const,
                                    message: "Tool execution failed",
                                };
                                telemetryLogger.warn("tool_execution_denied_or_failed", {
                                    tool: name,
                                    sessionId,
                                    error_type: error.type,
                                });
                                addToolResult(
                                    sessionId,
                                    toolCall.id,
                                    JSON.stringify({
                                        success: false,
                                        tool: name,
                                        error,
                                    }),
                                    orchestratorDeps,
                                    name
                                );
                                toolExecutionHistory.push({
                                    name,
                                    input,
                                    result: error.message,
                                    success: false
                                });
                            }
                        }
                    },
                    { session_id: sessionId, iteration: iteration },
                    SpanKind.INTERNAL
                );

                // Break out of while loop if we hit the total tool limit
                if (hitToolLimit) {
                    log.info(`Total tool call limit reached (${maxToolsTotal}), stopping agent`);
                    break;
                }

                // Track consecutive iterations without progress
                if (!iterationProgressMade && response.toolCalls.length > 0) {
                    consecutiveNoProgress++;
                } else {
                    consecutiveNoProgress = 0;
                }

                // Only break early after 2+ consecutive no-progress iterations
                // This gives the LLM a chance to use tool results before giving up
                if (consecutiveNoProgress >= 2) {
                    log.info(`No progress for ${consecutiveNoProgress} consecutive iterations, breaking loop early`);
                    break;
                }

                progressMade = progressMade || iterationProgressMade;

                const iterationDuration = performance.now() - iterationStartTime;
                trackIterationMetrics({
                    sessionId,
                    iterationNumber: iteration,
                    duration: iterationDuration,
                    toolCallCount: response.toolCalls.length,
                    messageLength: message.length,
                    timestamp: Date.now(),
                });
            }

            // Run memory extraction after each turn if enabled
            if (config.ENABLE_MEMORY_EXTRACTION) {
                incrementTurnCount();
                const extractionMinTurns = config.MEMORY_EXTRACTION_MIN_TURNS ?? 10;
                const { getTurnCountSinceExtraction } = await import("./memory/extractMemories.js");
                if (getTurnCountSinceExtraction() >= extractionMinTurns) {
                    log.debug(`Running memory extraction after ${getTurnCountSinceExtraction()} turns`);
                    // Memory extraction failures must be surfaced - not silently swallowed
                    executeExtractMemories({ sessionId }).then((result) => {
                        if (result.extractedCount > 0) {
                            log.info(`Memory extraction completed: ${result.extractedCount} facts extracted`);
                        }
                    }).catch(e => {
                        telemetryLogger.error("memory_extraction_failed", { 
                            sessionId, 
                            error: e instanceof Error ? e.message : String(e) 
                        });
                        log.warn(`Memory extraction failed: ${e}`);
                    });
                }
            }

            span.setAttribute("agent.success", false);

            return withSpan(
                "agent.respond",
                () => {
                    if (hitToolLimit) {
                        telemetryLogger.warn("agent_max_tool_calls", { session_id: sessionId, total_tools: totalToolCalls });
                        recordAgentRun(false, "max_tool_calls");
                        return {
                            text:
                                `⚠️ Stopped due to reaching maximum tool call limit (${maxToolsTotal}). The task may be incomplete.\n\n` +
                                `Here's what I had so far:\n\n${collectedText.join("\n").trim()}`,
                            toolCallCount: totalToolCalls,
                            hitLimit: true,
                            toolCalls: toolExecutionHistory,
                        };
                    } else if (consecutiveNoProgress >= 2) {
                        telemetryLogger.warn("agent no progress", { session_id: sessionId, consecutive: consecutiveNoProgress });
                        recordAgentRun(false, "no_progress");
                        const collected = collectedText.join("\n").trim();
                        return {
                            text: collected || "I wasn't able to make progress on that request. Could you try rephrasing?",
                            toolCallCount: totalToolCalls,
                            hitLimit: true,
                            toolCalls: toolExecutionHistory,
                        };
                    } else {
                        telemetryLogger.warn("agent max iterations", { session_id: sessionId });
                        recordAgentRun(false, "max_iterations");
                        const collected = collectedText.join("\n").trim();
                        return {
                            text: collected ||
                                `⚠️ Stopped due to iteration limit. The task may be incomplete.`,
                            toolCallCount: totalToolCalls,
                            hitLimit: true,
                            toolCalls: toolExecutionHistory,
                        };
                    }
                },
                { session_id: sessionId },
                SpanKind.INTERNAL
            );
        },
        { session_id: options.sessionId },
        SpanKind.SERVER
    );
}

