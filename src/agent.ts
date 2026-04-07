import { config as appConfig } from "./config.ts";
import { createLogger, sanitizeForLogs } from "./logger.ts";
import { validateCommand } from "./security/command-validator.ts";
import { registry as toolRegistry } from "./tools/index.ts";
import { rateLimiter, createRateLimitErrorResponse } from "./middleware/rate-limit.ts";
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
import { recordAgentRun, recordToolCall } from "./lib/telemetry/metrics.js";
import { telemetryLogger } from "./lib/telemetry/logger.js";
import Ajv from "ajv";
import crypto from "crypto";

const log = createLogger("agent");
const ajv = new Ajv();

export function isMeaningfulProgress(result: string): boolean {
    if (!result) return false;

    const normalized = result.toLowerCase();

    // allow explicit negative statements that report success by invocation
    if (normalized.includes("no error") || normalized.includes("no errors") || normalized.includes("not failed")) {
        return true;
    }

    if (/\b(error|failed|exception|timeout)\b/.test(normalized)) {
        return false;
    }

    if (normalized.length < 20) return false;

    return true;
}

function hashResult(result: string): string {
    return crypto
        .createHash("sha1")
        .update(result)
        .digest("hex");
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`Tool timeout exceeded (${ms}ms)`)), ms)
        )
    ]);
}

/**
 * Dependencies that MUST be injected into runAgent
 * No fallback to module-level imports - explicit injection required
 */
export interface AgentDependencies {
    config: typeof appConfig;
    toolRegistry: typeof toolRegistry;
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
    /** REQUIRED: Injected dependencies - no fallback to module-level imports */
    dependencies: AgentDependencies;
}

export interface AgentRunResult {
    text: string;
    toolCallCount: number;
    hitLimit: boolean;
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

            const { message, sessionId, requestConfirmation, onProgress, dependencies, depth = 0, maxIterations: userMaxIterations } = options;
            const config = dependencies.config;
            const registry = dependencies.toolRegistry;
            const maxIterations = userMaxIterations ?? config.AGENT_MAX_ITERATIONS;
            const isBoundedRun = userMaxIterations !== undefined;

            if (depth > 2) {
                throw new Error("Max agent depth exceeded (max: 2)");
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
            const collectedText: string[] = [];
            const previousCalls = new Set<string>();
            let progressMade = false;
            let lastResultHash = "";
            const maxToolsPerIteration = config.AGENT_MAX_TOOLS_PER_ITERATION;
            const maxToolsTotal = config.AGENT_MAX_TOOLS_TOTAL;
            let hitToolLimit = false;

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

                if (response.text) {
                    collectedText.push(response.text);
                    if (onProgress) {
                        await onProgress(response.text);
                    }
                }

                addAssistantMessage(sessionId, response.text, orchestratorDeps, response.toolCalls.length > 0 ? response.toolCalls : undefined);

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
                                    orchestratorDeps
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
                                    total_tools: totalToolCalls
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
                                    orchestratorDeps
                                );
                                // Set flag and break out of for loop
                                hitToolLimit = true;
                                break;
                            }
                            
                            totalToolCalls++;
                            iterationToolCalls++;
                            const name = toolCall.function.name;
                            log.info(`Tool call: ${name}`);

                            const tool = registry.get(name);

                            if (!tool) {
                                log.warn(`Unknown tool: ${name}`);
                                addToolResult(
                                    sessionId,
                                    toolCall.id,
                                    JSON.stringify({
                                        success: false,
                                        tool: name,
                                        error: {
                                            type: "execution",
                                            message: `Tool "${name}" not found.`
                                        }
                                    }),
                                    orchestratorDeps
                                );
                                continue;
                            }

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
                                    orchestratorDeps
                                );
                                continue;
                            }

                            // STEP 6.1 — Add span for validation
                            await withSpanAsync(
                                "agent.validation",
                                async () => {
                                    const validate = ajv.compile(tool.inputSchema);
                                    const valid = validate(input);
                                    if (!valid) {
                                        log.warn(`Invalid input for tool ${name}: ${JSON.stringify(validate.errors)}`);
                                        addToolResult(
                                            sessionId,
                                            toolCall.id,
                                            JSON.stringify({
                                                success: false,
                                                tool: name,
                                                error: {
                                                    type: "validation",
                                                    message: JSON.stringify(validate.errors)
                                                }
                                            }),
                                            orchestratorDeps
                                        );
                                        throw new Error("Validation failed");
                                    }
                                },
                                { tool_name: name, session_id: sessionId },
                                SpanKind.INTERNAL
                            );

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
                            await withSpanAsync(
                                "agent.ratelimit.check",
                                async () => {
                                    const rateLimitStatus = rateLimiter.checkRateLimit(sessionId, name);
                                    if (!rateLimitStatus.allowed) {
                                        log.warn(`Rate limit exceeded for tool '${name}' in session ${sessionId}`);
                                        const errorResponse = createRateLimitErrorResponse(rateLimitStatus);
                                        addToolResult(
                                            sessionId,
                                            toolCall.id,
                                            JSON.stringify({
                                                success: false,
                                                tool: name,
                                                error: {
                                                    type: "rate_limit",
                                                    message: errorResponse.message,
                                                    retryAfter: errorResponse.retryAfter
                                                }
                                            }),
                                            orchestratorDeps
                                        );
                                        throw new Error("Rate limit exceeded");
                                    }
                                },
                                { tool_name: name, session_id: sessionId },
                                SpanKind.INTERNAL
                            );

                            if (name === "run_shell" && requestConfirmation) {
                                const command = String(input["command"] ?? "");
                                const { isDangerous } = await import("./tools/system/shell.ts");
                                if (isDangerous(command)) {
                                    log.warn(`Dangerous command, requesting confirmation: ${command}`);
                                    const confirmed = await requestConfirmation(command);
                                    if (!confirmed) {
                                        addToolResult(
                                            sessionId,
                                            toolCall.id,
                                            JSON.stringify({
                                                success: false,
                                                tool: name,
                                                error: {
                                                    type: "execution",
                                                    message: "User declined to run this command."
                                                }
                                            }),
                                            orchestratorDeps
                                        );
                                        continue;
                                    }
                                }
                            }

                            function isToolSafe(toolName: string, toolInput: Record<string, unknown>): boolean {
                                if (toolName === "run_shell") {
                                    const cmd = String(toolInput["command"] || "");
                                    
                                    // Use new command validator
                                    const validation = validateCommand(cmd);
                                    
                                    if (!validation.allowed) {
                                        telemetryLogger.warn("Blocked command", { 
                                            command: cmd, 
                                            reason: validation.reason || "unknown",
                                            baseCommand: validation.parsed.baseCommand,
                                            args: validation.parsed.args.join(" "),
                                            hasChaining: validation.parsed.hasChaining,
                                            hasRedirection: validation.parsed.hasRedirection,
                                            hasInjection: validation.parsed.hasInjection
                                        });
                                        return false;
                                    }
                                    
                                    telemetryLogger.info("Allowed command", { 
                                        command: cmd,
                                        baseCommand: validation.parsed.baseCommand,
                                        args: validation.parsed.args.join(" ")
                                    });
                                    return true;
                                }
                                return true;
                            }

                            if (!isToolSafe(name, input)) {
                                addToolResult(
                                    sessionId,
                                    toolCall.id,
                                    JSON.stringify({
                                        success: false,
                                        tool: name,
                                        error: {
                                            type: "execution",
                                            message: "Command blocked: not allowed by safety policy"
                                        }
                                    }),
                                    orchestratorDeps
                                );
                                continue;
                            }

                            const toolStartTime = performance.now();
                            try {
                                const result = await withSpanAsync(
                                    `tool.${name}`,
                                    async () => {
                                        const controller = new AbortController();
                                        const timeoutMs = 10000;
                                        return await withTimeout(
                                            tool.execute({
                                                ...input,
                                                __sessionId: sessionId,
                                                __userId: options.userId,
                                                __platform: options.platform,
                                                __groupId: options.groupId,
                                                __isGroup: options.isGroup,
                                                __depth: depth + 1,
                                                __signal: controller.signal,
                                            }),
                                            timeoutMs
                                        ).catch((err) => {
                                            controller.abort();
                                            throw err;
                                        });
                                    },
                                    { tool_name: name, session_id: sessionId },
                                    SpanKind.CONSUMER
                                );
                                const toolDuration = performance.now() - toolStartTime;
                                trackToolExecution(name, toolDuration, false);
                                recordToolCall(name, true);

                                log.debug(`Tool result (${name}): ${result.substring(0, 80)}…`);
                                addToolResult(
                                    sessionId,
                                    toolCall.id,
                                    JSON.stringify({
                                        success: true,
                                        tool: name,
                                        data: result
                                    }),
                                    orchestratorDeps
                                );
                                const resultString = JSON.stringify(result);
                                const currentHash = hashResult(resultString);
                                if (currentHash === lastResultHash && lastResultHash !== "") {
                                    log.warn("No meaningful progress (same result), breaking loop");
                                    break;
                                }
                                lastResultHash = currentHash;
                                iterationProgressMade = iterationProgressMade || isMeaningfulProgress(resultString);
                            } catch (err) {
                                const toolDuration = performance.now() - toolStartTime;
                                trackToolExecution(name, toolDuration, true);
                                recordToolCall(name, false);
                                const msg = err instanceof Error ? err.message : "unknown error";
                                const errStack = err instanceof Error ? err.stack : undefined;
                                const isTimeout = msg.includes("timeout");
                                const isValidationError = msg.includes("Validation failed");
                                const isRateLimitError = msg.includes("Rate limit exceeded");

                                // STEP 6.3 — Error logging standard: tool name, input, stack trace
                                if (isTimeout) {
                                    log.warn("Tool timeout", { tool: name, input: sanitizeForLogs(input), iteration, timeoutMs: 10000 });
                                    telemetryLogger.warn("tool_timeout", { tool: name, input: String(sanitizeForLogs(input)), timeoutMs: 10000 });
                                    addToolResult(
                                        sessionId,
                                        toolCall.id,
                                        JSON.stringify({
                                            success: false,
                                            tool: name,
                                            error: {
                                                type: "timeout",
                                                message: "Tool execution timed out"
                                            }
                                        }),
                                        orchestratorDeps
                                    );
                                } else if (isValidationError) {
                                    log.warn("Tool validation failed", { tool: name, input: sanitizeForLogs(input) });
                                    telemetryLogger.warn("tool_validation_failed", { tool: name, input: String(sanitizeForLogs(input)) });
                                } else if (isRateLimitError) {
                                    log.warn("Tool rate limited", { tool: name, input: sanitizeForLogs(input), sessionId });
                                    telemetryLogger.warn("tool_rate_limited", { tool: name, sessionId });
                                } else {
                                    log.error(`Tool error (${name})`, { message: msg, stack: errStack, input: sanitizeForLogs(input) });
                                    telemetryLogger.error("tool_execution_error", { 
                                        tool: name, 
                                        input: String(sanitizeForLogs(input)), 
                                        error: msg, 
                                        stack: errStack 
                                    });
                                    addToolResult(
                                        sessionId,
                                        toolCall.id,
                                        JSON.stringify({
                                            success: false,
                                            tool: name,
                                            error: {
                                                type: "execution",
                                                message: msg
                                            }
                                        }),
                                        orchestratorDeps
                                    );
                                }
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

                if (!iterationProgressMade && response.toolCalls.length > 0) {
                    log.info("No progress made in iteration, breaking loop early");
                    break;
                }

                if (iteration >= 3 && !iterationProgressMade) {
                    log.info("No progress after 3 iterations, breaking loop early");
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
                        };
                    } else {
                        telemetryLogger.warn("agent max iterations", { session_id: sessionId });
                        recordAgentRun(false, "max_iterations");
                        return {
                            text:
                                `⚠️ Stopped due to iteration limit. The task may be incomplete.\n\n` +
                                `Here's what I had so far:\n\n${collectedText.join("\n").trim()}`,
                            toolCallCount: totalToolCalls,
                            hitLimit: true,
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

