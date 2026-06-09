import { describe, it, expect, vi, beforeEach } from "vitest";
import OpenAI from "openai";
import { OpenCodeZenProvider } from "../../llm/opencodezen.ts";

const mockCreate = vi.fn();
const mockConstructor = vi.fn();

vi.mock("openai", () => {
  class MockOpenAI {
    constructor(public options: any) {
      mockConstructor(options);
    }
    chat = {
      completions: {
        create: mockCreate,
      },
    };
  }
  return {
    default: MockOpenAI,
    OpenAI: MockOpenAI,
  };
});

describe("OpenCodeZenProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });



  it("should initialize client with provided apiKey and defaults", () => {
    new OpenCodeZenProvider("test-key");
    expect(mockConstructor).toHaveBeenCalledWith({
      apiKey: "test-key",
      baseURL: "https://opencode.ai/zen/v1",
    });
  });

  it("should initialize client with custom baseURL and model", () => {
    new OpenCodeZenProvider("test-key", "custom-model", "https://custom.url");
    expect(mockConstructor).toHaveBeenCalledWith({
      apiKey: "test-key",
      baseURL: "https://custom.url",
    });
  });

  it("should handle text response and return parsed LLMResponse", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: { content: "Hello back!" },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    });

    const provider = new OpenCodeZenProvider("test-key", "minimax-m2.5-free");
    const result = await provider.chat([{ role: "user", content: "Hello!" }], []);

    expect(result).toEqual({
      stopReason: "stop",
      text: "Hello back!",
      toolCalls: [],
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    });
    expect(mockCreate).toHaveBeenCalledWith({
      model: "minimax-m2.5-free",
      max_tokens: 2000,
      messages: [{ role: "user", content: "Hello!" }],
    });
  });

  it("should support tool definitions", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: { name: "get_weather", arguments: '{"location":"New York"}' },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    });

    const provider = new OpenCodeZenProvider("test-key");
    const tool = {
      type: "function" as const,
      function: {
        name: "get_weather",
        description: "Get the current weather",
        parameters: { type: "object", properties: {} },
      },
    };
    const result = await provider.chat([{ role: "user", content: "Weather in NY?" }], [tool]);

    expect(result.stopReason).toBe("tool_calls");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.function.name).toBe("get_weather");
    expect(mockCreate).toHaveBeenCalledWith({
      model: "minimax-m2.5-free",
      max_tokens: 2000,
      tools: [tool],
      tool_choice: "auto",
      messages: [{ role: "user", content: "Weather in NY?" }],
    });
  });

  it("should map thought in history to reasoning_content and extract reasoning_content from response", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: "Hello",
            reasoning_content: "Thinking..."
          },
          finish_reason: "stop",
        },
      ],
    });

    const provider = new OpenCodeZenProvider("test-key");
    const result = await provider.chat(
      [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello", thought: "Thinking history" } as any,
        { role: "user", content: "How are you?" }
      ],
      []
    );

    expect(result.thought).toBe("Thinking...");
    expect(mockCreate).toHaveBeenCalledWith({
      model: "minimax-m2.5-free",
      max_tokens: 2000,
      messages: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello", reasoning_content: "Thinking history" },
        { role: "user", content: "How are you?" }
      ],
    });
  });
});
