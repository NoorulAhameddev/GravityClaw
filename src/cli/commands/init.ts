import { writeFileSync, existsSync } from "fs";
import { join } from "path";
import { confirm, input, password, select, c } from "../rich-utils.ts";
import { success, title, section, info } from "../utils.ts";

export async function initCommand(): Promise<void> {
    if (existsSync(join(process.cwd(), ".env"))) {
        const overwrite = await confirm(".env already exists. Overwrite?");
        if (!overwrite) {
            info("Setup cancelled");
            return;
        }
    }

    title("🔧 GravityClaw Setup Wizard");
    info("This will guide you through first-time configuration.\n");

    const name = await input("Project name", "my-agent");
    const providerIdx = await select(
        "Default LLM provider",
        [
            `${c.green("Anthropic Claude")} ${c.dim("(recommended)")}`,
            "OpenAI GPT-4",
            "OpenRouter (multi-provider)",
            "Groq",
            "Google Gemini",
        ],
        0
    );
    const providerMap = ["anthropic", "openai", "openrouter", "groq", "google"];
    const provider = providerMap[providerIdx ?? 0] ?? "anthropic";

    const apiKey = await password(`API key for ${provider}`);

    const features: string[] = [];
    const featureIdx = await select(
        "Enable Telegram bot?",
        ["No", "Yes"],
        0
    );
    if (featureIdx === 1) features.push("telegram");

    const pgIdx = await select(
        "Enable PostgreSQL?",
        ["No (use SQLite)", "Yes"],
        0
    );
    if (pgIdx === 1) features.push("postgres");

    const webhookIdx = await select("Enable webhooks?", ["No", "Yes"], 0);
    if (webhookIdx === 1) features.push("webhooks");

    const envLines: string[] = [
        "# === REQUIRED ===",
        `API_KEY=${apiKey.length >= 32 ? apiKey : apiKey.padEnd(32, "!")}`,
        `LLM_PROVIDER=${provider}`,
        "",
        "# === AI PROVIDER ===",
    ];

    switch (provider) {
        case "anthropic":
            envLines.push(`ANTHROPIC_API_KEY=${apiKey}`);
            break;
        case "openai":
            envLines.push(`OPENAI_API_KEY=${apiKey}`);
            break;
        case "openrouter":
            envLines.push(`OPENROUTER_API_KEY=${apiKey}`);
            break;
        case "groq":
            envLines.push(`GROQ_API_KEY=${apiKey}`);
            break;
        case "google":
            envLines.push(`GOOGLE_API_KEY=${apiKey}`);
            break;
    }

    envLines.push("", "# === OPTIONAL ===");
    if (features.includes("telegram")) {
        envLines.push("TELEGRAM_BOT_TOKEN=your-telegram-bot-token");
        envLines.push("TELEGRAM_ALLOWED_USER_ID=your-telegram-user-id");
    }
    if (features.includes("postgres")) {
        envLines.push("DATABASE_URL=postgres://user:pass@localhost:5432/gravityclaw");
    }
    if (features.includes("webhooks")) {
        envLines.push("WEBHOOK_SECRET=your-webhook-secret");
    }
    envLines.push("", "# === DEFAULTS ===");
    envLines.push("LOG_LEVEL=info");
    envLines.push("AGENT_MAX_ITERATIONS=10");

    writeFileSync(join(process.cwd(), ".env"), envLines.join("\n") + "\n");

    console.log();
    success(`Created .env for "${name}"`);
    info("Next steps:");
    console.log(`  ${c.cyan("npm run dev")}    Start development server`);
    console.log(`  ${c.cyan("npm run cli")}    Run CLI`);
    console.log();
}
