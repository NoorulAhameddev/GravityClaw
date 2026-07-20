import { CohereClient } from "cohere-ai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions.js";
import type { LLMProvider, LLMResponse, LLMChatOptions } from "../types/llm.js";
import { createLogger } from "../logger.ts";

const log = createLogger("llm:cohere");

type CohereMessageRole = "USER" | "CHATBOT" | "SYSTEM" | "TOOL";

interface CohereMessage {
  role: CohereMessageRole;
  message: string;
}

export class CohereProvider implements LLMProvider {
  readonly name = "cohere";
  private client: CohereClient;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel: string = "command-r-plus") {
    this.client = new CohereClient({ token: apiKey });
    this.defaultModel = defaultModel;
    log.info(`Cohere provider initialized with model: ${defaultModel}`);
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    options?: LLMChatOptions
  ): Promise<LLMResponse> {
    const model = options?.model ?? this.defaultModel;
    const hasTools = toolDefinitions.length > 0;

    log.debug(`Calling Cohere — model: ${model}, messages: ${messages.length}, tools: ${toolDefinitions.length}`);

    const cohereHistory: CohereMessage[] = [];
    let currentMessage = "";

    for (const msg of messages) {
      const content = typeof msg.content === "string" ? msg.content : "";
      if (msg.role === "system") {
        cohereHistory.push({ role: "SYSTEM", message: content });
      } else if (msg.role === "user") {
        currentMessage = content;
      } else if (msg.role === "assistant") {
        cohereHistory.push({ role: "CHATBOT", message: content });
      } else if (msg.role === "tool") {
        cohereHistory.push({ role: "TOOL", message: content });
      }
    }

    if (!currentMessage && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && typeof lastMsg.content === "string") {
        currentMessage = lastMsg.content;
      }
    }

    const request: {
      model: string;
      message: string;
      chatHistory?: CohereMessage[];
      temperature?: number;
      tools?: { name: string; description: string; parameterDefinitions: Record<string, { type: string; description?: string; required?: boolean }> }[];
    } = {
      model,
      message: currentMessage,
    };

    if (cohereHistory.length > 0) {
      request.chatHistory = cohereHistory;
    }

    if (options?.temperature !== undefined) {
      request.temperature = options.temperature;
    }

    if (hasTools) {
      request.tools = toolDefinitions.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description || "",
        parameterDefinitions: tool.function.parameters as Record<string, { type: string; description?: string; required?: boolean }>,
      }));
    }

    const response = await this.client.chat(request);

    const text = response.text || "";
    const toolCalls = response.toolCalls || [];

    log.debug(
      `Cohere response — text: ${text.length} chars, tools: ${toolCalls.length}`
    );

    const result: LLMResponse = {
      stopReason: response.finishReason || "stop",
      text,
      toolCalls: toolCalls.map((tc) => ({
        id: `tool_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        type: "function" as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.parameters || {}),
        },
      })),
    };

    if (response.meta?.tokens) {
      result.usage = {
        promptTokens: response.meta.tokens.inputTokens || 0,
        completionTokens: response.meta.tokens.outputTokens || 0,
        totalTokens: (response.meta.tokens.inputTokens || 0) + (response.meta.tokens.outputTokens || 0),
      };
    }

    return result;
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await this.client.models.list();
      return response.models.map((model) => model.name).filter((name): name is string => name !== undefined);
    } catch (err) {
      log.error("Error fetching Cohere models", err);
      return [];
    }
  }

  destroy(): void {
    this.client = null as unknown as CohereClient;
  }
}
