import type { ChatCompletionTool } from "openai/resources/chat/completions.js";

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

export interface ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  getOpenAIDefinitions(): ChatCompletionTool[];
}
