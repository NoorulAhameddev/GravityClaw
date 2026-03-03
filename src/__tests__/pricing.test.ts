import { describe, it, expect } from "vitest";
import {
  getModelPricing,
  calculateCost,
  formatCost,
  isApproachingContextLimit,
  MODEL_PRICING,
} from "../llm/pricing.ts";

describe("LLM Pricing", () => {
  describe("getModelPricing", () => {
    it("should return pricing for known models", () => {
      const gpt4Pricing = getModelPricing("gpt-4o");
      expect(gpt4Pricing.inputPrice).toBe(2.50);
      expect(gpt4Pricing.outputPrice).toBe(10.00);
      expect(gpt4Pricing.contextWindow).toBe(128000);
    });

    it("should handle models with provider prefix", () => {
      const pricing = getModelPricing("openai/gpt-4o");
      expect(pricing.inputPrice).toBe(2.50);
      expect(pricing.outputPrice).toBe(10.00);
    });

    it("should return fallback pricing for unknown models", () => {
      const unknownPricing = getModelPricing("unknown-model-9000");
      expect(unknownPricing.inputPrice).toBe(1.00);
      expect(unknownPricing.outputPrice).toBe(3.00);
      expect(unknownPricing.contextWindow).toBe(32000);
    });

    it("should handle fuzzy matching for versioned models", () => {
      const pricing = getModelPricing("gpt-4-0613");
      expect(pricing.inputPrice).toBe(30.00); // Should match gpt-4
      expect(pricing.outputPrice).toBe(60.00);
    });

    it("should return zero cost for Ollama local models", () => {
      const llamaPricing = getModelPricing("llama3.2");
      expect(llamaPricing.inputPrice).toBe(0);
      expect(llamaPricing.outputPrice).toBe(0);
    });

    it("should return zero cost for free OpenRouter models", () => {
      const freePricing = getModelPricing("meta-llama/llama-3.2-3b-instruct:free");
      expect(freePricing.inputPrice).toBe(0);
      expect(freePricing.outputPrice).toBe(0);
    });
  });

  describe("calculateCost", () => {
    it("should calculate cost correctly for GPT-4o", () => {
      const cost = calculateCost("gpt-4o", 1000, 500);
      // (1000 / 1M * 2.50) + (500 / 1M * 10.00)
      // = 0.0025 + 0.005
      // = 0.0075
      expect(cost).toBeCloseTo(0.0075, 6);
    });

    it("should calculate cost correctly for Claude", () => {
      const cost = calculateCost("claude-3-5-sonnet", 10000, 5000);
      // (10000 / 1M * 3.00) + (5000 / 1M * 15.00)
      // = 0.03 + 0.075
      // = 0.105
      expect(cost).toBeCloseTo(0.105, 6);
    });

    it("should return zero cost for free models", () => {
      const cost = calculateCost("llama3.2", 100000, 50000);
      expect(cost).toBe(0);
    });

    it("should handle large token counts", () => {
      const cost = calculateCost("gpt-3.5-turbo", 1000000, 500000);
      // (1M / 1M * 0.50) + (500k / 1M * 1.50)
      // = 0.50 + 0.75
      // = 1.25
      expect(cost).toBeCloseTo(1.25, 2);
    });

    it("should handle zero tokens", () => {
      const cost = calculateCost("gpt-4o", 0, 0);
      expect(cost).toBe(0);
    });
  });

  describe("formatCost", () => {
    it("should format zero cost", () => {
      expect(formatCost(0)).toBe("$0.00");
    });

    it("should format very small costs with 4 decimals", () => {
      expect(formatCost(0.0012)).toBe("$0.0012");
      expect(formatCost(0.00056)).toBe("$0.0006");
    });

    it("should format small costs with 3 decimals", () => {
      expect(formatCost(0.025)).toBe("$0.025");
      expect(formatCost(0.5)).toBe("$0.500");
    });

    it("should format larger costs with 2 decimals", () => {
      expect(formatCost(1.5)).toBe("$1.50");
      expect(formatCost(15.75)).toBe("$15.75");
      expect(formatCost(100)).toBe("$100.00");
    });
  });

  describe("isApproachingContextLimit", () => {
    it("should return false for small token counts", () => {
      const result = isApproachingContextLimit(1000, "gpt-4o");
      expect(result).toBe(false);
    });

    it("should return true when approaching limit (80% default)", () => {
      // GPT-4o has 128k context window, 80% = 102,400
      const result = isApproachingContextLimit(110000, "gpt-4o");
      expect(result).toBe(true);
    });

    it("should respect custom threshold", () => {
      // 50% of 128k = 64k
      const result = isApproachingContextLimit(70000, "gpt-4o", 0.5);
      expect(result).toBe(true);
    });

    it("should return false when below threshold", () => {
      const result = isApproachingContextLimit(50000, "gpt-4o", 0.8);
      expect(result).toBe(false);
    });

    it("should handle models with different context windows", () => {
      // Claude has 200k context window
      const result = isApproachingContextLimit(160001, "claude-3-5-sonnet", 0.8);
      expect(result).toBe(true); // 80% of 200k = 160k
    });
  });

  describe("MODEL_PRICING database", () => {
    it("should have entries for major providers", () => {
      expect(MODEL_PRICING["gpt-4o"]).toBeDefined();
      expect(MODEL_PRICING["claude-3-5-sonnet"]).toBeDefined();
      expect(MODEL_PRICING["gemini-1.5-pro"]).toBeDefined();
      expect(MODEL_PRICING["llama-3.3-70b-versatile"]).toBeDefined();
    });

    it("should have consistent pricing structure", () => {
      for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
        expect(pricing.inputPrice).toBeGreaterThanOrEqual(0);
        expect(pricing.outputPrice).toBeGreaterThanOrEqual(0);
        expect(pricing.contextWindow).toBeGreaterThan(0);
        expect(typeof pricing.inputPrice).toBe("number");
        expect(typeof pricing.outputPrice).toBe("number");
        expect(typeof pricing.contextWindow).toBe("number");
      }
    });

    it("should have output price >= input price for all models", () => {
      for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
        expect(pricing.outputPrice).toBeGreaterThanOrEqual(pricing.inputPrice);
      }
    });
  });

  describe("Realistic cost scenarios", () => {
    it("should calculate realistic costs for typical GPT-4 usage", () => {
      // Typical conversation: ~2000 prompt, ~500 completion
      const cost = calculateCost("gpt-4o", 2000, 500);
      expect(cost).toBeLessThanOrEqual(0.01); // Should be less than or equal to 1 cent
      expect(cost).toBeGreaterThan(0.001); // But more than 0.1 cents
    });

    it("should show Claude is more expensive for same tokens", () => {
      const gptCost = calculateCost("gpt-4o-mini", 10000, 5000);
      const claudeCost = calculateCost("claude-3-haiku", 10000, 5000);
      
      // Claude Haiku should be more expensive than GPT-4o-mini
      expect(claudeCost).toBeGreaterThan(gptCost);
    });

    it("should show local models are free", () => {
      const localCost = calculateCost("llama3.2", 100000, 50000);
      const cloudCost = calculateCost("gpt-4o", 100000, 50000);
      
      expect(localCost).toBe(0);
      expect(cloudCost).toBeGreaterThan(0);
    });

    it("should calculate costs for long documents", () => {
      // Processing a 50k token document with 10k response
      const cost = calculateCost("gpt-4o-mini", 50000, 10000);
      expect(cost).toBeLessThan(0.02); // Should be cheap with mini model
    });
  });
});
