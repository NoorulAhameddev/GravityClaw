import type { Tool } from "./index.ts";

let cachedProviderRef: { current: import("../llm/cache.ts").CachedLLMProvider | null } = { current: null };

export function setCachedProviderRef(ref: typeof cachedProviderRef): void {
  cachedProviderRef = ref;
}

export const clearLLMCacheTool: Tool = {
  name: "clear_llm_cache",
  description: "Clear the LLM response cache",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
  async execute() {
    if (!cachedProviderRef.current) {
      return "LLM cache is not enabled.";
    }
    cachedProviderRef.current.clearCache();
    const stats = cachedProviderRef.current.getCacheStats();
    return JSON.stringify({ success: true, message: "Cache cleared", previousSize: stats.size });
  },
};
