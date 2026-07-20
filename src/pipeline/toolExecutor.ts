import type { PipelineStage, PipelineContext, PipelineData } from "./types.ts";
export class ToolExecutionStage implements PipelineStage<PipelineData, PipelineData> {
    name = "ToolExecution";
    async execute(context: PipelineContext, input: PipelineData): Promise<PipelineData> {
        return input;
    }
}
