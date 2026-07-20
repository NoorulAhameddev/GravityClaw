import type { StreamChunk } from "./types.js";

export async function* parseStream(
    response: Response,
): AsyncGenerator<StreamChunk> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data: ") && trimmed !== "data: [DONE]") {
                try {
                    yield JSON.parse(trimmed.slice(6)) as StreamChunk;
                } catch {
                    // Skip malformed chunks
                }
            }
        }
    }
}
