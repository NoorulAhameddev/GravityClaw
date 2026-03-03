import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions.js";
import type { LLMProvider, LLMResponse, LLMChatOptions } from "../types/llm.js";
import { createLogger } from "../logger.ts";

const log = createLogger("llm:deepseek");

/**
 * DeepSeek Provider
 * Chinese LLM with strong coding capabilities, OpenAI-compatible API
 */
export class DeepSeekProvider implements LLMProvider {
  readonly name = "deepseek";
  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel: string = "deepseek-chat") {
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://api.deepseek.com/v1",
    });
    this.defaultModel = defaultModel;
    log.info(`DeepSeek provider initialized with model: ${defaultModel}`);
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    options?: LLMChatOptions
  ): Promise<LLMResponse> {
    const model = options?.model ?? this.defaultModel;
    const maxTokens = options?.maxTokens ?? 2000;
    const hasTools = toolDefinitions.length > 0;

    log.debug(`Calling DeepSeek — model: ${model}, messages: ${messages.length}, tools: ${toolDefinitions.length}`);

    const params = hasTools
      ? { model, max_tokens: maxTokens, tools: toolDefinitions, tool_choice: "auto" as const, messages }
      : { model, max_tokens: maxTokens, messages };

    const response = await this.client.chat.completions.create(params);
    const choice = response.choices[0];
    if (!choice) throw new Error("DeepSeek returned no choices");

    const msg = choice.message;
    const text = msg.content ?? "";
    const toolCalls = msg.tool_calls ?? [];

    log.debug(
      `DeepSeek response — stop: ${choice.finish_reason}, text: ${text.length} chars, tools: ${toolCalls.length}`
    );

    const result: LLMResponse = {
      stopReason: choice.finish_reason ?? "stop",
      text,
      toolCalls,
    };

    if (response.usage) {
      result.usage = {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      };
    }

    return result;
  }
}
