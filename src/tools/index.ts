import type { ChatCompletionTool } from "openai/resources/chat/completions.js";

/**
 * Every tool Gravity Claw can use implements this interface.
 * Input schema follows JSON Schema (OpenAI tool format).
 */
export interface Tool {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties?: Record<string, unknown>;
        required?: string[];
    };
    execute(input: Record<string, unknown>): Promise<string>;
}

class ToolRegistry {
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
