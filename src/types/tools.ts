import type { ChatCompletionTool } from "openai/resources/chat/completions.js";

export type QueuePolicy = "inline-only" | "background-capable" | "background-preferred";

export interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
  execute(input: Record<string, unknown>): Promise<string>;
  requiresApproval?: boolean;
  queueEligible?: boolean;
  queuePolicy?: QueuePolicy;
  retryable?: boolean;
  maxRetries?: number;
}

export interface ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  getAll(): Tool[];
  getOpenAIDefinitions(): ChatCompletionTool[];
  requiresApproval(name: string): boolean;
}
