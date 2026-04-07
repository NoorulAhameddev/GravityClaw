import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions.js";
import type { LLMProvider, LLMResponse, LLMChatOptions } from "../types/llm.js";
import { createLogger } from "../logger.ts";

const log = createLogger("llm:nvidia");

/**
 * NVIDIA Provider
 * Uses NVIDIA's NGC API endpoint which is OpenAI-compatible
 */
export class NvidiaProvider implements LLMProvider {
  readonly name = "nvidia";
  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel: string = "nvidia/llama-3.1-nemotron-70b-instruct") {
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://integrate.api.nvidia.com/v1",
    });
    this.defaultModel = defaultModel;
    log.info(`NVIDIA provider initialized with model: ${defaultModel}`);
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    options?: LLMChatOptions
  ): Promise<LLMResponse> {
    const model = options?.model ?? this.defaultModel;
    const maxTokens = options?.maxTokens ?? 2000;
    const hasTools = toolDefinitions.length > 0;

    log.debug(`Calling NVIDIA — model: ${model}, messages: ${messages.length}, tools: ${toolDefinitions.length}`);

    const params: any = hasTools
      ? { model, max_tokens: maxTokens, tools: toolDefinitions, tool_choice: "auto", messages }
      : { model, max_tokens: maxTokens, messages };

    // Add temperature/top_p if provided
    if (options?.temperature !== undefined) {
      params.temperature = options.temperature;
    }
    if (options?.topP !== undefined) {
      params.top_p = options.topP;
    }

    try {
      const response = await this.client.chat.completions.create(params);
      const choice = response.choices[0];
      if (!choice) throw new Error("NVIDIA returned no choices");

      const msg = choice.message;
      const text = msg.content ?? "";
      const toolCalls = msg.tool_calls ?? [];

      log.debug(
        `NVIDIA response — stop: ${choice.finish_reason}, text: ${text.length} chars, tools: ${toolCalls.length}`
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`NVIDIA API error: ${message}`);
      throw err;
    }
  }

  async listModels(): Promise<string[]> {
    // NVIDIA doesn't have a simple models list endpoint, return known models
    return [
      "nvidia/llama-3.1-nemotron-70b-instruct",
      "nvidia/llama-3.1-nemotron-51b-instruct",
      "nvidia/llama-3.1-nemotron-8b-instruct",
      "nvidia/llama-3.3-70b-instruct",
      "nvidia/mixtral-8x7b-instruct",
    ];
  }

  countTokens(messages: ChatCompletionMessageParam[]): number {
    // Rough estimate: ~4 characters per token
    const totalChars = messages.reduce((sum, m) => {
      const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      return sum + content.length;
    }, 0);
    return Math.ceil(totalChars / 4);
  }
}
