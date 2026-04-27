/**
 * Thinkback CLI command - generate a year-in-review summary of your coding activity.
 * 
 * This is a simplified version inspired by Claude Code's thinkback feature.
 * It generates a text summary of your annual coding stats.
 */

import { db } from "../../db.ts";
import { getUsageByPeriod } from "../../usage.ts";
import { info, title, section, printTable, dim, bold, success } from "../utils.ts";

interface YearInReview {
    year: number;
    totalSessions: number;
    totalMessages: number;
    totalCost: number;
    totalTokens: number;
    topTools: Array<{ name: string; count: number }>;
    topModels: Array<{ name: string; cost: number }>;
    dailyStats: Array<{ date: string; cost: number; messages: number }>;
}

function getYearInReview(year: number): YearInReview {
    const startDate = new Date(year, 0, 1).toISOString();
    const endDate = new Date(year + 1, 0, 1).toISOString();

    // Get session count
    const sessionResult = db.prepare(`
        SELECT COUNT(DISTINCT session_id) as count 
        FROM memory 
        WHERE timestamp >= ? AND timestamp < ?
    `).get(startDate, endDate) as { count: number };

    // Get message count
    const messageResult = db.prepare(`
        SELECT COUNT(*) as count 
        FROM memory 
        WHERE timestamp >= ? AND timestamp < ?
    `).get(startDate, endDate) as { count: number };

    // Get usage by model for the year
    const modelResults = db.prepare(`
        SELECT model, SUM(cost) as cost, COUNT(*) as calls
        FROM usage 
        WHERE timestamp >= ? AND timestamp < ?
        GROUP BY model
        ORDER BY cost DESC
        LIMIT 10
    `).all(startDate, endDate) as Array<{ model: string; cost: number; calls: number }>;

    // Get daily stats
    const dailyResults = db.prepare(`
        SELECT DATE(timestamp) as date, 
               SUM(cost) as cost,
               COUNT(*) as messages
        FROM usage
        WHERE timestamp >= ? AND timestamp < ?
        GROUP BY DATE(timestamp)
        ORDER BY date DESC
    `).all(startDate, endDate) as Array<{ date: string; cost: number; messages: number }>;

    // Get tool usage (from message content)
    const toolResults = db.prepare(`
        SELECT message_json FROM memory
        WHERE timestamp >= ? AND timestamp < ?
        AND message_json LIKE '%tool_calls%'
        LIMIT 5000
    `).all(startDate, endDate) as Array<{ message_json: string }>;

    const toolCounts = new Map<string, number>();
    for (const row of toolResults) {
        try {
            const msg = JSON.parse(row.message_json);
            if (msg.tool_calls) {
                for (const call of msg.tool_calls) {
                    const name = call.function?.name || call.name || "unknown";
                    toolCounts.set(name, (toolCounts.get(name) || 0) + 1);
                }
            }
        } catch (e) {}
    }

    const topTools = Array.from(toolCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    // Calculate total cost and tokens for the year in one query
    const costResult = db.prepare(`
        SELECT SUM(cost) as total, SUM(total_tokens) as tokens
        FROM usage
        WHERE timestamp >= ? AND timestamp < ?
    `).get(startDate, endDate) as { total: number | null; tokens: number | null };

    return {
        year,
        totalSessions: sessionResult.count,
        totalMessages: messageResult.count,
        totalCost: costResult.total || 0,
        totalTokens: costResult.tokens || 0,
        topTools,
        topModels: modelResults.map(m => ({ name: m.model, cost: m.cost })),
        dailyStats: dailyResults.slice(0, 10),
    };
}

export async function thinkbackCommand(options: {
    year?: number;
    play?: boolean;
} = {}): Promise<void> {
    const { year = new Date().getFullYear(), play = false } = options;

    if (play) {
        await playAnimation(year);
    } else {
        await showYearInReview(year);
    }
}

async function showYearInReview(year: number): Promise<void> {
    title(`🎉 ${year} Year in Review`);

    const review = getYearInReview(year);

    if (review.totalMessages === 0) {
        info(`No activity recorded for ${year}.`);
        info("Start chatting with GravityClaw to build your year in review!");
        return;
    }

    const stats = getUsageByPeriod();
    const yearCost = stats.allTime.totalCost; // Approximate for current year

    section(`Your ${year} at a Glance`);

    printTable([
        ["Coding Sessions", review.totalSessions.toLocaleString()],
        ["Messages Exchanged", review.totalMessages.toLocaleString()],
        ["Total Cost", `$${yearCost.toFixed(2)}`],
        ["Tokens Used", (review.totalTokens / 1000000).toFixed(1) + "M"],
    ], [
        { header: "Metric", width: 20 },
        { header: "Value", width: 25 },
    ]);

    console.log();
    section("Favorite Tools");

    if (review.topTools.length > 0) {
        const rows = review.topTools.slice(0, 8).map(t => [
            t.name,
            t.count.toLocaleString(),
        ]);

        printTable(rows, [
            { header: "Tool", width: 25 },
            { header: "Uses", width: 12, align: "right" },
        ]);
    } else {
        info("Tool usage data not available");
    }

    console.log();
    section("Models Used");

    if (review.topModels.length > 0) {
        const rows = review.topModels.slice(0, 5).map(m => [
            m.name.slice(0, 30),
            `$${m.cost.toFixed(2)}`,
        ]);

        printTable(rows, [
            { header: "Model", width: 35 },
            { header: "Cost", width: 12, align: "right" },
        ]);
    }

    console.log();
    section("Your Coding Journey");

    const daysActive = review.dailyStats.length;
    const avgMessagesPerDay = review.totalMessages / Math.max(daysActive, 1);
    const avgCostPerDay = review.totalCost / Math.max(daysActive, 1);

    printTable([
        ["Days Active", daysActive.toString()],
        ["Avg Messages/Day", avgMessagesPerDay.toFixed(1)],
        ["Avg Daily Cost", `$${avgCostPerDay.toFixed(2)}`],
    ], [
        { header: "Metric", width: 18 },
        { header: "Value", width: 18 },
    ]);

    console.log();
    section("What's Next?");

    info("Keep building! Your next year in review will be even better.");
    info("Run 'GravityClaw thinkback --play' to see an animation (if available)");

    console.log();
    success(`Thanks for using GravityClaw in ${year}! 🚀`);
}

async function playAnimation(year: number): Promise<void> {
    const review = getYearInReview(year);

    console.log();
    console.log("═══════════════════════════════════════════════════════════");
    console.log();
    console.log(`        🎉  ${year} YEAR IN REVIEW  🎉`);
    console.log();
    console.log("═══════════════════════════════════════════════════════════");
    console.log();
    console.log(`   📊 ${review.totalMessages.toLocaleString()} messages exchanged`);
    console.log(`   💰 $${review.totalCost.toFixed(2)} in API costs`);
    console.log(`   🧠 ${(review.totalTokens / 1000000).toFixed(1)}M tokens processed`);
    console.log(`   💻 ${review.totalSessions.toLocaleString()} coding sessions`);
    console.log();
    console.log("═══════════════════════════════════════════════════════════");
    console.log();
    console.log(`        Thank you for a great year! 🚀`);
    console.log();
}