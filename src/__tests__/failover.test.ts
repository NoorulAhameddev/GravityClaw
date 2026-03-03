import { describe, it, expect, beforeEach } from "vitest";
import { FailoverProvider } from "../llm/failover.ts";
import type { LLMProvider, LLMResponse } from "../llm/base.ts";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions.js";

// Mock provider for testing
class MockProvider implements LLMProvider {
  public name: string;
  private shouldFail: boolean;
  private failureMessage: string;
  private callCount: number;

  constructor(name: string, shouldFail = false, failureMessage = "Mock failure") {
    this.name = name;
    this.shouldFail = shouldFail;
    this.failureMessage = failureMessage;
    this.callCount = 0;
  }

  setShouldFail(shouldFail: boolean, message?: string): void {
    this.shouldFail = shouldFail;
    if (message) this.failureMessage = message;
  }

  getCallCount(): number {
    return this.callCount;
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[]
  ): Promise<LLMResponse> {
    this.callCount++;

    if (this.shouldFail) {
      throw new Error(this.failureMessage);
    }

    return {
      text: `Response from ${this.name}`,
      stopReason: "stop",
      toolCalls: [],
      usage: {
        promptTokens: 10,
        completionTokens: 10,
        totalTokens: 20,
      },
    };
  }

  async listModels(): Promise<string[]> {
    return [`${this.name}-model-1`, `${this.name}-model-2`];
  }

  countTokens(messages: ChatCompletionMessageParam[]): number {
    const totalChars = messages.reduce((sum, m) => {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return sum + content.length;
    }, 0);
    return Math.ceil(totalChars / 4);
  }
}

describe("FailoverProvider", () => {
  let provider1: MockProvider;
  let provider2: MockProvider;
  let provider3: MockProvider;

  beforeEach(() => {
    provider1 = new MockProvider("provider1");
    provider2 = new MockProvider("provider2");
    provider3 = new MockProvider("provider3");
  });

  it("should initialize with multiple providers", () => {
    const failover = new FailoverProvider([provider1, provider2, provider3]);
    expect(failover.name).toBe("failover");
    
    const health = failover.getHealthStatus();
    expect(health).toHaveLength(3);
    expect(health[0]?.name).toBe("provider1");
    expect(health[1]?.name).toBe("provider2");
    expect(health[2]?.name).toBe("provider3");
  });

  it("should throw if no providers given", () => {
    expect(() => new FailoverProvider([])).toThrow("requires at least one provider");
  });

  it("should use primary provider when available", async () => {
    const failover = new FailoverProvider([provider1, provider2]);
    
    const response = await failover.chat([{ role: "user", content: "test" }], []);
    
    expect(response.text).toBe("Response from provider1");
    expect(provider1.getCallCount()).toBe(1);
    expect(provider2.getCallCount()).toBe(0);
  });

  it("should failover to second provider when first fails", async () => {
    provider1.setShouldFail(true, "Rate limit 429");
    const failover = new FailoverProvider([provider1, provider2]);
    
    const response = await failover.chat([{ role: "user", content: "test" }], []);
    
    expect(response.text).toBe("Response from provider2");
    expect(provider1.getCallCount()).toBe(1);
    expect(provider2.getCallCount()).toBe(1);
  });

  it("should failover through multiple providers", async () => {
    provider1.setShouldFail(true, "Timeout");
    provider2.setShouldFail(true, "Network error");
    
    const failover = new FailoverProvider([provider1, provider2, provider3]);
    
    const response = await failover.chat([{ role: "user", content: "test" }], []);
    
    expect(response.text).toBe("Response from provider3");
    expect(provider1.getCallCount()).toBe(1);
    expect(provider2.getCallCount()).toBe(1);
    expect(provider3.getCallCount()).toBe(1);
  });

  it("should throw if all providers fail", async () => {
    provider1.setShouldFail(true, "Rate limit 429");
    provider2.setShouldFail(true, "Timeout error");
    provider3.setShouldFail(true, "Service unavailable");
    
    const failover = new FailoverProvider([provider1, provider2, provider3]);
    
    await expect(
      failover.chat([{ role: "user", content: "test" }], [])
    ).rejects.toThrow("Service unavailable");
  });

  it("should open circuit breaker after consecutive failures", async () => {
    provider1.setShouldFail(true, "Rate limit 429");
    const failover = new FailoverProvider([provider1, provider2], {
      maxConsecutiveFailures: 3,
    });
    
    // First 3 failures should trigger circuit breaker
    await failover.chat([{ role: "user", content: "test 1" }], []);
    await failover.chat([{ role: "user", content: "test 2" }], []);
    await failover.chat([{ role: "user", content: "test 3" }], []);
    
    const health = failover.getHealthStatus();
    const provider1Health = health.find((h) => h.name === "provider1");
    
    expect(provider1Health?.isCircuitOpen).toBe(true);
    expect(provider1Health?.consecutiveFailures).toBe(3);
    
    // Fourth call should skip provider1 entirely
    provider1.setShouldFail(false); // Even if provider1 is fixed
    await failover.chat([{ role: "user", content: "test 4" }], []);
    
    // Provider1 should not be called (circuit open)
    expect(provider1.getCallCount()).toBe(3); // Not 4
    expect(provider2.getCallCount()).toBe(4); // All requests went to provider2
  });

  it("should reset circuit breaker on success", async () => {
    provider1.setShouldFail(true, "503 service unavailable");
    const failover = new FailoverProvider([provider1, provider2]);
    
    // Fail twice
    await failover.chat([{ role: "user", content: "test 1" }], []);
    await failover.chat([{ role: "user", content: "test 2" }], []);
    
    let health = failover.getHealthStatus();
    let provider1Health = health.find((h) => h.name === "provider1");
    expect(provider1Health?.consecutiveFailures).toBe(2);
    
    // Fix provider1 and make successful call
    provider1.setShouldFail(false);
    await failover.chat([{ role: "user", content: "test 3" }], []);
    
    health = failover.getHealthStatus();
    provider1Health = health.find((h) => h.name === "provider1");
    expect(provider1Health?.consecutiveFailures).toBe(0);
    expect(provider1Health?.totalSuccesses).toBe(1);
  });

  it("should track success and failure counts", async () => {
    provider1.setShouldFail(true, "Network error ECONNREFUSED");
    const failover = new FailoverProvider([provider1, provider2], {
      maxConsecutiveFailures: 10, // High threshold to prevent circuit breaker from opening
    });
    
    // Make 5 calls (all will fail to provider1, succeed on provider2)
    for (let i = 0; i < 5; i++) {
      await failover.chat([{ role: "user", content: `test ${i}` }], []);
    }
    
    const health = failover.getHealthStatus();
    const provider1Health = health.find((h) => h.name === "provider1");
    const provider2Health = health.find((h) => h.name === "provider2");
    
    expect(provider1Health?.totalCalls).toBe(5);
    expect(provider1Health?.totalFailures).toBe(5);
    expect(provider1Health?.totalSuccesses).toBe(0);
    
    expect(provider2Health?.totalCalls).toBe(5);
    expect(provider2Health?.totalFailures).toBe(0);
    expect(provider2Health?.totalSuccesses).toBe(5);
  });

  it("should not retry on non-retryable errors", async () => {
    provider1.setShouldFail(true, "Invalid API key"); // Non-retryable
    const failover = new FailoverProvider([provider1, provider2]);
    
    await expect(
      failover.chat([{ role: "user", content: "test" }], [])
    ).rejects.toThrow("Invalid API key");
    
    // Should not have tried provider2
    expect(provider1.getCallCount()).toBe(1);
    expect(provider2.getCallCount()).toBe(0);
  });

  it("should retry on rate limit errors (429)", async () => {
    provider1.setShouldFail(true, "HTTP 429 rate limit exceeded");
    const failover = new FailoverProvider([provider1, provider2]);
    
    const response = await failover.chat([{ role: "user", content: "test" }], []);
    
    expect(response.text).toBe("Response from provider2");
    expect(provider1.getCallCount()).toBe(1);
    expect(provider2.getCallCount()).toBe(1);
  });

  it("should retry on timeout errors", async () => {
    provider1.setShouldFail(true, "Request timed out");
    const failover = new FailoverProvider([provider1, provider2]);
    
    const response = await failover.chat([{ role: "user", content: "test" }], []);
    
    expect(response.text).toBe("Response from provider2");
    expect(provider1.getCallCount()).toBe(1);
    expect(provider2.getCallCount()).toBe(1);
  });

  it("should list models from primary provider", async () => {
    const failover = new FailoverProvider([provider1, provider2]);
    
    const models = await failover.listModels();
    
    expect(models).toEqual(["provider1-model-1", "provider1-model-2"]);
  });

  it("should count tokens using primary provider", async () => {
    const failover = new FailoverProvider([provider1, provider2]);
    
    const count = failover.countTokens([{ role: "user", content: "Hello world" }]);
    
    expect(count).toBe(3); // "Hello world".length / 4 = 11 / 4 = 2.75 -> 3
  });
});
