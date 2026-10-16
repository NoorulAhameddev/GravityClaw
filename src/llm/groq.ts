import Groq from 'groq-sdk';
import type { ChatCompletionCreateParamsNonStreaming } from 'groq-sdk/resources/chat/completions.js';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions.js';
import type { LLMProvider, LLMResponse, LLMChatOptions, StreamCallback } from '../types/llm.js';
import { createLogger } from '../logger.ts';
import { extractThinking } from './base.ts';

const log = createLogger('llm:groq');

/**
 * Groq Provider
 * Ultra-fast inference for open models (Llama, Mixtral, Gemma)
 */
export class GroqProvider implements LLMProvider {
  readonly name = 'groq';
  private client: Groq;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel: string = 'llama-3.3-70b-versatile') {
    this.client = new Groq({ apiKey, timeout: 120000 });
    this.defaultModel = defaultModel;
    log.info(`Groq provider initialized with model: ${defaultModel}`);
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    options?: LLMChatOptions,
  ): Promise<LLMResponse> {
    const model = options?.model ?? this.defaultModel;
    const maxTokens = options?.maxTokens ?? 2000;
    const hasTools = toolDefinitions.length > 0;

    log.debug(
      `Calling Groq — model: ${model}, messages: ${messages.length}, tools: ${toolDefinitions.length}`,
    );

    const params: ChatCompletionCreateParamsNonStreaming = {
      model,
      messages: messages as unknown as Array<
        import('groq-sdk/resources/chat/completions.js').ChatCompletionMessageParam
      >,
      max_tokens: maxTokens,
    };
    if (options?.temperature !== undefined) params.temperature = options.temperature;
    if (options?.topP !== undefined) params.top_p = options.topP;

    if (hasTools) {
      params.tools = toolDefinitions as unknown as Array<
        import('groq-sdk/resources/chat/completions.js').ChatCompletionTool
      > | null;
      params.tool_choice = 'auto';
    }

    const response = await this.client.chat.completions.create(params, {
      signal: AbortSignal.timeout(120000),
    });
    const choice = response.choices[0];
    if (!choice) throw new Error('Groq returned no choices');

    const msg = choice.message;
    const text = msg.content ?? '';
    const toolCalls = msg.tool_calls ?? [];

    log.debug(
      `Groq response — stop: ${choice.finish_reason}, text: ${text.length} chars, tools: ${toolCalls.length}`,
    );

    const result: LLMResponse = {
      stopReason: choice.finish_reason ?? 'stop',
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
    options?: LLMChatOptions & { onToken?: StreamCallback },
  ): Promise<LLMResponse> {
    const model = options?.model ?? this.defaultModel;
    const maxTokens = options?.maxTokens ?? 2000;
    const hasTools = toolDefinitions.length > 0;
    const onToken = options?.onToken;

    log.debug(
      `Streaming Groq — model: ${model}, messages: ${messages.length}, tools: ${toolDefinitions.length}`,
    );

    const params: any = {
      model,
      messages: messages as any,
      max_tokens: maxTokens,
      stream: true,
    };
    if (options?.temperature !== undefined) params.temperature = options.temperature;
    if (options?.topP !== undefined) params.top_p = options.topP;

    if (hasTools) {
      params.tools = toolDefinitions as any;
      params.tool_choice = 'auto';
    }

    const stream = await this.client.chat.completions.create(params, {
      signal: AbortSignal.timeout(120000),
    });

    const textParts: string[] = [];
    let stopReason = 'stop';
    const accumulatedToolCalls: Map<
      number,
      { id: string; type: 'function'; function: { name: string; arguments: string } }
    > = new Map();

    for await (const chunk of stream as any) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        textParts.push(delta.content);
        onToken?.(delta.content, false);
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const index = tc.index ?? 0;
          if (!accumulatedToolCalls.has(index)) {
            accumulatedToolCalls.set(index, {
              id: tc.id ?? `stream-call-${index}`,
              type: 'function',
              function: { name: '', arguments: '' },
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

    onToken?.('', true);

    const rawText = textParts.join('');
    const { text, thought } = extractThinking(rawText);
    const toolCalls = Array.from(accumulatedToolCalls.values());

    log.debug(
      `Groq stream complete — stop: ${stopReason}, text: ${text.length} chars, tools: ${toolCalls.length}`,
    );

    return {
      stopReason,
      text,
      toolCalls,
      ...(thought ? { thought } : {}),
    };
  }

  async listModels(): Promise<string[]> {
    try {
      const models = await this.client.models.list();
      return models.data.map((model) => model.id);
    } catch (err) {
      log.error('Error fetching Groq models', err);
      return [];
    }
  }

  destroy(): void {
    this.client = null as unknown as Groq;
  }
}
