import { config } from "./config.ts";
import { createLogger } from "./logger.ts";
import { registry } from "./tools/index.ts";
import {
    callClaude,
    addUserMessage,
    addAssistantMessage,
    addToolResult,
} from "./llm/index.ts";

const log = createLogger("agent");

export interface AgentRunOptions {
    message: string;
    sessionId: string;
    requestConfirmation?: (command: string) => Promise<boolean>;
    onProgress?: (text: string) => Promise<void>;
    userId?: string;
    platform?: string;
    groupId?: string;
    isGroup?: boolean;
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
    const { message, sessionId, requestConfirmation, onProgress } = options;
    const maxIterations = config.AGENT_MAX_ITERATIONS;
    const toolDefs = registry.getOpenAIDefinitions();

    log.info(`Agent run start — message length: ${message.length} chars (session: ${sessionId})`);

    addUserMessage(sessionId, message);

    let iteration = 0;
    let totalToolCalls = 0;
    const collectedText: string[] = [];

    while (iteration < maxIterations) {
        iteration++;
        log.debug(`Iteration ${iteration}/${maxIterations}`);

        const response = await callClaude(sessionId, toolDefs);

        // Collect any text from this turn
        if (response.text) {
            collectedText.push(response.text);
            if (onProgress) {
                await onProgress(response.text);
            }
        }

        // Add assistant turn to history (include tool_calls if present)
        addAssistantMessage(sessionId, response.text, response.toolCalls.length > 0 ? response.toolCalls : undefined);

        // No tool calls → we're done
        if (response.toolCalls.length === 0) {
            log.info(`Agent done — ${totalToolCalls} tool calls, ${iteration} iterations`);
            return {
                text: collectedText.join("\n").trim() || "(no response)",
                toolCallCount: totalToolCalls,
                hitLimit: false,
            };
        }

        // Execute each tool call
        for (const toolCall of response.toolCalls) {
            totalToolCalls++;
            const name = toolCall.function.name;
            log.info(`Tool call: ${name}`);

            const tool = registry.get(name);

            if (!tool) {
                log.warn(`Unknown tool: ${name}`);
                addToolResult(sessionId, toolCall.id, `Error: tool "${name}" not found.`);
                continue;
            }

            // Parse the JSON args from the model
            let input: Record<string, unknown> = {};
            try {
                input = JSON.parse(toolCall.function.arguments || "{}") as Record<string, unknown>;
            } catch {
                addToolResult(sessionId, toolCall.id, "Error: could not parse tool arguments as JSON.");
                continue;
            }

            // Confirmation gate for dangerous shell commands
            if (name === "run_shell" && requestConfirmation) {
                const command = String(input["command"] ?? "");
                const { isDangerous } = await import("./tools/shell.ts");
                if (isDangerous(command)) {
                    log.warn(`Dangerous command, requesting confirmation: ${command}`);
                    const confirmed = await requestConfirmation(command);
                    if (!confirmed) {
                        addToolResult(sessionId, toolCall.id, "User declined to run this command.");
                        continue;
                    }
                }
            }

            try {
                const result = await tool.execute({
                    ...input,
                    __sessionId: sessionId,
                    __userId: options.userId,
                    __platform: options.platform,
                    __groupId: options.groupId,
                    __isGroup: options.isGroup,
                });
                log.debug(`Tool result (${name}): ${result.substring(0, 80)}…`);
                addToolResult(sessionId, toolCall.id, result);
            } catch (err) {
                const msg = err instanceof Error ? err.message : "unknown error";
                log.error(`Tool error (${name})`, err);
                addToolResult(sessionId, toolCall.id, `Error executing tool: ${msg}`);
            }
        }
    }

    // Safety limit reached
    log.warn(`Agent hit max iterations (${maxIterations})`);
    return {
        text:
            `⚠️ I reached the max tool-call limit (${maxIterations} iterations). ` +
            `Here's what I had so far:\n\n${collectedText.join("\n").trim()}`,
        toolCallCount: totalToolCalls,
        hitLimit: true,
    };
}

