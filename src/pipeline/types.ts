import { config as appConfig } from "../config.ts";
import { registry as toolRegistry } from "../tools/index.ts";
import { ToolExecutor } from "../tools/executor.ts";
import { db } from "../db.ts";
import type { RetrievedMemory } from "../memory/retrieval.ts";

export interface PipelineStage<I, O> {
    name: string;
    execute(context: PipelineContext, input: I): Promise<O>;
}

export interface PipelineData {
    message: string;
    memories?: RetrievedMemory[];
    toolDefs?: import("openai").OpenAI.ChatCompletionTool[];
}

export interface PipelineContext {
    sessionId: string;
    userId?: string | undefined;
    platform?: string | undefined;
    groupId?: string | undefined;
    isGroup?: boolean | undefined;
    config: typeof appConfig;
    db: typeof db;
    registry: typeof toolRegistry;
    executor: ToolExecutor;
    metrics: Record<string, unknown>;
    logger: Record<string, unknown>;
    depth: number;
    maxIterations: number;
    parentToolCallCount: number;
    maxTotalToolCalls: number;
    requestId?: string | undefined;
    requestConfirmation?: ((command: string) => Promise<boolean>) | undefined;
    onProgress?: ((text: string) => Promise<void>) | undefined;
}

export class Pipeline {
    private stages: PipelineStage<PipelineData, PipelineData>[] = [];
    
    addStage(stage: PipelineStage<PipelineData, PipelineData>): this {
        this.stages.push(stage);
        return this;
    }
    
    async execute(context: PipelineContext, input: PipelineData): Promise<PipelineData> {
        let currentInput = input;
        for (const stage of this.stages) {
            const start = Date.now();
            try {
                currentInput = await stage.execute(context, currentInput);
            } catch (error) {
                throw error;
            }
        }
        return currentInput;
    }
}
