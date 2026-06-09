import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions.js";
import type { LLMProvider, LLMResponse, LLMChatOptions } from "../types/llm.js";
import { createLogger } from "../logger.ts";

const log = createLogger("llm:opencodezen");

export class OpenCodeZenProvider implements LLMProvider {
  readonly name = "opencodezen";
  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel: string = "minimax-m2.5-free", baseURL: string = "https://opencode.ai/zen/v1") {
    this.client = new OpenAI({
      apiKey,
      baseURL,
    });
    this.defaultModel = defaultModel;
    log.info(`OpenCodeZen provider initialized with model: ${defaultModel} and baseURL: ${baseURL}`);
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    options?: LLMChatOptions
  ): Promise<LLMResponse> {
    const model = options?.model ?? this.defaultModel;
    const maxTokens = options?.maxTokens ?? 2000;
    const hasTools = toolDefinitions.length > 0;

    log.debug(`Calling OpenCodeZen — model: ${model}, messages: ${messages.length}, tools: ${toolDefinitions.length}`);

    const mappedMessages = messages.map((msg) => {
      if (msg.role === "assistant") {
        const assistantMsg = msg as any;
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
      ? { model, max_tokens: maxTokens, tools: toolDefinitions, tool_choice: "auto" as const, messages: mappedMessages as any }
      : { model, max_tokens: maxTokens, messages: mappedMessages as any };

    const response = await this.client.chat.completions.create(params);
    const choice = response.choices[0];
    if (!choice) throw new Error("OpenCodeZen returned no choices");

    const msg = choice.message;
    const text = msg.content ?? "";
    const toolCalls = msg.tool_calls ?? [];
    const thought = (msg as any).reasoning_content;

    log.debug(
      `OpenCodeZen response — stop: ${choice.finish_reason}, text: ${text.length} chars, tools: ${toolCalls.length}`
    );

    const result: LLMResponse = {
      stopReason: choice.finish_reason ?? "stop",
      text,
      toolCalls,
    };

    if (typeof thought === "string" && thought) {
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
}
