import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions.js";
import type { LLMProvider, LLMResponse, LLMChatOptions, StreamCallback } from "../types/llm.js";
import { createLogger } from "../logger.ts";

const log = createLogger("llm:openai");

/**
 * OpenAI Provider (Native)
 * Direct access to OpenAI's models (GPT-4, GPT-4 Turbo, etc.)
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel: string = "gpt-4o") {
    this.client = new OpenAI({ apiKey, timeout: 120000 });
    this.defaultModel = defaultModel;
    log.info(`OpenAI provider initialized with model: ${defaultModel}`);
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    options?: LLMChatOptions
  ): Promise<LLMResponse> {
    const model = options?.model ?? this.defaultModel;
    const maxTokens = options?.maxTokens ?? 2000;
    const hasTools = toolDefinitions.length > 0;

    log.debug(`Calling OpenAI — model: ${model}, messages: ${messages.length}, tools: ${toolDefinitions.length}`);

    const params = hasTools
      ? { model, max_tokens: maxTokens, tools: toolDefinitions, tool_choice: "auto" as const, messages }
      : { model, max_tokens: maxTokens, messages };

    const response = await this.client.chat.completions.create(params, { signal: AbortSignal.timeout(120000) });
    const choice = response.choices[0];
    if (!choice) throw new Error("OpenAI returned no choices");

    const msg = choice.message;
    const text = msg.content ?? "";
    const toolCalls = msg.tool_calls ?? [];

    log.debug(
      `OpenAI response — stop: ${choice.finish_reason}, text: ${text.length} chars, tools: ${toolCalls.length}`
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

  async chatStream(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    options?: LLMChatOptions & { onToken?: StreamCallback }
  ): Promise<LLMResponse> {
    const model = options?.model ?? this.defaultModel;
    const maxTokens = options?.maxTokens ?? 2000;
    const hasTools = toolDefinitions.length > 0;
    const onToken = options?.onToken;

    log.debug(`Streaming OpenAI — model: ${model}, messages: ${messages.length}, tools: ${toolDefinitions.length}`);

    const params = hasTools
      ? { model, max_tokens: maxTokens, tools: toolDefinitions, tool_choice: "auto" as const, messages, stream: true as const }
      : { model, max_tokens: maxTokens, messages, stream: true as const };

    const stream = await this.client.chat.completions.create(params, { signal: AbortSignal.timeout(120000) });

    const textParts: string[] = [];
    let stopReason = "stop";
    const accumulatedToolCalls: Map<number, { id: string; type: "function"; function: { name: string; arguments: string } }> = new Map();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        textParts.push(delta.content);
        onToken?.(delta.content, false);
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const index = tc.index;
          if (!accumulatedToolCalls.has(index)) {
            accumulatedToolCalls.set(index, {
              id: tc.id ?? `stream-call-${index}`,
              type: "function",
              function: { name: "", arguments: "" },
            });
          }
          const existing = accumulatedToolCalls.get(index)!;
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.function.name += tc.function.name;
          if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
        }
      }

      if (chunk.choices[0]?.finish_reason) {
        stopReason = chunk.choices[0].finish_reason;
      }
    }

    onToken?.("", true);

    const text = textParts.join("");
    const toolCalls = Array.from(accumulatedToolCalls.values());

    log.debug(`Streaming complete — stop: ${stopReason}, text: ${text.length} chars, tools: ${toolCalls.length}`);

    const result: LLMResponse = {
      stopReason,
      text,
      toolCalls,
    };

    return result;
  }

  async listModels(): Promise<string[]> {
    try {
      const models = await this.client.models.list();
      return models.data.map((model) => model.id);
    } catch (err) {
      log.error("Error fetching OpenAI models", err);
      return [];
    }
  }

  destroy(): void {
    this.client = null as unknown as OpenAI;
  }
}
