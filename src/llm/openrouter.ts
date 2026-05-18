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
  private blacklistedModels: Map<string, number> = new Map(); // modelId -> expiryTimestamp

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

  /**
   * Resolves a generic model name like 'openrouter/free' to a specific available model ID.
   * Prioritizes known reliable free models.
   */
  private async resolveModelName(modelName: string, exclude: string[] = []): Promise<string> {
    const isFreeModel = modelName === "openrouter/free" || modelName.endsWith(":free");
    
    if (!isFreeModel || (modelName !== "openrouter/free" && !exclude.includes(modelName))) {
      return modelName;
    }

    const now = Date.now();
    // Clean up expired blacklisted models
    for (const [id, expiry] of this.blacklistedModels.entries()) {
      if (now > expiry) this.blacklistedModels.delete(id);
    }

    const models = await this.getModelsWithDetails();
    if (models.length === 0) {
      log.warn("No models available to resolve 'openrouter/free', falling back to hardcoded default.");
      return "google/gemini-2.0-flash-exp:free";
    }

    // Filter out blacklisted and explicitly excluded models
    const isAvailable = (id: string) => {
      const isCached = models.some(m => m.id === id);
      const isBlacklisted = this.blacklistedModels.has(id);
      const isExcluded = exclude.includes(id);
      return isCached && !isBlacklisted && !isExcluded;
    };

    // Known high-quality free models in preference order (Updated May 2026)
    // Prioritizing Meta Llama 3.3 as it's currently the most stable tool-supporting free model
    const preferredFreeModels = [
      // Meta Llama 3.3 (High reliability, good tool support)
      "meta-llama/llama-3.3-70b-instruct:free",
      
      // NVIDIA / Mistral (Solid alternatives with dedicated endpoints)
      "nvidia/llama-3.1-nemotron-70b-instruct:free",
      "mistralai/mistral-small-3.1-24b-instruct:free",

      // DeepSeek (Excellent but often rate-limited)
      "deepseek/deepseek-chat:free",
      "deepseek/deepseek-r1:free",
      
      // Google Gemma 3 (Very new, may have limited endpoints)
      "google/gemma-3-27b-it:free",
      "google/gemma-3-12b-it:free",
      
      // Fallbacks
      "qwen/qwen-2.5-72b-instruct:free",
      "nousresearch/hermes-3-llama-3.1-405b:free",
      "google/gemini-2.0-flash-lite-preview-02-05:free",
    ];

    // 1. Try to find a preferred model that is currently available and not blacklisted
    for (const id of preferredFreeModels) {
      if (isAvailable(id)) {
        log.debug(`Resolved 'openrouter/free' to preferred model: ${id}`);
        return id;
      }
    }

    log.warn(`All preferred free models are blacklisted or unavailable. Excluded count: ${exclude.length}`);

    // 2. Fallback: Find ANY model with 0 pricing that isn't blacklisted or excluded
    // Get all available free models from the API that aren't excluded
    const availableFreeModels = models
      .filter(m => m.pricing.prompt === 0)
      .filter(m => !this.blacklistedModels.has(m.id) && !exclude.includes(m.id))
      .map(m => m.id);
    
    // Shuffle or try different ones to avoid always picking the same one
    if (availableFreeModels.length > 0) {
      // Pick a random one from available free models to distribute load
      const randomIndex = Math.floor(Math.random() * availableFreeModels.length);
      const randomModel = availableFreeModels[randomIndex];
      const selectedModel = randomModel ?? availableFreeModels[0] ?? "google/gemma-3-27b-it:free";
      log.debug(`Resolved 'openrouter/free' to random free model: ${selectedModel} (from ${availableFreeModels.length} available)`);
      return selectedModel;
    }

    // 3. Last resort: If there's ANY free model (even if previously tried), pick one that will eventually expire from blacklist
    const allFreeModels = models.filter(m => m.pricing.prompt === 0).map(m => m.id);
    if (allFreeModels.length > 0) {
      // Pick the first one - it might work if blacklist expires
      const fallback = allFreeModels[0] ?? "google/gemma-3-27b-it:free";
      log.warn(`All free models are excluded/blacklisted. Trying first free model anyway: ${fallback}`);
      return fallback;
    }

    // 4. Ultimate fallback (Confirmed stable as of May 2026)
    return "meta-llama/llama-3.3-70b-instruct:free";
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    options?: LLMChatOptions
  ): Promise<LLMResponse> {
    const rawModel = options?.model ?? this.defaultModel;
    const isFreeAlias = rawModel === "openrouter/free" || rawModel.endsWith(":free");
    const maxTokens = options?.maxTokens ?? 2000;
    const hasTools = toolDefinitions.length > 0;
    const excludedModels: string[] = [];

    // Global retry loop for model rotation (free tier failover)
    for (let modelAttempt = 1; modelAttempt <= (isFreeAlias ? 15 : 1); modelAttempt++) {
      const model = await this.resolveModelName(rawModel, excludedModels);
      log.debug(`Calling OpenRouter — model: ${model} (attempt ${modelAttempt})${excludedModels.length > 0 ? `, skipped: ${excludedModels.join(', ')}` : ""}`);

      const params = hasTools
        ? { model, max_tokens: maxTokens, tools: toolDefinitions, tool_choice: "auto" as const, messages }
        : { model, max_tokens: maxTokens, messages };

      // Inner retry loop for the SAME model (rate limits)
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
          const errorObj = (err as any)?.error || (err as any);
          const status = (err as any)?.status || (err as any)?.code || errorObj?.code || errorObj?.status;
          const message = errorObj?.message || (err as Error)?.message || String(err);

          log.warn(`OpenRouter API error — Model: ${model}, Status: ${status}, Message: ${message.substring(0, 100)}`);

          // 1. Handle Tool Support Errors specifically
          if (hasTools && (message.toLowerCase().includes("tool use") || message.toLowerCase().includes("tools"))) {
            log.warn(`Model ${model} does not support tools. Retrying without tools.`);
            const noToolsParams = { model, max_tokens: maxTokens, messages };
            try {
              const retryResponse = await this.client.chat.completions.create(noToolsParams);
              const choice = retryResponse.choices[0];
              if (choice) {
                log.info(`Successful fallback for ${model} without tools.`);
                // Process response as normal...
                const msg = choice.message;
                const result: LLMResponse = {
                  stopReason: choice.finish_reason ?? "stop",
                  text: msg.content ?? "",
                  toolCalls: [],
                };
                if (retryResponse.usage) {
                  result.usage = {
                    promptTokens: retryResponse.usage.prompt_tokens,
                    completionTokens: retryResponse.usage.completion_tokens,
                    totalTokens: retryResponse.usage.total_tokens,
                  };
                }
                return result;
              }
            } catch (retryErr) {
              log.error(`Fallback without tools also failed for ${model}:`, retryErr);
              // Fall through to normal failover
            }
          }

          // 2. Handle Rate Limits (429), Quota Limits (402), Policy Errors, or Tool Support Issues
          const isPolicyError = message.toLowerCase().includes("data policy") || message.toLowerCase().includes("privacy");
          const isToolSupportError = message.toLowerCase().includes("tool use") || message.toLowerCase().includes("tools");
          const statusCode = Number(status);
          const isFailoverStatus = [429, 402, 404, 500, 502, 503, 504].includes(statusCode) || 
                                   (typeof status === 'string' && (status === '429' || status === '402' || status === '404' || status === '503'));
          
          // Rotate if it's a failover status, policy error, or if we explicitly hit a tool support error
          const shouldBlacklist = isFailoverStatus || isPolicyError || isToolSupportError;

          if (shouldBlacklist && isFreeAlias) {
            log.warn(`Model ${model} hit failover condition (${status}/policy). Blacklisting for 15 mins and rotating.`);
            this.blacklistedModels.set(model, Date.now() + 15 * 60 * 1000); // 15 mins for policy/status errors
            excludedModels.push(model);

            // If it's specifically a policy error, we wrap it in a more helpful message for the final throw
            if (isPolicyError) {
              lastError = new Error(`OpenRouter Data Policy Error: Please enable "Free model publication" in your OpenRouter Privacy Settings (https://openrouter.ai/settings/privacy) to use free models.`);
            }

            break; // Exit inner loop and try next model
          }

          // For tool support errors that failed the retry, rotate to next model without blacklisting
          if (isToolSupportError && isFreeAlias) {
            log.warn(`Model ${model} does not support tools (even without tools param). Rotating to next model.`);
            excludedModels.push(model);
            break; // Exit inner loop and try next model
          }

          if (status === 429 && attempt < 3) {
            log.warn(`Rate limited (429) — retrying in 5s (attempt ${attempt}/3)`);
            await new Promise((r) => setTimeout(r, 5000));
            continue;
          }

          // 3. Handle Image/Vision Support Errors
          const isVisionError = message.toLowerCase().includes("image input") || 
                                message.toLowerCase().includes("does not support image") ||
                                message.toLowerCase().includes("vision") ||
                                message.toLowerCase().includes("image_url");
          
          if (isVisionError && isFreeAlias) {
            log.warn(`Model ${model} does not support images/vision. Rotating to next model.`);
            excludedModels.push(model);
            break;
          }

          if (status === 400) {
            log.error("OpenRouter 400 Error details:", JSON.stringify(errorObj, null, 2));
            if (isFreeAlias) {
              log.warn(`Model ${model} returned 400 (${message.substring(0, 80)}). Rotating to next model.`);
              excludedModels.push(model);
              break;
            }
          }
          throw err;
        }
      }

      // Add delay between model attempts to avoid overwhelming the API
      if (isFreeAlias && modelAttempt < 15) {
        await new Promise((r) => setTimeout(r, 2000));
      }

      if (!isFreeAlias) throw lastError;
      if (modelAttempt >= 15) throw lastError; // Try up to 15 different models
    }

    throw new Error("Failed to get response after model rotation");
  }

  async listModels(): Promise<string[]> {
    const models = await this.getModelsWithDetails();
    let result = models.map((model) => model.id);

    // If configured for free models, filter the list to show free ones if any exist
    if (this.defaultModel === "openrouter/free") {
      const freeModels = result.filter(id => id.endsWith(":free") || models.find(m => m.id === id)?.pricing.prompt === 0);
      if (freeModels.length > 0) {
        return freeModels;
      }
    }

    return result;
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
    let sortedModels = models
      .sort((a, b) => {
        const priceDiff = a.pricing.prompt - b.pricing.prompt;
        if (priceDiff !== 0) return priceDiff;
        return a.id.localeCompare(b.id);
      });

    // If in free mode, prioritize showing ONLY free models in the display hint
    if (this.defaultModel === "openrouter/free") {
      const freeModels = sortedModels.filter(m => m.pricing.prompt === 0 || m.id.endsWith(":free"));
      if (freeModels.length > 0) {
        sortedModels = freeModels;
      }
    }

    sortedModels = sortedModels.slice(0, limit);

    let result = `**OpenRouter Models** (${models.length} total, showing ${sortedModels.length}${this.defaultModel === "openrouter/free" ? " free" : ""}):\n\n`;

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
