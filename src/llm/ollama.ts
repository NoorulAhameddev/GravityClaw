import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions.js";
import type OpenAI from "openai";
import type { LLMProvider, LLMResponse, LLMChatOptions } from "./base.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("llm:ollama");

/**
 * Ollama Provider
 * Local LLMs (Llama, Mistral, etc.) running via Ollama
 */
export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  private baseURL: string;
  private defaultModel: string;

  constructor(defaultModel: string = "llama3.2", baseURL: string = "http://localhost:11434") {
    this.baseURL = baseURL;
    this.defaultModel = defaultModel;
    log.info(`Ollama provider initialized with model: ${defaultModel} at ${baseURL}`);
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    options?: LLMChatOptions
  ): Promise<LLMResponse> {
    const model = options?.model ?? this.defaultModel;

    log.debug(`Calling Ollama — model: ${model}, messages: ${messages.length}, tools: ${toolDefinitions.length}`);

    // Ollama doesn't support tool roles or tool_calls
    // Filter and sanitize messages for Ollama compatibility
    const sanitizedMessages: Array<{ role: string; content: string }> = [];
    
    for (const msg of messages) {
      // Skip tool result messages entirely
      if (msg.role === "tool") {
        continue;
      }

      let content = "";

      // Convert all content to string
      if (typeof msg.content === "string") {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        // Handle content arrays (multimodal)
        content = msg.content
          .map((block: any) => {
            if (typeof block === "string") return block;
            if (block.type === "text") return block.text || "";
            if (block.type === "image_url") return "[Image content omitted]";
            return block.text || JSON.stringify(block);
          })
          .join("\n");
      } else if (msg.content) {
        // Fallback for other content types
        content = String(msg.content);
      } else {
        content = "";
      }

      // Skip empty messages
      if (!content.trim()) {
        continue;
      }

      sanitizedMessages.push({
        role: msg.role,
        content,
      });
    }

    log.debug(`Ollama sanitized messages: ${sanitizedMessages.length}`);

    const response = await fetch(`${this.baseURL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: sanitizedMessages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      log.error(`Ollama error: ${response.status}`);
      throw new Error(`Ollama error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      message: {
        role: string;
        content: string;
      };
      done: boolean;
      total_duration: number;
      load_duration: number;
      prompt_eval_count: number;
      eval_count: number;
    };

    const text = data.message.content ?? "";

    log.debug(`Ollama response — text: ${text.length} chars`);

    const result: LLMResponse = {
      stopReason: "stop",
      text,
      toolCalls: [],
    };

    // Estimate tokens from character count (rough approximation)
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
      const response = await fetch(`${this.baseURL}/api/tags`);
      if (!response.ok) return [];
      
      const data = (await response.json()) as { models: Array<{ name: string }> };
      return data.models.map((m) => m.name);
    } catch (err) {
      log.error("Error fetching Ollama models", err);
      return [];
    }
  }
}
