/**
 * Config command - view and validate configuration.
 */

import { config } from "../../config.ts";
import { success, section, title, printTable, dim } from "../utils.ts";

export async function configCommand(): Promise<void> {
    title("⚙️  Gravity Claw Configuration");

    // Core settings
    section("Core Settings");
    const coreConfig = [
        ["LLM_PROVIDER", config.LLM_PROVIDER],
        ["LLM_MODEL", config.LLM_MODEL || dim("(default)")],
        ["AGENT_MAX_ITERATIONS", config.AGENT_MAX_ITERATIONS.toString()],
        ["LOG_LEVEL", config.LOG_LEVEL],
    ];

    printTable(coreConfig, [
        { header: "Setting", width: 25 },
        { header: "Value", width: 50 },
    ]);

    console.log();

    // Channel settings
    section("Channels");
    const channelConfig = [
        ["Telegram", config.TELEGRAM_BOT_TOKEN ? "✓ Configured" : dim("Not configured")],
        ["WhatsApp", config.WHATSAPP_ENABLED ? "✓ Enabled" : dim("Disabled")],
    ];

    printTable(channelConfig, [
        { header: "Channel", width: 20 },
        { header: "Status", width: 30 },
    ]);

    console.log();

    // Feature flags
    section("Features");
    const featureConfig: string[][] = [];
    
    // Dynamically check for features that exist in config
    if (config.WAKE_WORD_ENABLED) {
        featureConfig.push(["Wake Word Detection", "✓ Enabled"]);
    }
    if (config.WHATSAPP_ENABLED) {
        featureConfig.push(["WhatsApp Channel", "✓ Enabled"]);
    }
    if (config.SEARCH_PROVIDER) {
        featureConfig.push(["Web Search", `✓ ${config.SEARCH_PROVIDER}`]);
    }
    
    if (featureConfig.length === 0) {
        featureConfig.push([dim("No optional features enabled"), ""]);
    }

    printTable(featureConfig, [
        { header: "Feature", width: 25 },
        { header: "Status", width: 30 },
    ]);

    console.log();

    success("Configuration loaded successfully");
}
