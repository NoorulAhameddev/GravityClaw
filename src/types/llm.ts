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
    thought?: string;
    thoughtSignature?: string;
}

export interface LLMResponse {
  stopReason: string;
  text: string;
  toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
  thought?: string;
  thoughtSignature?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export type StreamCallback = (token: string, done: boolean) => void;

export interface LLMProvider {
  readonly name: string;
  chat(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    options?: LLMChatOptions
  ): Promise<LLMResponse>;
  chatStream?(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    options?: LLMChatOptions & { onToken?: (token: string, done: boolean) => void }
  ): Promise<LLMResponse>;
  listModels?(): Promise<string[]>;
  countTokens?(messages: ChatCompletionMessageParam[]): number;
  destroy?(): void;
}

export interface LLMChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
  [key: string]: unknown;
}
