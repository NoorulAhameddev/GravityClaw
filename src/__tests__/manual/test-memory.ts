import { runAgent } from "../../agent.ts";
import { db } from "../../db.ts";

async function main() {
    const sessionId = "test-session:123";

    console.log("--- TEST 1: Sending first message ---");
    const result1 = await runAgent({
        message: "My favorite color is neon green. Please remember this.",
        sessionId,
    });
    console.log("Agent Reply 1:", result1.text);

    console.log("\n--- TEST 2: Sending second message in new run ---");
    const result2 = await runAgent({
        message: "What is my favorite color?",
        sessionId,
    });
    console.log("Agent Reply 2:", result2.text);

    console.log("\n--- DB VERIFICATION ---");
    // Verify it actually saved to the database
    const rows = db.prepare("SELECT * FROM memory WHERE session_id = ?").all(sessionId);
    console.log(`Found ${rows.length} rows in the DB for this session.`);
}

main().catch(console.error);
