import { Pipeline } from "./types.ts";
import type { PipelineContext } from "./types.ts";
import { InputValidatorStage } from "./inputValidator.ts";
import { ContextBuilderStage } from "./contextBuilder.ts";
import { ToolPickerStage } from "./toolPicker.ts";
import { MemoryWriterStage } from "./memoryWriter.ts";
import { addUserMessage, callClaude, addAssistantMessage, addToolResult } from "../llm/index.ts";
import { rateLimiter } from "../middleware/rate-limit.ts";
import { checkSessionDailyLimits } from "../usage.ts";
import { performance } from "perf_hooks";

export class Orchestrator {
    private pipeline = new Pipeline();

    constructor() {
        this.pipeline.addStage(new InputValidatorStage())
            .addStage(new ContextBuilderStage())
            .addStage(new ToolPickerStage());
    }

    async run(context: PipelineContext, message: string): Promise<{ text: string; toolCallCount: number; hitLimit: boolean; toolCalls: Array<{ name: string; input: Record<string, unknown>; result: string | undefined; success: boolean }> }> {
        const input = await this.pipeline.execute(context, { message });
        const orchestratorDeps = { db: context.db, config: context.config };
        
        addUserMessage(context.sessionId, message, orchestratorDeps);

        let iteration = 0;
        let totalToolCalls = 0;
        const collectedText: string[] = [];
        const toolExecutionHistory: Array<{ name: string; input: Record<string, unknown>; result: string | undefined; success: boolean }> = [];
        
        while (iteration < context.maxIterations) {
            iteration++;
            if (!checkSessionDailyLimits(context.sessionId).allowed || !rateLimiter.checkRateLimit(context.sessionId, "llm_api_call").allowed) {
                break;
            }

            const response = await callClaude(context.sessionId, input.toolDefs ?? [], { relevantMemories: input.memories ?? [] }, orchestratorDeps, undefined);
            if (response.text) collectedText.push(response.text);
            addAssistantMessage(context.sessionId, response.text, orchestratorDeps, response.toolCalls.length > 0 ? response.toolCalls : undefined, response.thought, response.thoughtSignature);

            if (response.toolCalls.length === 0) break;

            const parallelBatch = response.toolCalls.slice(0, context.maxTotalToolCalls - totalToolCalls);
            const results = await Promise.allSettled(parallelBatch.map(async (toolCall) => {
                totalToolCalls++;
                let parsedInput = {};
                try { parsedInput = JSON.parse(toolCall.function.arguments || "{}"); } catch {}
                
                const execResult = await context.executor.execute({
                    toolName: toolCall.function.name,
                    input: parsedInput,
                    context: { sessionId: context.sessionId, userId: context.userId, platform: context.platform, source: 'agent' }
                });
                
                return { toolCall, execResult, parsedInput };
            }));
            
            for (const result of results) {
                if (result.status === "fulfilled") {
                    const { toolCall, execResult, parsedInput } = result.value;
                    addToolResult(context.sessionId, toolCall.id, JSON.stringify(execResult.success ? { success: true, data: execResult.result } : { success: false, error: execResult.error }), orchestratorDeps, toolCall.function.name);
                    toolExecutionHistory.push({ name: toolCall.function.name, input: parsedInput, result: (execResult.result ?? execResult.error?.message) as string | undefined, success: execResult.success });
                }
            }
        }
        
        await new MemoryWriterStage().execute(context, { message: "" });
        return { text: collectedText.join("\n") || "(no response)", toolCallCount: totalToolCalls, hitLimit: iteration >= context.maxIterations, toolCalls: toolExecutionHistory };
    }
}
