import { db } from "../../db.ts";
import { getSessionSettings, setSessionSettings } from "../../session.ts";
import { pruneContext } from "../../memory/pruning.ts";
import { createProvider } from "../../llm/index.ts";
import { config } from "../../config.ts";

async function testPruningSettings() {
    console.log("--- Testing Settings Preservation during Pruning ---");
    const sessionId = "test-pruning:999";

    // Clear existing
    db.prepare("DELETE FROM memory WHERE session_id = ?").run(sessionId);

    // Set some settings
    const initialSettings = { model: "test-model", thinkingLevel: "high" as const };
    setSessionSettings(sessionId, initialSettings);

    // Add 20 dummy messages to trigger pruning min count
    for (let i = 0; i < 22; i++) {
        const msg = { role: "user", content: `Message ${i}` };
        db.prepare("INSERT INTO memory (session_id, message_json, settings) VALUES (?, ?, ?)")
            .run(sessionId, JSON.stringify(msg), JSON.stringify(initialSettings));
    }

    console.log("History length before pruning:", (db.prepare("SELECT count(*) as count FROM memory WHERE session_id = ?").get(sessionId) as any).count);

    // Force prune (mocking usage to 100%)
    await pruneContext(sessionId, "gpt-4o", { contextThreshold: 0 });

    // Check settings in remaining rows
    const settings = getSessionSettings(sessionId);
    console.log("Settings after pruning:", JSON.stringify(settings));

    if (settings.model === "test-model" && settings.thinkingLevel === "high") {
        console.log("✅ SUCCESS: Settings preserved!");
    } else {
        console.log("❌ FAILURE: Settings lost!");
    }
}

async function testNonMutatingOverrides() {
    console.log("\n--- Testing Non-Mutating Overrides ---");
    const originalProvider = config.LLM_PROVIDER;
    const originalModel = config.LLM_MODEL;

    console.log(`Initial Config: ${originalProvider} / ${originalModel}`);

    try {
        const provider = createProvider({ provider: "groq", model: "llama3-70b" });
        console.log(`Created Provider: ${provider.name}`);
    } catch (err) {
        console.log(`Provider creation failed as expected: ${err instanceof Error ? err.message : String(err)}`);
    }

    console.log(`Config After Creation: ${config.LLM_PROVIDER} / ${config.LLM_MODEL}`);

    if (config.LLM_PROVIDER === originalProvider && config.LLM_MODEL === originalModel) {
        console.log("✅ SUCCESS: Global config was NOT mutated!");
    } else {
        console.log("❌ FAILURE: Global config WAS mutated!");
    }
}

async function main() {
    await testPruningSettings();
    await testNonMutatingOverrides();
}

main().catch(console.error);
