import type { LLMProvider, LLMResponse, LLMChatOptions } from "../types/llm.js";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions.js";

export interface StreamChunk {
    type: "text" | "tool_call" | "error" | "done";
    content?: string;
    toolCall?: { name: string; args: string; id: string };
    error?: string;
}

export type StreamHandler = (chunk: StreamChunk) => void;

export async function streamResponse(
    provider: LLMProvider,
    messages: ChatCompletionMessageParam[],
    toolDefinitions: ChatCompletionTool[],
    options?: LLMChatOptions,
    onChunk?: StreamHandler
): Promise<LLMResponse> {
    if (provider.chatStream) {
        const chunks: StreamChunk[] = [];
        const response = await provider.chatStream(messages, toolDefinitions, {
            ...options,
            onToken: (token: string, done: boolean) => {
                const chunk: StreamChunk = done
                    ? { type: "done" }
                    : { type: "text", content: token };
                chunks.push(chunk);
                onChunk?.(chunk);
            },
        });
        if (!chunks.some(c => c.type === "done")) {
            const done: StreamChunk = { type: "done" };
            onChunk?.(done);
        }
        return response;
    }

    const response = await provider.chat(messages, toolDefinitions, options);
    const text: StreamChunk = { type: "text", content: response.text };
    onChunk?.(text);
    const done: StreamChunk = { type: "done" };
    onChunk?.(done);
    return response;
}

export function createSSEHandler(
    res: { writeHead: (status: number, headers: Record<string, string>) => void; write: (data: string) => void; end: () => void }
): StreamHandler {
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
    });

    return (chunk: StreamChunk) => {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        if (chunk.type === "done") {
            res.write("data: [DONE]\n\n");
            res.end();
        }
    };
}
