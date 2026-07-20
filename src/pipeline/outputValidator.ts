import type { PipelineStage, PipelineContext, PipelineData } from "./types.ts";
export class OutputValidatorStage implements PipelineStage<PipelineData, PipelineData> {
    name = "OutputValidator";
    async execute(context: PipelineContext, input: PipelineData): Promise<PipelineData> {
        return input;
    }
}
