/**
 * Cost CLI command - display usage costs and pricing information.
 */

import { calculateCost, formatCost, getModelPricing, MODEL_PRICING } from "../../llm/pricing.ts";
import { getUsageStats } from "../../usage.ts";
import type { UsageStats } from "../../usage.ts";
import { success, error, info, title, section, printTable, dim, bold } from "../utils.ts";

export async function costCommand(options: {
    period?: string;
    detailed?: boolean;
    model?: string;
} = {}): Promise<void> {
    const period = options.period ?? "all";
    const detailed = options.detailed ?? false;
    const model = options.model;

    if (model) {
        await showModelPricing(model);
    } else {
        await showUsageCost(period, detailed);
    }
}

async function showModelPricing(modelName: string): Promise<void> {
    const pricing = getModelPricing(modelName);

    title(`💰 Model Pricing: ${modelName}`);

    section("Pricing (per 1M tokens)");
    printTable([
        ["Input", `$${pricing.inputPrice.toFixed(2)}`],
        ["Output", `$${pricing.outputPrice.toFixed(2)}`],
        ["Context Window", `${(pricing.contextWindow / 1000).toLocaleString()}K tokens`],
    ], [
        { header: "Type", width: 15 },
        { header: "Price", width: 25 },
    ]);

    console.log();
    section("Example Costs");
    
    // Calculate example costs
    const examples = [
        { tokens: 1000, label: "1K tokens" },
        { tokens: 10000, label: "10K tokens" },
        { tokens: 100000, label: "100K tokens" },
    ];

    for (const ex of examples) {
        const inputCost = calculateCost(modelName, ex.tokens, ex.tokens);
        info(`${ex.label} in/out: ${formatCost(inputCost)}`);
    }
}

async function showUsageCost(period: string, detailed: boolean): Promise<void> {
    let since: Date | undefined;
    
    if (period !== "all") {
        const ms = period === "day" ? 24 * 60 * 60 * 1000
            : period === "week" ? 7 * 24 * 60 * 60 * 1000
            : period === "month" ? 30 * 24 * 60 * 60 * 1000
            : 0;
        since = new Date(Date.now() - ms);
    }

    const stats = getUsageStats(undefined, since);
    
    const periodLabel = period === "all" ? "All Time"
        : period === "day" ? "Last 24 Hours"
        : period === "week" ? "Last 7 Days"
        : "Last 30 Days";

    title(`💰 GravityClaw Usage Cost`);

    section(periodLabel);

    if (stats.totalCalls === 0) {
        info("No usage data recorded yet. Start chatting to track costs.");
        return;
    }

    printTable([
        ["Total API Calls", stats.totalCalls.toLocaleString()],
        ["Total Tokens", stats.totalTokens.toLocaleString()],
        ["  Input", stats.totalPromptTokens.toLocaleString()],
        ["  Output", stats.totalCompletionTokens.toLocaleString()],
        ["Total Cost", formatCost(stats.totalCost)],
    ], [
        { header: "Metric", width: 20 },
        { header: "Value", width: 25 },
    ]);

    console.log();

    if (detailed && stats.models.length > 0) {
        section("Cost by Model");

        const rows = stats.models.map(m => [
            m.model,
            m.calls.toLocaleString(),
            m.tokens.toLocaleString(),
            formatCost(m.cost),
            `${((m.cost / stats.totalCost) * 100).toFixed(1)}%`,
        ]);

        printTable(rows, [
            { header: "Model", width: 30 },
            { header: "Calls", width: 10, align: "right" },
            { header: "Tokens", width: 15, align: "right" },
            { header: "Cost", width: 12, align: "right" },
            { header: "Share", width: 10, align: "right" },
        ]);
    }

    console.log();
    
    // Show daily average
    const days = period === "day" ? 1 : period === "week" ? 7 : period === "month" ? 30 : 30;
    const dailyCost = stats.totalCost / days;
    const dailyCalls = Math.round(stats.totalCalls / days);
    
    section("Daily Average");
    printTable([
        ["Daily Cost", formatCost(dailyCost)],
        ["Daily Calls", dailyCalls.toLocaleString()],
    ], [
        { header: "Metric", width: 15 },
        { header: "Value", width: 20 },
    ]);

    console.log();
    section("Commands");
    info("gravityclaw cost                    - Show usage cost");
    info("gravityclaw cost --period week        - Last 7 days");
    info("gravityclaw cost --detailed      - Show by model");
    info("gravityclaw cost --model <name> - Show model pricing");
}

export function listModels(): void {
    title("💰 Available Model Pricing");

    const models = Object.entries(MODEL_PRICING).map(([name, pricing]) => ({
        name,
        input: pricing.inputPrice,
        output: pricing.outputPrice,
        context: pricing.contextWindow,
    }));

    // Group by provider
    const providers = new Map<string, typeof models>();
    
    for (const m of models) {
        let provider: string;
        if (m.name.includes("/")) {
            provider = m.name.split("/")[0]!;
        } else if (m.name.startsWith("claude")) {
            provider = "anthropic";
        } else if (m.name.startsWith("gpt")) {
            provider = "openai";
        } else if (m.name.startsWith("gemini")) {
            provider = "google";
        } else if (m.name.startsWith("llama") || m.name.startsWith("mixtral") || m.name.startsWith("gemma")) {
            provider = "groq";
        } else if (m.name.startsWith("deepseek")) {
            provider = "deepseek";
        } else if (m.name.startsWith("ollama") || m.name.startsWith("llama")) {
            provider = "ollama";
        } else {
            provider = "other";
        }
            
        if (!providers.has(provider)) {
            providers.set(provider, []);
        }
        if (providers.get(provider)) {
            providers.get(provider)!.push(m);
        }
    }

    for (const [provider, modelsList] of providers) {
        section(provider.toUpperCase());
        
        const rows = modelsList.slice(0, 10).map(m => [
            m.name,
            `$${m.input.toFixed(2)}`,
            `$${m.output.toFixed(2)}`,
            `${(m.context / 1000).toLocaleString()}K`,
        ]);
        
        printTable(rows, [
            { header: "Model", width: 35 },
            { header: "Input", width: 10, align: "right" },
            { header: "Output", width: 10, align: "right" },
            { header: "Context", width: 10, align: "right" },
        ]);
        
        if (modelsList.length > 10) {
            info(`... and ${modelsList.length - 10} more`);
        }
        
        console.log();
    }
}