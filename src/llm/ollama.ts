import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions.js';
import type OpenAI from 'openai';
import type { LLMProvider, LLMResponse, LLMChatOptions } from '../types/llm.js';
import { createLogger } from '../logger.ts';

const log = createLogger('llm:ollama');

/**
 * Ollama Provider
 * Local LLMs (Llama, Mistral, etc.) running via Ollama
 * Note: Ollama now supports function calling via the /api/chat tools parameter
 */
export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  private baseURL: string;
  private defaultModel: string;

  constructor(defaultModel: string = 'llama3.3:70b', baseURL: string = 'http://localhost:11434') {
    this.baseURL = baseURL;
    this.defaultModel = defaultModel;
    log.info(`Ollama provider initialized with model: ${defaultModel} at ${baseURL}`);
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    options?: LLMChatOptions,
  ): Promise<LLMResponse> {
    const model = options?.model ?? this.defaultModel;

    log.debug(
      `Calling Ollama — model: ${model}, messages: ${messages.length}, tools: ${toolDefinitions.length}`,
    );

    const sanitizedMessages: Array<Record<string, unknown>> = [];

    for (const msg of messages) {
      const raw = msg as unknown as Record<string, unknown>;

      if (msg.role === 'tool') {
        let toolContent = '';
        if (typeof msg.content === 'string') toolContent = msg.content;
        else if (Array.isArray(msg.content))
          toolContent = (msg.content as unknown[])
            .map((b) => {
              if (typeof b === 'string') return b;
              if (typeof b === 'object' && b !== null) {
                const bb = b as Record<string, unknown>;
                if (bb.type === 'text') return String(bb.text || '');
                return JSON.stringify(b);
              }
              return String(b);
            })
            .join('\n');
        else if (msg.content) toolContent = String(msg.content);

        if (!toolContent.trim()) continue;
        sanitizedMessages.push({
          role: 'tool',
          content: toolContent,
        });
        continue;
      }

      if (msg.role === 'assistant' && (raw.tool_calls || raw.toolCalls)) {
        const rawCalls = (raw.tool_calls || raw.toolCalls) as Array<Record<string, unknown>>;
        const normalizedCalls = rawCalls.map((tc) => {
          const fn = (tc.function as Record<string, unknown>) || {};
          let args: unknown = fn.arguments;
          if (typeof args === 'string') {
            try {
              args = JSON.parse(args as string);
            } catch {
              // keep as string if not JSON
            }
          }
          return {
            function: {
              name: fn.name,
              arguments: args || {},
            },
          };
        });
        sanitizedMessages.push({
          role: 'assistant',
          content: typeof msg.content === 'string' ? msg.content || '' : '',
          tool_calls: normalizedCalls,
        });
        continue;
      }

      let content = '';
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        content = (msg.content as unknown[])
          .map((block: unknown) => {
            if (typeof block === 'string') return block;
            if (typeof block === 'object' && block !== null) {
              const b = block as Record<string, unknown>;
              if (b.type === 'text') return String(b.text || '');
              if (b.type === 'image_url') return '[Image content omitted]';
              return typeof b.text === 'string' ? b.text : JSON.stringify(block);
            }
            return String(block);
          })
          .join('\n');
      } else if (msg.content) {
        content = String(msg.content);
      } else {
        content = '';
      }

      if (!content.trim() && msg.role !== 'assistant') {
        continue;
      }

      sanitizedMessages.push({
        role: msg.role,
        content,
      });
    }

    log.debug(`Ollama sanitized messages: ${sanitizedMessages.length}, tools: ${toolDefinitions.length}`);

    const requestBody: Record<string, unknown> = {
      model,
      messages: sanitizedMessages,
      stream: false,
    };
    if (toolDefinitions.length > 0) {
      requestBody.tools = toolDefinitions;
    }

    const resp = await fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(120000),
    });

    if (!resp.ok) {
      const error = await resp.text();
      log.error(`Ollama error: ${resp.status}`);
      throw new Error(`Ollama error: ${resp.status} - ${error}`);
    }

    const data = (await resp.json()) as {
      message: {
        role: string;
        content: string;
        tool_calls?: Array<{
          id?: string;
          function: { name: string; arguments: Record<string, unknown> | string };
        }>;
      };
      done: boolean;
      total_duration: number;
      load_duration: number;
      prompt_eval_count: number;
      eval_count: number;
    };

    const text = data.message.content ?? '';
    const rawToolCalls = data.message.tool_calls || [];

    log.debug(
      `Ollama response — text: ${text.length} chars, tool_calls: ${rawToolCalls.length}`,
    );

    const toolCalls = rawToolCalls.map((tc, idx) => {
      let argsStr: string;
      if (typeof tc.function.arguments === 'string') argsStr = tc.function.arguments;
      else argsStr = JSON.stringify(tc.function.arguments || {});
      return {
        id: tc.id || `ollama-${Date.now()}-${idx}`,
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments: argsStr,
        },
      };
    });

    const stopReason = toolCalls.length > 0 ? ('tool_calls' as const) : ('stop' as const);

    const result: LLMResponse = {
      stopReason,
      text,
      toolCalls,
    };

    if (data.prompt_eval_count !== undefined && data.eval_count !== undefined) {
      result.usage = {
        promptTokens: data.prompt_eval_count,
        completionTokens: data.eval_count,
        totalTokens: data.prompt_eval_count + data.eval_count,
      };
    }

    return result;
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseURL}/api/tags`, {
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) return [];

      const data = (await response.json()) as { models: Array<{ name: string }> };
      return data.models.map((m) => m.name);
    } catch (err) {
      log.error('Error fetching Ollama models', err);
      return [];
    }
  }

  destroy(): void {
    // Ollama is local, no API key to clear
  }
}
