import type { PipelineStage, PipelineContext, PipelineData } from "./types.ts";
export class LLMCallerStage implements PipelineStage<PipelineData, PipelineData> {
    name = "LLMCaller";
    async execute(context: PipelineContext, input: PipelineData): Promise<PipelineData> {
        return input;
    }
}
