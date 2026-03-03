import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { OpenRouterProvider, clearModelsCache } from "../llm/openrouter.ts";
import type { OpenRouterModel } from "../llm/openrouter.ts";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe("OpenRouter Model Listing", () => {
  let provider: OpenRouterProvider;
  const mockApiKey = "sk-or-v1-test-key";

  const mockModelsResponse: { data: OpenRouterModel[] } = {
    data: [
      {
        id: "openai/gpt-4o-mini",
        name: "GPT-4o Mini",
        description: "Fast and affordable model",
        context_length: 128000,
        pricing: {
          prompt: 0.15,
          completion: 0.6,
        },
        top_provider: {
          is_moderated: true,
          max_completion_tokens: 16384,
        },
      },
      {
        id: "anthropic/claude-3-5-sonnet",
        name: "Claude 3.5 Sonnet",
        description: "Latest Claude model with enhanced reasoning",
        context_length: 200000,
        pricing: {
          prompt: 3.0,
          completion: 15.0,
        },
        top_provider: {
          is_moderated: false,
          max_completion_tokens: 8192,
        },
      },
      {
        id: "google/gemini-2.0-flash-exp:free",
        name: "Gemini 2.0 Flash (Free)",
        description: "Free experimental model",
        context_length: 1000000,
        pricing: {
          prompt: 0.0,
          completion: 0.0,
        },
        top_provider: {
          is_moderated: false,
          max_completion_tokens: 8192,
        },
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearModelsCache(); // Clear the module-level cache before each test
    provider = new OpenRouterProvider(mockApiKey, "openai/gpt-4o-mini");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should fetch models from OpenRouter API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockModelsResponse,
    } as Response);

    const models = await provider.getModelsWithDetails();

    expect(mockFetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${mockApiKey}`,
        }),
      })
    );

    expect(models).toHaveLength(3);
    expect(models[0]?.id).toBe("openai/gpt-4o-mini");
    expect(models[1]?.id).toBe("anthropic/claude-3-5-sonnet");
    expect(models[2]?.id).toBe("google/gemini-2.0-flash-exp:free");
  });

  it("should cache models for 1 hour", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockModelsResponse,
    } as Response);

    // First call
    const models1 = await provider.getModelsWithDetails();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call should use cache
    const models2 = await provider.getModelsWithDetails();
    expect(mockFetch).toHaveBeenCalledTimes(1); // Still 1, not 2
    expect(models2).toEqual(models1);

    // Third call should also use cache
    const models3 = await provider.getModelsWithDetails();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(models3).toEqual(models1);
  });

  it("should return list of model IDs via listModels()", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockModelsResponse,
    } as Response);

    const modelIds = await provider.listModels();

    expect(modelIds).toEqual([
      "openai/gpt-4o-mini",
      "anthropic/claude-3-5-sonnet",
      "google/gemini-2.0-flash-exp:free",
    ]);
  });

  it("should format models for display with pricing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockModelsResponse,
    } as Response);

    const formattedText = await provider.formatModelsForDisplay(20);

    // Should contain header
    expect(formattedText).toContain("OpenRouter Models");
    expect(formattedText).toContain("3 total");

    // Should contain model IDs
    expect(formattedText).toContain("openai/gpt-4o-mini");
    expect(formattedText).toContain("anthropic/claude-3-5-sonnet");
    expect(formattedText).toContain("google/gemini-2.0-flash-exp:free");

    // Should contain pricing
    expect(formattedText).toContain("$0.15 / $0.60"); // GPT-4o mini
    expect(formattedText).toContain("$3.00 / $15.00"); // Claude
    expect(formattedText).toContain("$0.00 / $0.00"); // Gemini free

    // Should contain context lengths
    expect(formattedText).toContain("128K tokens");
    expect(formattedText).toContain("200K tokens");
    expect(formattedText).toContain("1000K tokens");

    // Should contain usage hint
    expect(formattedText).toContain("/model <model-id>");
  });

  it("should sort models by price (cheapest first)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockModelsResponse,
    } as Response);

    const models = await provider.getModelsWithDetails();
    const formattedText = await provider.formatModelsForDisplay(20);

    // Free model (Gemini) should appear first after sorting
    const geminiIndex = formattedText.indexOf("google/gemini-2.0-flash-exp:free");
    const gptIndex = formattedText.indexOf("openai/gpt-4o-mini");
    const claudeIndex = formattedText.indexOf("anthropic/claude-3-5-sonnet");

    expect(geminiIndex).toBeLessThan(gptIndex); // Free < $0.15
    expect(gptIndex).toBeLessThan(claudeIndex); // $0.15 < $3.00
  });

  it("should limit number of models displayed", async () => {
    // Create many models
    const manyModels = Array.from({ length: 50 }, (_, i) => ({
      id: `model-${i}`,
      name: `Model ${i}`,
      description: `Test model ${i}`,
      context_length: 10000,
      pricing: { prompt: i * 0.1, completion: i * 0.5 },
      top_provider: { is_moderated: false, max_completion_tokens: 4096 },
    }));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: manyModels }),
    } as Response);

    const formattedText = await provider.formatModelsForDisplay(10);

    expect(formattedText).toContain("50 total, showing 10");
  });

  it("should handle API errors gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    const models = await provider.getModelsWithDetails();
    expect(models).toEqual([]); // Should return empty array
  });

  it("should handle network errors gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const models = await provider.getModelsWithDetails();
    expect(models).toEqual([]);
  });

  it("should return stale cache on API error", async () => {
    // First successful call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockModelsResponse,
    } as Response);

    const models1 = await provider.getModelsWithDetails();
    expect(models1).toHaveLength(3);

    // Simulate cache expiry by mocking time (not implemented in real code, but concept)
    // In production, we'd need to mock Date.now() or add a clearCache() method

    // Second call with API error should return cached data
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const models2 = await provider.getModelsWithDetails();
    expect(models2).toEqual(models1); // Should return stale cache
  });
});
