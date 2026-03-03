import Anthropic from "@anthropic-ai/sdk";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions.js";
import type OpenAI from "openai";
import type { LLMProvider, LLMResponse, LLMChatOptions } from "./base.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("llm:anthropic");

/**
 * Anthropic Provider
 * Claude models with tool use support
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel: string = "claude-3-5-sonnet-20241022") {
    this.client = new Anthropic({ apiKey });
    this.defaultModel = defaultModel;
    log.info(`Anthropic provider initialized with model: ${defaultModel}`);
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    options?: LLMChatOptions
  ): Promise<LLMResponse> {
    const model = options?.model ?? this.defaultModel;
    const maxTokens = options?.maxTokens ?? 2000;

    log.debug(`Calling Anthropic — model: ${model}, messages: ${messages.length}, tools: ${toolDefinitions.length}`);

    // Convert OpenAI format to Anthropic format
    const { system, anthropicMessages } = this.convertMessages(messages);
    const anthropicTools = this.convertTools(toolDefinitions);

    const params: Anthropic.MessageCreateParams = {
      model,
      max_tokens: maxTokens,
      messages: anthropicMessages,
    };

    if (system) {
      params.system = system;
    }

    if (anthropicTools.length > 0) {
      params.tools = anthropicTools;
    }

    const response = await this.client.messages.create(params);

    // Convert back to OpenAI format
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const toolCalls = response.content
      .filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use")
      .map((block) => ({
        id: block.id,
        type: "function" as const,
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
      }));

    log.debug(
      `Anthropic response — stop: ${response.stop_reason}, text: ${text.length} chars, tools: ${toolCalls.length}`
    );

    const result: LLMResponse = {
      stopReason: response.stop_reason ?? "end_turn",
      text,
      toolCalls,
    };

    if (response.usage) {
      result.usage = {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      };
    }

    return result;
  }

  private convertMessages(messages: ChatCompletionMessageParam[]): {
    system: string | undefined;
    anthropicMessages: Anthropic.MessageParam[];
  } {
    let system: string | undefined;
    const anthropicMessages: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        system = typeof msg.content === "string" ? msg.content : "";
      } else if (msg.role === "user") {
        anthropicMessages.push({
          role: "user",
          content: typeof msg.content === "string" ? msg.content : "",
        });
      } else if (msg.role === "assistant") {
        const content: Array<Anthropic.TextBlock | Anthropic.ToolUseBlock> = [];
        
        if (msg.content) {
          const textContent = typeof msg.content === "string" ? msg.content : "";
          content.push({ 
            type: "text", 
            text: textContent,
            citations: null,
          } as Anthropic.TextBlock);
        }

        if ("tool_calls" in msg && msg.tool_calls) {
          for (const toolCall of msg.tool_calls) {
            content.push({
              type: "tool_use",
              id: toolCall.id,
              name: toolCall.function.name,
              input: JSON.parse(toolCall.function.arguments),
              caller: {
                type: "internal" as const,
                tool_id: toolCall.id,
              } as any,
            } as Anthropic.ToolUseBlock);
          }
        }

        anthropicMessages.push({ role: "assistant", content });
      } else if (msg.role === "tool") {
        // Anthropic expects tool results as user messages
        anthropicMessages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: msg.tool_call_id,
              content: msg.content ?? "",
            },
          ],
        });
      }
    }

    return { system, anthropicMessages };
  }

  private convertTools(tools: ChatCompletionTool[]): Anthropic.Tool[] {
    return tools.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description ?? "",
      input_schema: {
        type: "object",
        ...(tool.function.parameters as Record<string, unknown>),
      } as Anthropic.Tool.InputSchema,
    }));
  }
}
