import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions.js";
import type OpenAI from "openai";

export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface Message {
    role: MessageRole;
    content: string | Array<{
        type: "text" | "tool_use" | "tool_result" | "image" | "document";
        id?: string;
        name?: string;
        text?: string;
        content?: string;
        is_error?: boolean;
        source?: {
            type: string;
            id: string;
        };
    }>;
    name?: string;
    tool_calls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
}

export interface LLMResponse {
  stopReason: string;
  text: string;
  toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMProvider {
  readonly name: string;
  chat(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    options?: LLMChatOptions
  ): Promise<LLMResponse>;
  listModels?(): Promise<string[]>;
  countTokens?(messages: ChatCompletionMessageParam[]): number;
}

export interface LLMChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
  [key: string]: unknown;
}
