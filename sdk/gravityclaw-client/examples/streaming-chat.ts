import { GravityClawClient } from "@gravityclaw/client";

const client = new GravityClawClient({
    baseUrl: process.env.GRAVITYCLAW_URL || "http://localhost:3000",
    apiKey: process.env.GRAVITYCLAW_API_KEY || "",
});

async function main() {
    for await (const chunk of client.chatStream("test-session", "Write a poem")) {
        if (chunk.type === "text") {
            process.stdout.write(chunk.content || "");
        } else if (chunk.type === "done") {
            console.log("\n[DONE]");
        } else if (chunk.type === "error") {
            console.error("\n[ERROR]", chunk.error);
        }
    }
}

main().catch(console.error);
