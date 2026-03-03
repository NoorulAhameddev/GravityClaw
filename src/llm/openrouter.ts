import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions.js";
import type { LLMProvider, LLMResponse, LLMChatOptions } from "../types/llm.js";
import { createLogger } from "../logger.ts";

const log = createLogger("llm:openrouter");

/**
 * OpenRouter model information
 */
export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing: {
    prompt: number; // Per 1M tokens
    completion: number; // Per 1M tokens
  };
  top_provider: {
    is_moderated: boolean;
    max_completion_tokens: number;
  };
}

/**
 * Cache for OpenRouter models list
 */
let modelsCache: OpenRouterModel[] | null = null;
let modelsCacheTime = 0;
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

/**
 * Clear the models cache (used for testing)
 */
export function clearModelsCache(): void {
  modelsCache = null;
  modelsCacheTime = 0;
}

/**
 * OpenRouter Provider
 * Routes requests through OpenRouter to access multiple models via one API
 */
export class OpenRouterProvider implements LLMProvider {
  readonly name = "openrouter";
  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel: string = "openrouter/free") {
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/gravyclaw",
        "X-Title": "Gravity Claw",
      },
    });
    this.defaultModel = defaultModel;
    log.info(`OpenRouter provider initialized with model: ${defaultModel}`);
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    options?: LLMChatOptions
  ): Promise<LLMResponse> {
    const model = options?.model ?? this.defaultModel;
    const maxTokens = options?.maxTokens ?? 2000;
    const hasTools = toolDefinitions.length > 0;

    log.debug(`Calling OpenRouter — model: ${model}, messages: ${messages.length}, tools: ${toolDefinitions.length}`);

    const params = hasTools
      ? { model, max_tokens: maxTokens, tools: toolDefinitions, tool_choice: "auto" as const, messages }
      : { model, max_tokens: maxTokens, messages };

    // Retry up to 3 times on 429 rate-limit with 3s backoff
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await this.client.chat.completions.create(params);
        const choice = response.choices[0];
        if (!choice) throw new Error("OpenRouter returned no choices");

        const msg = choice.message;
        const text = msg.content ?? "";
        const toolCalls = msg.tool_calls ?? [];

        log.debug(
          `OpenRouter response — stop: ${choice.finish_reason}, text: ${text.length} chars, tools: ${toolCalls.length}`
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
      } catch (err: unknown) {
        lastError = err;
        const status = (err as { status?: number })?.status;
        if (status === 429 && attempt < 3) {
          log.warn(`Rate limited (429) — retrying in 3s (attempt ${attempt}/3)`);
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        if (status === 400) {
          log.error("OpenRouter 400 Error details:", JSON.stringify((err as any).error || err, null, 2));
        }
        throw err;
      }
    }
    throw lastError;
  }

  async listModels(): Promise<string[]> {
    const models = await this.getModelsWithDetails();
    return models.map((model) => model.id);
  }

  /**
   * Get full model details including pricing from OpenRouter
   * Results are cached for 1 hour
   */
  async getModelsWithDetails(): Promise<OpenRouterModel[]> {
    const now = Date.now();

    // Return cached models if still valid
    if (modelsCache && now - modelsCacheTime < CACHE_DURATION_MS) {
      log.debug("Returning cached OpenRouter models");
      return modelsCache;
    }

    try {
      log.info("Fetching OpenRouter models from API...");
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: {
          Authorization: `Bearer ${this.client.apiKey}`,
        },
      });

      if (!response.ok) {
        log.warn(`Failed to fetch OpenRouter models: ${response.status}`);
        return modelsCache ?? []; // Return stale cache if available
      }

      const data = (await response.json()) as { data: OpenRouterModel[] };
      modelsCache = data.data;
      modelsCacheTime = now;

      log.info(`Fetched ${modelsCache.length} OpenRouter models (cached for 1 hour)`);
      return modelsCache;
    } catch (err) {
      log.error("Error fetching OpenRouter models", err);
      return modelsCache ?? []; // Return stale cache if available
    }
  }

  /**
   * Format models for display with pricing information
   */
  async formatModelsForDisplay(limit: number = 20): Promise<string> {
    const models = await this.getModelsWithDetails();

    if (models.length === 0) {
      return "No models available from OpenRouter.";
    }

    // Sort by prompt price (cheapest first), then by name
    const sortedModels = models
      .sort((a, b) => {
        const priceDiff = a.pricing.prompt - b.pricing.prompt;
        if (priceDiff !== 0) return priceDiff;
        return a.id.localeCompare(b.id);
      })
      .slice(0, limit);

    let result = `**OpenRouter Models** (${models.length} total, showing ${sortedModels.length}):\n\n`;

    for (const model of sortedModels) {
      const promptPrice = (model.pricing.prompt * 1).toFixed(2);
      const completionPrice = (model.pricing.completion * 1).toFixed(2);
      const contextK = Math.floor(model.context_length / 1000);

      result += `**${model.id}**\n`;
      result += `├─ Context: ${contextK}K tokens\n`;
      result += `├─ Pricing: $${promptPrice} / $${completionPrice} per 1M tokens (in/out)\n`;

      if (model.description) {
        const shortDesc = model.description.length > 60
          ? model.description.substring(0, 57) + "..."
          : model.description;
        result += `└─ ${shortDesc}\n`;
      } else {
        result += `└─ Max output: ${model.top_provider.max_completion_tokens} tokens\n`;
      }

      result += "\n";
    }

    result += `_Use \`/model <model-id>\` to switch models_`;
    return result;
  }
}
