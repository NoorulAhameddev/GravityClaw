import type { ChatCompletionTool } from "openai/resources/chat/completions.js";
import type { Tool, ToolRegistry as ToolRegistryType } from "../types/tools.js";

export type { Tool, ToolRegistry } from "../types/tools.js";
import {
    adminTools,
    communicationTools,
    spawnAgentTool,
    aggregateResultsTool,
} from "./core/index.ts";
import {
    voiceTools,
    ttsTools,
    elevenLabsTools,
    voiceSettingsTools,
    wakeWordTools,
    talkModeTools,
} from "./voice/index.ts";
import {
    memoryTools,
    saveFactTool,
    recallFactsTool,
    saveEntityTool,
    saveRelationshipTool,
    queryGraphTool,
    searchMemorySemanticTool,
    searchTools,
} from "./memory/index.ts";
import { datetimeTool, shellTool, searchAttachmentsTool, fileOperationTools } from "./system/index.ts";
import { dashboardTools } from "./ui/index.ts";
import { browserTools } from "./automation/index.ts";

class ToolRegistry implements ToolRegistryType {
    private readonly tools = new Map<string, Tool>();

    register(tool: Tool): void {
        this.tools.set(tool.name, tool);
    }

    get(name: string): Tool | undefined {
        return this.tools.get(name);
    }

    /** Returns tool definitions in OpenAI / OpenRouter format */
    getOpenAIDefinitions(): ChatCompletionTool[] {
        return [...this.tools.values()].map((t) => ({
            type: "function" as const,
            function: {
                name: t.name,
                description: t.description,
                parameters: t.inputSchema,
            },
        }));
    }
}

export const registry = new ToolRegistry();

export function registerBuiltInTools(): void {
    registry.register(datetimeTool);
    registry.register(shellTool);
    registry.register(saveFactTool);
    registry.register(recallFactsTool);
    registry.register(saveEntityTool);
    registry.register(saveRelationshipTool);
    registry.register(queryGraphTool);
    registry.register(searchAttachmentsTool);
    registry.register(searchMemorySemanticTool);

    voiceTools.forEach(tool => registry.register(tool));
    ttsTools.forEach(tool => registry.register(tool));
    elevenLabsTools.forEach(tool => registry.register(tool));
    voiceSettingsTools.forEach(tool => registry.register(tool));
    wakeWordTools.forEach(tool => registry.register(tool));
    talkModeTools.forEach(tool => registry.register(tool));
    fileOperationTools.forEach(tool => registry.register(tool));
    searchTools.forEach(tool => registry.register(tool));
    browserTools.forEach(tool => registry.register(tool));
    communicationTools.forEach(tool => registry.register(tool));
    dashboardTools.forEach(tool => registry.register(tool));
    memoryTools.forEach(tool => registry.register(tool));
    adminTools.forEach(tool => registry.register(tool));

    registry.register(spawnAgentTool);
    registry.register(aggregateResultsTool);
}
