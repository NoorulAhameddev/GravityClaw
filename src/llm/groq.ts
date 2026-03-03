import Groq from "groq-sdk";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions.js";
import type { LLMProvider, LLMResponse, LLMChatOptions } from "./base.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("llm:groq");

/**
 * Groq Provider
 * Ultra-fast inference for open models (Llama, Mixtral, Gemma)
 */
export class GroqProvider implements LLMProvider {
  readonly name = "groq";
  private client: Groq;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel: string = "llama-3.3-70b-versatile") {
    this.client = new Groq({ apiKey });
    this.defaultModel = defaultModel;
    log.info(`Groq provider initialized with model: ${defaultModel}`);
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    options?: LLMChatOptions
  ): Promise<LLMResponse> {
    const model = options?.model ?? this.defaultModel;
    const maxTokens = options?.maxTokens ?? 2000;
    const hasTools = toolDefinitions.length > 0;

    log.debug(`Calling Groq — model: ${model}, messages: ${messages.length}, tools: ${toolDefinitions.length}`);

    const params: any = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature: options?.temperature,
      top_p: options?.topP,
    };

    if (hasTools) {
      params.tools = toolDefinitions;
      params.tool_choice = "auto";
    }

    const response = await this.client.chat.completions.create(params);
    const choice = response.choices[0];
    if (!choice) throw new Error("Groq returned no choices");

    const msg = choice.message;
    const text = msg.content ?? "";
    const toolCalls = msg.tool_calls ?? [];

    log.debug(
      `Groq response — stop: ${choice.finish_reason}, text: ${text.length} chars, tools: ${toolCalls.length}`
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

  async listModels(): Promise<string[]> {
    try {
      const models = await this.client.models.list();
      return models.data.map((model) => model.id);
    } catch (err) {
      log.error("Error fetching Groq models", err);
      return [];
    }
  }
}
