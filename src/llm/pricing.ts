/**
 * LLM Pricing Database
 * 
 * Prices are in USD per million tokens (1M tokens)
 * Updated: March 2026
 * 
 * Sources:
 * - OpenAI: https://openai.com/api/pricing/
 * - Anthropic: https://www.anthropic.com/pricing
 * - Google: https://ai.google.dev/pricing
 * - Groq: https://groq.com/pricing/
 * - DeepSeek: https://platform.deepseek.com/api-docs/pricing/
 * - OpenRouter: https://openrouter.ai/models (varies by model)
 */

export interface ModelPricing {
  inputPrice: number;   // USD per 1M input tokens
  outputPrice: number;  // USD per 1M output tokens
  contextWindow: number; // Maximum context window size
}

/**
 * Model pricing database
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI Models
  "gpt-4o": {
    inputPrice: 2.50,
    outputPrice: 10.00,
    contextWindow: 128000,
  },
  "gpt-4o-mini": {
    inputPrice: 0.15,
    outputPrice: 0.60,
    contextWindow: 128000,
  },
  "gpt-4-turbo": {
    inputPrice: 10.00,
    outputPrice: 30.00,
    contextWindow: 128000,
  },
  "gpt-4": {
    inputPrice: 30.00,
    outputPrice: 60.00,
    contextWindow: 8192,
  },
  "gpt-3.5-turbo": {
    inputPrice: 0.50,
    outputPrice: 1.50,
    contextWindow: 16384,
  },

  // Anthropic Models
  "claude-3-5-sonnet-20241022": {
    inputPrice: 3.00,
    outputPrice: 15.00,
    contextWindow: 200000,
  },
  "claude-3-5-sonnet": {
    inputPrice: 3.00,
    outputPrice: 15.00,
    contextWindow: 200000,
  },
  "claude-3-opus-20240229": {
    inputPrice: 15.00,
    outputPrice: 75.00,
    contextWindow: 200000,
  },
  "claude-3-opus": {
    inputPrice: 15.00,
    outputPrice: 75.00,
    contextWindow: 200000,
  },
  "claude-3-sonnet-20240229": {
    inputPrice: 3.00,
    outputPrice: 15.00,
    contextWindow: 200000,
  },
  "claude-3-haiku-20240307": {
    inputPrice: 0.25,
    outputPrice: 1.25,
    contextWindow: 200000,
  },
  "claude-3-haiku": {
    inputPrice: 0.25,
    outputPrice: 1.25,
    contextWindow: 200000,
  },

  // Google Gemini Models
  "gemini-1.5-pro": {
    inputPrice: 1.25,
    outputPrice: 5.00,
    contextWindow: 2000000,
  },
  "gemini-1.5-flash": {
    inputPrice: 0.075,
    outputPrice: 0.30,
    contextWindow: 1000000,
  },
  "gemini-2.0-flash-exp": {
    inputPrice: 0.00, // Free tier
    outputPrice: 0.00, // Free tier
    contextWindow: 1000000,
  },

  // Groq Models (free tier, fast inference)
  "llama-3.3-70b-versatile": {
    inputPrice: 0.59,
    outputPrice: 0.79,
    contextWindow: 128000,
  },
  "llama-3.1-70b-versatile": {
    inputPrice: 0.59,
    outputPrice: 0.79,
    contextWindow: 128000,
  },
  "llama-3.1-8b-instant": {
    inputPrice: 0.05,
    outputPrice: 0.08,
    contextWindow: 128000,
  },
  "mixtral-8x7b-32768": {
    inputPrice: 0.24,
    outputPrice: 0.24,
    contextWindow: 32768,
  },
  "gemma2-9b-it": {
    inputPrice: 0.20,
    outputPrice: 0.20,
    contextWindow: 8192,
  },

  // DeepSeek Models
  "deepseek-chat": {
    inputPrice: 0.14,
    outputPrice: 0.28,
    contextWindow: 64000,
  },
  "deepseek-coder": {
    inputPrice: 0.14,
    outputPrice: 0.28,
    contextWindow: 64000,
  },

  // OpenRouter Models (examples - varies widely)
  "openai/gpt-4o": {
    inputPrice: 2.50,
    outputPrice: 10.00,
    contextWindow: 128000,
  },
  "openai/gpt-4o-mini": {
    inputPrice: 0.15,
    outputPrice: 0.60,
    contextWindow: 128000,
  },
  "anthropic/claude-3-5-sonnet": {
    inputPrice: 3.00,
    outputPrice: 15.00,
    contextWindow: 200000,
  },
  "google/gemini-2.5": {
    inputPrice: 1.25,
    outputPrice: 5.00,
    contextWindow: 2000000,
  },
  "meta-llama/llama-3.2-3b-instruct:free": {
    inputPrice: 0.00, // Free model
    outputPrice: 0.00,
    contextWindow: 128000,
  },

  // Ollama Models (local, free)
  "llama3.2": {
    inputPrice: 0.00, // Local model, no cost
    outputPrice: 0.00,
    contextWindow: 128000,
  },
  "llama3": {
    inputPrice: 0.00,
    outputPrice: 0.00,
    contextWindow: 8192,
  },
  "mistral": {
    inputPrice: 0.00,
    outputPrice: 0.00,
    contextWindow: 32768,
  },
  "codellama": {
    inputPrice: 0.00,
    outputPrice: 0.00,
    contextWindow: 16384,
  },
};

/**
 * Get pricing for a model
 * @param modelName - Full model name
 * @returns Pricing info or default fallback
 */
export function getModelPricing(modelName: string): ModelPricing {
  // Direct lookup
  if (MODEL_PRICING[modelName]) {
    return MODEL_PRICING[modelName]!;
  }

  // Try without provider prefix (e.g., "openai/gpt-4" → "gpt-4")
  const withoutProvider = modelName.split("/").pop();
  if (withoutProvider && MODEL_PRICING[withoutProvider]) {
    return MODEL_PRICING[withoutProvider]!;
  }

  // Try fuzzy match for versioned models (e.g., "gpt-4-0613" → "gpt-4")
  const baseName = modelName.split("-").slice(0, 2).join("-"); // Take first two parts
  if (MODEL_PRICING[baseName]) {
    return MODEL_PRICING[baseName]!;
  }

  // Fallback to generic pricing
  return {
    inputPrice: 1.00, // $1 per 1M tokens (generic estimate)
    outputPrice: 3.00, // $3 per 1M tokens (generic estimate)
    contextWindow: 32000, // Conservative default
  };
}

/**
 * Calculate cost for a request
 * @param modelName - Model name
 * @param promptTokens - Number of prompt tokens
 * @param completionTokens - Number of completion tokens
 * @returns Cost in USD
 */
export function calculateCost(
  modelName: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = getModelPricing(modelName);
  
  const promptCost = (promptTokens / 1_000_000) * pricing.inputPrice;
  const completionCost = (completionTokens / 1_000_000) * pricing.outputPrice;
  
  return promptCost + completionCost;
}

/**
 * Format cost for display
 * @param cost - Cost in USD
 * @returns Formatted string (e.g., "$0.0025" or "$2.50")
 */
export function formatCost(cost: number): string {
  if (cost === 0) {
    return "$0.00";
  }
  
  if (cost < 0.01) {
    // Show more precision for very small costs
    return `$${cost.toFixed(4)}`;
  }
  
  if (cost < 1) {
    return `$${cost.toFixed(3)}`;
  }
  
  return `$${cost.toFixed(2)}`;
}

/**
 * Check if conversation is approaching context limit
 * @param tokenCount - Current token count
 * @param modelName - Model name
 * @param threshold - Warning threshold (default 0.8 = 80%)
 * @returns true if approaching limit
 */
export function isApproachingContextLimit(
  tokenCount: number,
  modelName: string,
  threshold: number = 0.8
): boolean {
  const pricing = getModelPricing(modelName);
  return tokenCount >= pricing.contextWindow * threshold;
}
