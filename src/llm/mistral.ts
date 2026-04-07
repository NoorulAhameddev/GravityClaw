import { Mistral } from "@mistralai/mistralai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions.js";
import type { LLMProvider, LLMResponse, LLMChatOptions } from "../types/llm.js";
import { createLogger } from "../logger.ts";

const log = createLogger("llm:mistral");

function getMessageContent(content: string | unknown): string {
  if (typeof content === "string") return content;
  return "";
}

export class MistralProvider implements LLMProvider {
  readonly name = "mistral";
  private client: Mistral;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel: string = "mistral-large-latest") {
    this.client = new Mistral({ apiKey });
    this.defaultModel = defaultModel;
    log.info(`Mistral provider initialized with model: ${defaultModel}`);
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    options?: LLMChatOptions
  ): Promise<LLMResponse> {
    const model = options?.model ?? this.defaultModel;
    const maxTokens = options?.maxTokens ?? 2000;
    const hasTools = toolDefinitions.length > 0;

    log.debug(`Calling Mistral — model: ${model}, messages: ${messages.length}, tools: ${toolDefinitions.length}`);

    const mistralMessages = messages.map((msg) => {
      if (msg.role === "system") {
        return { role: "user" as const, content: getMessageContent(msg.content) };
      }
      const content = getMessageContent(msg.content);
      if (msg.role === "assistant" && "tool_calls" in msg && msg.tool_calls) {
        return {
          role: msg.role,
          content,
          toolCalls: msg.tool_calls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.function.name,
              arguments: typeof tc.function.arguments === "string"
                ? tc.function.arguments
                : JSON.stringify(tc.function.arguments),
            },
          })),
        };
      }
      return { role: msg.role as "user" | "assistant", content };
    });

    const params = {
      model,
      messages: mistralMessages,
      maxTokens,
      temperature: options?.temperature,
      topP: options?.topP,
      tools: hasTools ? toolDefinitions.map((tool) => ({
        type: "function" as const,
        function: {
          name: tool.function.name,
          description: tool.function.description || "",
          parameters: tool.function.parameters ?? {},
        },
      })) : undefined,
    };

    const response = await this.client.chat.complete(params);
    const choice = response.choices?.[0];
    if (!choice) throw new Error("Mistral returned no choices");

    const msg = choice.message;
    const text = getMessageContent(msg.content);
    const toolCalls = msg.toolCalls ?? [];

    log.debug(
      `Mistral response — stop: ${choice.finishReason}, text: ${text.length} chars, tools: ${toolCalls.length}`
    );

    const result: LLMResponse = {
      stopReason: choice.finishReason ?? "stop",
      text,
      toolCalls: toolCalls.map((tc) => ({
        id: tc.id || `tool_${Date.now()}`,
        type: "function" as const,
        function: {
          name: tc.function?.name || "",
          arguments: typeof tc.function?.arguments === "string"
            ? tc.function.arguments
            : JSON.stringify(tc.function?.arguments || {}),
        },
      })),
    };

    if (response.usage) {
      result.usage = {
        promptTokens: response.usage.promptTokens || 0,
        completionTokens: response.usage.completionTokens || 0,
        totalTokens: response.usage.totalTokens || 0,
      };
    }

    return result;
  }

  async listModels(): Promise<string[]> {
    try {
      const models = await this.client.models.list();
      return (models.data ?? []).map((model) => model.id);
    } catch (err) {
      log.error("Error fetching Mistral models", err);
      return [];
    }
  }
}
