import type { PipelineStage, PipelineContext, PipelineData } from "./types.ts";
import { executeExtractMemories, incrementTurnCount } from "../memory/extractMemories.ts";
import { trackBackgroundTask } from "../lib/background.ts";
export class MemoryWriterStage implements PipelineStage<PipelineData, PipelineData> {
    name = "MemoryWriter";
    async execute(context: PipelineContext, input: PipelineData): Promise<PipelineData> {
        if (context.config.ENABLE_MEMORY_EXTRACTION) {
            incrementTurnCount();
            trackBackgroundTask("memory_extraction", context.sessionId, () => executeExtractMemories({ sessionId: context.sessionId }));
        }
        return input;
    }
}
