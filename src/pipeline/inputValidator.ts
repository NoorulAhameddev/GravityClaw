import type { PipelineStage, PipelineContext, PipelineData } from "./types.ts";
export class InputValidatorStage implements PipelineStage<PipelineData, PipelineData> {
    name = "InputValidator";
    async execute(context: PipelineContext, input: PipelineData): Promise<PipelineData> {
        return input;
    }
}
