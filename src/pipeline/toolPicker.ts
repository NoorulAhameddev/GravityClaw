import type { PipelineStage, PipelineContext, PipelineData } from "./types.ts";
export class ToolPickerStage implements PipelineStage<PipelineData, PipelineData> {
    name = "ToolPicker";
    async execute(context: PipelineContext, input: PipelineData): Promise<PipelineData> {
        const relevantTools = context.registry.getRelevantTools(input.message);
        const toolDefs = context.registry.getOpenAIDefinitionsForTools(relevantTools);
        return { ...input, toolDefs };
    }
}
