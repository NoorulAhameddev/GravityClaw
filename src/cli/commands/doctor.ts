/**
 * Doctor command - diagnose system health and configuration.
 */

import { existsSync } from "fs";
import { resolve } from "path";
import { config } from "../../config.ts";
import { db } from "../../db.ts";
import { registry, registerBuiltInTools } from "../../tools/index.ts";
import { success, error, warn, info, title, section, printTable, dim } from "../utils.ts";

export async function doctorCommand(): Promise<void> {
    title("🏥 Gravity Claw Health Check");

    // Register tools before checking
    registerBuiltInTools();

    let hasErrors = false;
    let hasWarnings = false;

    // Check 1: Environment Configuration
    section("Environment Configuration");

    const requiredEnvVars = ["LLM_PROVIDER"];
    const optionalEnvVars = ["TELEGRAM_BOT_TOKEN", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"];

    for (const envVar of requiredEnvVars) {
        if (process.env[envVar]) {
            success(`${envVar} is set`);
        } else {
            error(`${envVar} is missing`);
            hasErrors = true;
        }
    }

    for (const envVar of optionalEnvVars) {
        if (process.env[envVar]) {
            success(`${envVar} is set`);
        } else {
            info(`${envVar} is not set ${dim("(optional)")}`);
        }
    }

    console.log();

    // Check 2: Database
    section("Database");

    try {
        const dbPath = resolve("gravity.db");
        if (existsSync(dbPath)) {
            success(`Database exists at ${dbPath}`);

            // Check tables
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
            success(`Found ${tables.length} tables`);

            // Check session count
            const sessionCount = db.prepare("SELECT COUNT(*) as count FROM memory").get() as { count: number };
            info(`Sessions in database: ${sessionCount.count}`);
        } else {
            warn("Database file not found (will be created on first run)");
            hasWarnings = true;
        }
    } catch (err) {
        error(`Database check failed: ${err instanceof Error ? err.message : String(err)}`);
        hasErrors = true;
    }

    console.log();

    // Check 3: Tools Registry
    section("Tools Registry");

    try {
        const toolCount = registry.getOpenAIDefinitions().length;
        success(`${toolCount} tools registered`);

        if (toolCount === 0) {
            warn("No tools registered - agent functionality will be limited");
            hasWarnings = true;
        }
    } catch (err) {
        error(`Tools registry check failed: ${err instanceof Error ? err.message : String(err)}`);
        hasErrors = true;
    }

    console.log();

    // Check 4: LLM Provider Configuration
    section("LLM Provider");

    try {
        info(`Provider: ${config.LLM_PROVIDER}`);
        info(`Model: ${config.LLM_MODEL || dim("(default)")}`);

        // Check provider-specific requirements
        const provider = config.LLM_PROVIDER;
        const providerChecks: Record<string, { key: string; name: string }> = {
            openai: { key: "OPENAI_API_KEY", name: "OpenAI" },
            anthropic: { key: "ANTHROPIC_API_KEY", name: "Anthropic" },
            google: { key: "GOOGLE_API_KEY", name: "Google" },
            groq: { key: "GROQ_API_KEY", name: "Groq" },
            deepseek: { key: "DEEPSEEK_API_KEY", name: "DeepSeek" },
            openrouter: { key: "OPENROUTER_API_KEY", name: "OpenRouter" },
        };

        if (provider in providerChecks && provider !== "ollama") {
            const check = providerChecks[provider];
            if (check) {
                if (process.env[check.key]) {
                    success(`${check.name} API key configured`);
                } else {
                    error(`${check.name} selected but ${check.key} not set`);
                    hasErrors = true;
                }
            }
        } else if (provider === "ollama") {
            info("Ollama (local) - no API key required");
        }
    } catch (err) {
        error(`LLM provider check failed: ${err instanceof Error ? err.message : String(err)}`);
        hasErrors = true;
    }

    console.log();

    // Check 5: File Paths
    section("File Paths");

    const pathsToCheck = [
        { path: "skills", description: "Skills directory" },
        { path: "memory-files", description: "Memory files directory" },
        { path: "logs", description: "Logs directory" },
    ];

    for (const { path, description } of pathsToCheck) {
        if (existsSync(path)) {
            success(`${description}: ${path}`);
        } else {
            warn(`${description} not found: ${path} ${dim("(will be created if needed)")}`);
            hasWarnings = true;
        }
    }

    console.log();

    // Check 6: Node.js Version
    section("Runtime");

    const nodeVersion = process.version;
    const [major] = nodeVersion.slice(1).split(".").map(Number);

    info(`Node.js: ${nodeVersion}`);

    if (major && major >= 20) {
        success("Node.js version meets requirements (≥20)");
    } else {
        error(`Node.js version ${nodeVersion} is too old. Requires ≥20.0.0`);
        hasErrors = true;
    }

    console.log();

    // Summary
    title("Summary");

    if (hasErrors) {
        error("Health check failed - please fix the errors above");
        process.exitCode = 1;
    } else if (hasWarnings) {
        warn("Health check passed with warnings");
    } else {
        success("All checks passed! Gravity Claw is ready to run");
    }
}
