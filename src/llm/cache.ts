import type { LLMProvider, LLMResponse, LLMChatOptions } from "../types/llm.js";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions.js";
import crypto from "crypto";
import { createLogger } from "../logger.ts";

const log = createLogger("llm-cache");

interface CacheEntry {
  response: LLMResponse;
  cachedAt: number;
  ttl: number;
}

export class CachedLLMProvider implements LLMProvider {
  readonly name: string;
  private provider: LLMProvider;
  private cache: Map<string, CacheEntry>;
  private defaultTTL: number;
  private maxEntries: number;
  private maxMemoryBytes: number;
  private currentMemoryBytes: number = 0;

  constructor(provider: LLMProvider, ttlMs = 60_000) {
    this.name = `${provider.name}_cached`;
    this.provider = provider;
    this.cache = new Map();
    this.defaultTTL = ttlMs;
    this.maxEntries = 1000;
    this.maxMemoryBytes = 100 * 1024 * 1024;
  }

  private cacheKey(messages: ChatCompletionMessageParam[], toolDefinitions: ChatCompletionTool[], options?: LLMChatOptions): string {
    const hash = crypto.createHash("sha256");
    hash.update(JSON.stringify({ messages, toolDefinitions, options }));
    return hash.digest("hex");
  }

  private evictLru(): void {
    const lruKey = this.cache.keys().next().value;
    if (lruKey !== undefined) {
      const entry = this.cache.get(lruKey);
      if (entry) {
        this.currentMemoryBytes -= JSON.stringify(entry.response).length * 2;
      }
      this.cache.delete(lruKey);
    }
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    options?: LLMChatOptions
  ): Promise<LLMResponse> {
    const key = this.cacheKey(messages, toolDefinitions, options);
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.cachedAt < cached.ttl) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.response;
    }

    if (cached) {
      this.currentMemoryBytes -= JSON.stringify(cached.response).length * 2;
      this.cache.delete(key);
    }

    const response = await this.provider.chat(messages, toolDefinitions, options);

    while (this.cache.size >= this.maxEntries || this.currentMemoryBytes + JSON.stringify(response).length * 2 > this.maxMemoryBytes) {
      this.evictLru();
    }

    const responseSize = JSON.stringify(response).length * 2;
    this.currentMemoryBytes += responseSize;

    this.cache.set(key, {
      response,
      cachedAt: Date.now(),
      ttl: this.defaultTTL,
    });

    return response;
  }

  chatStream?(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    options?: LLMChatOptions & { onToken?: (token: string, done: boolean) => void }
  ): Promise<LLMResponse> {
    if (this.provider.chatStream) {
      return this.provider.chatStream(messages, toolDefinitions, options);
    }
    return this.chat(messages, toolDefinitions, options);
  }

  listModels?(): Promise<string[]> {
    if (this.provider.listModels) return this.provider.listModels();
    return Promise.resolve([]);
  }

  countTokens?(messages: ChatCompletionMessageParam[]): number {
    if (this.provider.countTokens) return this.provider.countTokens(messages);
    return 0;
  }

  destroy(): void {
    this.cache.clear();
    this.provider.destroy?.();
  }

  clearCache(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.currentMemoryBytes = 0;
    log.info(`Cache cleared (${size} entries)`);
  }

  getCacheStats(): { size: number; oldestEntry: number | null; memoryBytes: number } {
    let oldest = Infinity;
    for (const entry of this.cache.values()) {
      if (entry.cachedAt < oldest) oldest = entry.cachedAt;
    }
    return {
      size: this.cache.size,
      oldestEntry: oldest === Infinity ? null : oldest,
      memoryBytes: this.currentMemoryBytes,
    };
  }
}
