import { describe, it, expect, vi, beforeEach } from "vitest";

const mockOpenAICreate = vi.fn();
const mockOpenAIModelsList = vi.fn();
const mockAnthropicCreate = vi.fn();

vi.mock("openai", () => ({
    default: class {
        chat = { completions: { create: mockOpenAICreate } };
        models = { list: mockOpenAIModelsList };
    },
}));

vi.mock("@anthropic-ai/sdk", () => ({
    default: class {
        messages = { create: mockAnthropicCreate };
    },
}));

import { OpenAIProvider } from "../openai.ts";
import { AnthropicProvider } from "../anthropic.ts";

describe("OpenAI Provider", () => {
    let provider: OpenAIProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        provider = new OpenAIProvider("test-key", "gpt-4o");
    });

    it("should send properly formatted requests and return response", async () => {
        mockOpenAICreate.mockResolvedValue({
            id: "chatcmpl-123",
            choices: [{
                message: { role: "assistant", content: "Hello!", tool_calls: [] },
                finish_reason: "stop",
            }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        });

        const response = await provider.chat(
            [{ role: "user", content: "Hi" }],
            [],
            { model: "gpt-4o" },
        );

        expect(response.text).toBe("Hello!");
        expect(response.stopReason).toBe("stop");
        expect(response.usage?.totalTokens).toBe(15);
    });

    it("should handle API errors gracefully", async () => {
        mockOpenAICreate.mockRejectedValue(new Error("Rate limit exceeded"));

        await expect(provider.chat(
            [{ role: "user", content: "Hi" }],
            [],
        )).rejects.toThrow("Rate limit exceeded");
    });

    it("should include tool definitions when provided", async () => {
        mockOpenAICreate.mockResolvedValue({
            id: "chatcmpl-456",
            choices: [{
                message: {
                    role: "assistant",
                    content: "",
                    tool_calls: [{
                        id: "call_1",
                        type: "function",
                        function: { name: "test_tool", arguments: "{}" },
                    }],
                },
                finish_reason: "tool_calls",
            }],
        });

        const response = await provider.chat(
            [{ role: "user", content: "Use a tool" }],
            [{
                type: "function",
                function: { name: "test_tool", description: "A test tool", parameters: { type: "object", properties: {} } },
            }],
        );

        expect(response.toolCalls).toHaveLength(1);
        expect(response.toolCalls[0]?.function.name).toBe("test_tool");
    });

    it("should list models", async () => {
        mockOpenAIModelsList.mockResolvedValue({
            data: [
                { id: "gpt-4o" },
                { id: "gpt-4-turbo" },
            ],
        });

        const models = await provider.listModels();
        expect(models).toEqual(["gpt-4o", "gpt-4-turbo"]);
    });
});

describe("Anthropic Provider", () => {
    let provider: AnthropicProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        provider = new AnthropicProvider("test-key", "claude-sonnet-4-20250514");
    });

    it("should send properly formatted requests and return response", async () => {
        mockAnthropicCreate.mockResolvedValue({
            id: "msg_123",
            content: [{ type: "text", text: "Hello from Claude!" }],
            stop_reason: "end_turn",
            usage: { input_tokens: 10, output_tokens: 5 },
        });

        const response = await provider.chat(
            [{ role: "user", content: "Hi" }],
            [],
            { model: "claude-sonnet-4-20250514" },
        );

        expect(response.text).toBe("Hello from Claude!");
        expect(response.stopReason).toBe("end_turn");
    });

    it("should handle API errors gracefully", async () => {
        mockAnthropicCreate.mockRejectedValue(new Error("Rate limit exceeded"));

        await expect(provider.chat(
            [{ role: "user", content: "Hi" }],
            [],
        )).rejects.toThrow("Rate limit exceeded");
    });

    it("should handle tool calls in response", async () => {
        mockAnthropicCreate.mockResolvedValue({
            id: "msg_456",
            content: [
                { type: "text", text: "I'll use a tool" },
                {
                    type: "tool_use",
                    id: "toolu_1",
                    name: "test_tool",
                    input: {},
                },
            ],
            stop_reason: "tool_use",
            usage: { input_tokens: 10, output_tokens: 5 },
        });

        const response = await provider.chat(
            [{ role: "user", content: "Use a tool" }],
            [{
                type: "function",
                function: { name: "test_tool", description: "A test tool", parameters: { type: "object", properties: {} } },
            }],
        );

        expect(response.toolCalls).toHaveLength(1);
        expect(response.toolCalls[0]?.function.name).toBe("test_tool");
    });
});
