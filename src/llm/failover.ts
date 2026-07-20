import type { LLMProvider, LLMResponse, LLMChatOptions } from "../types/llm.js";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions.js";
import { createLogger } from "../logger.ts";

const log = createLogger("llm:failover");

interface ProviderHealth {
  name: string;
  consecutiveFailures: number;
  lastFailureTime: number;
  isCircuitOpen: boolean;
  totalCalls: number;
  totalFailures: number;
  totalSuccesses: number;
}

interface FailoverConfig {
  maxConsecutiveFailures: number; // Circuit breaker threshold
  circuitResetTimeMs: number; // Time to wait before retrying a failed provider
}

const DEFAULT_CONFIG: FailoverConfig = {
  maxConsecutiveFailures: 3,
  circuitResetTimeMs: 60000, // 1 minute
};

/**
 * Failover provider that wraps multiple providers with circuit breaker pattern
 * Automatically switches to backup providers when primary fails
 */
export class FailoverProvider implements LLMProvider {
  public readonly name = "failover";
  private providers: LLMProvider[];
  private healthMap: Map<string, ProviderHealth>;
  private config: FailoverConfig;

  constructor(providers: LLMProvider[], config: Partial<FailoverConfig> = {}) {
    if (providers.length === 0) {
      throw new Error("FailoverProvider requires at least one provider");
    }

    this.providers = providers;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.healthMap = new Map();

    // Initialize health tracking for each provider
    for (const provider of providers) {
      this.healthMap.set(provider.name, {
        name: provider.name,
        consecutiveFailures: 0,
        lastFailureTime: 0,
        isCircuitOpen: false,
        totalCalls: 0,
        totalFailures: 0,
        totalSuccesses: 0,
      });
    }

    log.info(
      `Initialized failover provider with ${providers.length} providers: ${providers.map((p) => p.name).join(", ")}`
    );
  }

  /**
   * Get health status for all providers
   */
  public getHealthStatus(): ProviderHealth[] {
    const now = Date.now();
    const statuses: ProviderHealth[] = [];

    for (const health of this.healthMap.values()) {
      // Auto-reset circuit breaker if enough time has passed
      if (
        health.isCircuitOpen &&
        now - health.lastFailureTime > this.config.circuitResetTimeMs
      ) {
        log.info(
          `Circuit breaker reset for ${health.name} after ${this.config.circuitResetTimeMs}ms`
        );
        health.isCircuitOpen = false;
        health.consecutiveFailures = 0;
      }

      statuses.push({ ...health });
    }

    return statuses;
  }

  /**
   * Get available providers (circuit not open)
   */
  private getAvailableProviders(): LLMProvider[] {
    const now = Date.now();
    return this.providers.filter((provider) => {
      const health = this.healthMap.get(provider.name);
      if (!health) return false;

      // Auto-reset circuit if enough time passed
      if (
        health.isCircuitOpen &&
        now - health.lastFailureTime > this.config.circuitResetTimeMs
      ) {
        health.isCircuitOpen = false;
        health.consecutiveFailures = 0;
        log.info(`Circuit breaker auto-reset for ${provider.name}`);
      }

      return !health.isCircuitOpen;
    });
  }

  /**
   * Mark provider as successful
   */
  private recordSuccess(providerName: string): void {
    const health = this.healthMap.get(providerName);
    if (!health) return;

    health.consecutiveFailures = 0;
    health.totalSuccesses++;
    health.totalCalls++;

    if (health.isCircuitOpen) {
      log.info(`Circuit breaker closed for ${providerName} after successful call`);
      health.isCircuitOpen = false;
    }
  }

  /**
   * Mark provider as failed and potentially open circuit breaker
   */
  private recordFailure(providerName: string, error: Error): void {
    const health = this.healthMap.get(providerName);
    if (!health) return;

    health.consecutiveFailures++;
    health.totalFailures++;
    health.totalCalls++;
    health.lastFailureTime = Date.now();

    log.warn(
      `Provider ${providerName} failed (${health.consecutiveFailures}/${this.config.maxConsecutiveFailures}): ${error.message}`
    );

    // Open circuit breaker if threshold reached
    if (health.consecutiveFailures >= this.config.maxConsecutiveFailures) {
      health.isCircuitOpen = true;
      log.error(
        `Circuit breaker OPENED for ${providerName} after ${health.consecutiveFailures} consecutive failures`
      );
    }
  }

  /**
   * Determine if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Rate limits (429)
    if (message.includes("429") || message.includes("rate limit")) {
      return true;
    }

    // Timeouts
    if (message.includes("timeout") || message.includes("timed out")) {
      return true;
    }

    // Network errors
    if (
      message.includes("econnrefused") ||
      message.includes("enotfound") ||
      message.includes("network") ||
      message.includes("fetch failed")
    ) {
      return true;
    }

    // Server errors (5xx)
    if (message.includes("500") || message.includes("502") || message.includes("503")) {
      return true;
    }

    // API errors that suggest temporary issues
    if (message.includes("overloaded") || message.includes("unavailable")) {
      return true;
    }

    return false;
  }

  /**
   * Chat with automatic failover
   */
  async chat(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    options?: LLMChatOptions
  ): Promise<LLMResponse> {
    const availableProviders = this.getAvailableProviders();

    if (availableProviders.length === 0) {
      throw new Error(
        "All providers have open circuit breakers. No providers available for failover."
      );
    }

    log.info(
      `Starting failover chat with ${availableProviders.length} available providers`
    );

    let lastError: Error | null = null;

    // Try each available provider in order
    for (let i = 0; i < availableProviders.length; i++) {
      const provider = availableProviders[i];
      if (!provider) continue; // Skip if undefined (should never happen)
      
      const isLastProvider = i === availableProviders.length - 1;

      try {
        log.debug(`Attempting provider ${i + 1}/${availableProviders.length}: ${provider.name}`);
        
        const response = await provider.chat(messages, toolDefinitions, options);
        
        this.recordSuccess(provider.name);
        log.info(`✓ Provider ${provider.name} succeeded`);
        
        return response;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        lastError = err;

        this.recordFailure(provider.name, err);

        // If this is the last provider or error is not retryable, throw
        if (isLastProvider || !this.isRetryableError(err)) {
          log.error(
            `✗ Provider ${provider.name} failed (last provider or non-retryable): ${err.message}`
          );
          throw err;
        }

        // Otherwise, log and continue to next provider
        log.warn(
          `✗ Provider ${provider.name} failed, trying next provider: ${err.message}`
        );
      }
    }

    // Should not reach here, but throw last error if we do
    throw lastError || new Error("All providers failed");
  }

  /**
   * List models from primary provider (first in list)
   */
  async listModels(): Promise<string[]> {
    const primaryProvider = this.providers[0];
    
    if (!primaryProvider || !primaryProvider.listModels) {
      return [];
    }

    try {
      return await primaryProvider.listModels();
    } catch (error) {
      log.warn(`Failed to list models from ${primaryProvider.name}: ${error}`);
      return [];
    }
  }

  /**
   * Count tokens using primary provider
   */
  countTokens(messages: ChatCompletionMessageParam[]): number {
    const primaryProvider = this.providers[0];
    
    if (!primaryProvider) {
      return 0;
    }

    if (!primaryProvider.countTokens) {
      // Fallback: rough estimate based on message content length
      const totalChars = messages.reduce((sum, m) => {
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        return sum + content.length;
      }, 0);
      return Math.ceil(totalChars / 4);
    }

    try {
      return primaryProvider.countTokens(messages);
    } catch (error) {
      log.warn(`Failed to count tokens from ${primaryProvider.name}: ${error}`);
      // Fallback: rough estimate
      const totalChars = messages.reduce((sum, m) => {
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        return sum + content.length;
      }, 0);
      return Math.ceil(totalChars / 4);
    }
  }

  destroy(): void {
    for (const p of this.providers) {
      p.destroy?.();
    }
    this.providers = [];
  }
}
