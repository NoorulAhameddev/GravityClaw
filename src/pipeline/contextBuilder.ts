import type { PipelineStage, PipelineContext, PipelineData } from "./types.ts";
import { retrieveRelevantMemories } from "../memory/retrieval.ts";
export class ContextBuilderStage implements PipelineStage<PipelineData, PipelineData> {
    name = "ContextBuilder";
    async execute(context: PipelineContext, input: PipelineData): Promise<PipelineData> {
        const memories = await retrieveRelevantMemories(context.sessionId, input.message, { limit: 8, maxChars: 1800 });
        return { ...input, memories };
    }
}
