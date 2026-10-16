import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions.js';
import type { LLMProvider, LLMResponse, LLMChatOptions, Message, StreamCallback } from '../types/llm.js';
import { createLogger } from '../logger.ts';
import { extractThinking } from './base.ts';

const log = createLogger('llm:deepseek');

/**
 * DeepSeek Provider
 * Chinese LLM with strong coding capabilities, OpenAI-compatible API
 */
export class DeepSeekProvider implements LLMProvider {
  readonly name = 'deepseek';
  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel: string = 'deepseek-chat') {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com/v1',
      timeout: 120000,
    });
    this.defaultModel = defaultModel;
    log.info(`DeepSeek provider initialized with model: ${defaultModel}`);
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
      `Calling DeepSeek — model: ${model}, messages: ${messages.length}, tools: ${toolDefinitions.length}`,
    );

    const mappedMessages = messages.map((msg) => {
      if (msg.role === 'assistant') {
        const assistantMsg = msg as Message & { reasoning_content?: string };
        if (assistantMsg.thought && !assistantMsg.reasoning_content) {
          const { thought, ...rest } = assistantMsg;
          return {
            ...rest,
            reasoning_content: thought,
          };
        }
      }
      return msg;
    });

    const params = hasTools
      ? {
          model,
          max_tokens: maxTokens,
          tools: toolDefinitions,
          tool_choice: 'auto' as const,
          messages: mappedMessages as ChatCompletionMessageParam[],
        }
      : { model, max_tokens: maxTokens, messages: mappedMessages as ChatCompletionMessageParam[] };

    const response = await this.client.chat.completions.create(params, {
      signal: AbortSignal.timeout(120000),
    });
    const choice = response.choices[0];
    if (!choice) throw new Error('DeepSeek returned no choices');

    const msg = choice.message;
    const text = msg.content ?? '';
    const toolCalls = msg.tool_calls ?? [];
    const thought = (msg as unknown as Record<string, unknown>).reasoning_content as
      string | undefined;

    log.debug(
      `DeepSeek response — stop: ${choice.finish_reason}, text: ${text.length} chars, tools: ${toolCalls.length}`,
    );

    const result: LLMResponse = {
      stopReason: choice.finish_reason ?? 'stop',
      text,
      toolCalls,
    };

    if (typeof thought === 'string' && thought) {
      result.thought = thought;
    }

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
      `Streaming DeepSeek — model: ${model}, messages: ${messages.length}, tools: ${toolDefinitions.length}`,
    );

    const mappedMessages = messages.map((msg) => {
      if (msg.role === 'assistant') {
        const assistantMsg = msg as Message & { reasoning_content?: string };
        if (assistantMsg.thought && !assistantMsg.reasoning_content) {
          const { thought, ...rest } = assistantMsg;
          return {
            ...rest,
            reasoning_content: thought,
          };
        }
      }
      return msg;
    });

    const params = hasTools
      ? {
          model,
          max_tokens: maxTokens,
          tools: toolDefinitions,
          tool_choice: 'auto' as const,
          messages: mappedMessages as ChatCompletionMessageParam[],
          stream: true as const,
        }
      : {
          model,
          max_tokens: maxTokens,
          messages: mappedMessages as ChatCompletionMessageParam[],
          stream: true as const,
        };

    const stream = await this.client.chat.completions.create(params, {
      signal: AbortSignal.timeout(120000),
    });

    const textParts: string[] = [];
    const thoughtParts: string[] = [];
    let stopReason = 'stop';
    const accumulatedToolCalls: Map<
      number,
      { id: string; type: 'function'; function: { name: string; arguments: string } }
    > = new Map();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      const deltaRecord = delta as unknown as { reasoning_content?: string };
      if (deltaRecord.reasoning_content) {
        thoughtParts.push(deltaRecord.reasoning_content);
      }

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
    const rawThought = thoughtParts.length > 0 ? thoughtParts.join('') : undefined;
    const { text, thought } = extractThinking(rawText, rawThought);
    const toolCalls = Array.from(accumulatedToolCalls.values());

    log.debug(
      `DeepSeek stream complete — stop: ${stopReason}, text: ${text.length} chars, tools: ${toolCalls.length}`,
    );

    return {
      stopReason,
      text,
      toolCalls,
      ...(thought ? { thought } : {}),
    };
  }

  destroy(): void {
    this.client = null as unknown as OpenAI;
  }
}
