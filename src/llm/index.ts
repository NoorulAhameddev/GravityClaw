import type { LLMProvider } from "./base.ts";
import { OpenRouterProvider } from "./openrouter.ts";
import { OpenAIProvider } from "./openai.ts";
import { AnthropicProvider } from "./anthropic.ts";
import { GoogleProvider } from "./google.ts";
import { GroqProvider } from "./groq.ts";
import { DeepSeekProvider } from "./deepseek.ts";
import { OllamaProvider } from "./ollama.ts";
import { FailoverProvider } from "./failover.ts";
import { config } from "../config.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("llm");

export { SYSTEM_PROMPT } from "./base.ts";
export type { LLMProvider, LLMResponse, LLMChatOptions } from "./base.ts";
export { FailoverProvider } from "./failover.ts";
export { OpenRouterProvider } from "./openrouter.ts";
export type { OpenRouterModel } from "./openrouter.ts";
export * from "./orchestrator.ts";

/**
 * Create a single provider instance by name (used by failover provider)
 */
/**
 * Create a single provider instance by name (used by failover provider)
 */
function createSingleProvider(providerName: string, model?: string): LLMProvider {
  const providerModel = model || config.LLM_MODEL;

  switch (providerName) {
    case "openrouter":
      if (!config.OPENROUTER_API_KEY) {
        throw new Error("OPENROUTER_API_KEY is required for OpenRouter provider");
      }
      return new OpenRouterProvider(config.OPENROUTER_API_KEY, providerModel);

    case "openai":
      if (!config.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is required for OpenAI provider");
      }
      return new OpenAIProvider(config.OPENAI_API_KEY, providerModel);

    case "anthropic":
      if (!config.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY is required for Anthropic provider");
      }
      return new AnthropicProvider(config.ANTHROPIC_API_KEY, providerModel);

    case "google":
      if (!config.GOOGLE_API_KEY) {
        throw new Error("GOOGLE_API_KEY is required for Google provider");
      }
      return new GoogleProvider(config.GOOGLE_API_KEY, providerModel);

    case "groq":
      if (!config.GROQ_API_KEY) {
        throw new Error("GROQ_API_KEY is required for Groq provider");
      }
      return new GroqProvider(config.GROQ_API_KEY, providerModel);

    case "deepseek":
      if (!config.DEEPSEEK_API_KEY) {
        throw new Error("DEEPSEEK_API_KEY is required for DeepSeek provider");
      }
      return new DeepSeekProvider(config.DEEPSEEK_API_KEY, providerModel);

    case "ollama":
      const ollamaURL = config.OLLAMA_BASE_URL || "http://localhost:11434";
      return new OllamaProvider(providerModel, ollamaURL);

    default:
      throw new Error(
        `Unknown LLM provider: ${providerName}. Available: openrouter, openai, anthropic, google, groq, deepseek, ollama`
      );
  }
}

/**
 * Create an LLM provider based on configuration or overrides
 */
export function createProvider(overrides?: { provider?: string | undefined; model?: string | undefined }): LLMProvider {
  const providerName = overrides?.provider || config.LLM_PROVIDER || "openrouter";
  const modelName = overrides?.model || config.LLM_MODEL;

  log.info(`Creating LLM provider: ${providerName}${overrides ? " (session override)" : ""}`);

  // Special case: failover provider
  if (providerName === "failover") {
    const failoverList = config.LLM_FAILOVER_LIST || "openai,anthropic,openrouter";
    const providerNames = failoverList.split(",").map((p) => p.trim()).filter(Boolean);

    if (providerNames.length === 0) {
      throw new Error("LLM_FAILOVER_LIST must contain at least one provider");
    }

    log.info(`Creating failover provider with: ${providerNames.join(", ")}`);

    const providers: LLMProvider[] = [];
    const errors: string[] = [];

    // Try to create each provider, skip if API key missing
    for (const name of providerNames) {
      try {
        const provider = createSingleProvider(name, modelName);
        providers.push(provider);
      } catch (error) {
        const err = error instanceof Error ? error.message : String(error);
        errors.push(`${name}: ${err}`);
        log.warn(`Skipping provider ${name} in failover list: ${err}`);
      }
    }

    if (providers.length === 0) {
      throw new Error(
        `No valid providers available for failover. Errors:\n${errors.join("\n")}`
      );
    }

    if (providers.length === 1) {
      log.warn(
        "Only 1 provider available for failover, consider adding more API keys for redundancy"
      );
    }

    return new FailoverProvider(providers);
  }

  // Single provider mode
  return createSingleProvider(providerName, modelName);
}

/**
 * Global provider instance (lazy-initialized)
 */
let providerInstance: LLMProvider | null = null;

/**
 * Get the current LLM provider instance
 */
export function getProvider(): LLMProvider {
  if (!providerInstance) {
    providerInstance = createProvider();
  }
  return providerInstance;
}

/**
 * Set a custom provider (useful for testing or runtime provider switching)
 */
export function setProvider(provider: LLMProvider): void {
  log.info(`Switching to provider: ${provider.name}`);
  providerInstance = provider;
}
