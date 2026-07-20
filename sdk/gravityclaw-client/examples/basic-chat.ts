import { GravityClawClient } from "@gravityclaw/client";

const client = new GravityClawClient({
    baseUrl: process.env.GRAVITYCLAW_URL || "http://localhost:3000",
    apiKey: process.env.GRAVITYCLAW_API_KEY || "",
});

async function main() {
    const sessions = await client.listSessions();
    console.log("Sessions:", sessions);

    const sessionId = sessions[0]?.id || "test-session";
    const response = await client.chat(sessionId, "Hello, who are you?");
    console.log("Response:", response);
}

main().catch(console.error);
