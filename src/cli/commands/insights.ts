/**
 * Insights CLI command - generate usage analytics and reports.
 */

import fs from "fs";
import path from "path";
import { db } from "../../db.ts";
import { getUsageByPeriod, getUsageStats } from "../../usage.ts";
import { config } from "../../config.ts";
import { success, error, info, title, section, printTable, dim, bold } from "../utils.ts";

/**
 * Analyze session patterns from memory table
 */
function analyzeSessions(): {
    totalSessions: number;
    totalMessages: number;
    avgMessagesPerSession: number;
    sessionsByDay: Map<string, number>;
    messagesByHour: Map<number, number>;
} {
    // Get session counts
    const sessionResult = db.prepare(`
        SELECT COUNT(DISTINCT session_id) as count FROM memory
    `).get() as { count: number };

    // Get message counts
    const messageResult = db.prepare(`
        SELECT COUNT(*) as count FROM memory
    `).get() as { count: number };

    // Get sessions by day
    const dayResults = db.prepare(`
        SELECT DATE(timestamp) as day, COUNT(DISTINCT session_id) as sessions
        FROM memory
        GROUP BY DATE(timestamp)
        ORDER BY day DESC
        LIMIT 30
    `).all() as Array<{ day: string; sessions: number }>;

    // Get messages by hour
    const hourResults = db.prepare(`
        SELECT CAST(strftime('%H', timestamp) AS INTEGER) as hour, 
               COUNT(*) as messages
        FROM memory
        GROUP BY hour
    `).all() as Array<{ hour: number; messages: number }>;

    const sessionsByDay = new Map<string, number>();
    for (const r of dayResults) {
        sessionsByDay.set(r.day, r.sessions);
    }

    const messagesByHour = new Map<number, number>();
    for (const r of hourResults) {
        messagesByHour.set(r.hour as number, r.messages as number);
    }

    return {
        totalSessions: sessionResult.count,
        totalMessages: messageResult.count,
        avgMessagesPerSession: sessionResult.count > 0 
            ? messageResult.count / sessionResult.count 
            : 0,
        sessionsByDay,
        messagesByHour,
    };
}

/**
 * Get tool usage from message content
 */
function getToolUsage(): Array<{ tool: string; count: number }> {
    try {
        const results = db.prepare(`
            SELECT message_json FROM memory
            WHERE message_json LIKE '%tool_calls%'
            LIMIT 1000
        `).all() as Array<{ message_json: string }>;

        const toolCounts = new Map<string, number>();

        for (const row of results) {
            try {
                const msg = JSON.parse(row.message_json);
                if (msg.tool_calls) {
                    for (const call of msg.tool_calls) {
                        const name = call.function?.name || call.name || "unknown";
                        toolCounts.set(name, (toolCounts.get(name) || 0) + 1);
                    }
                }
            } catch (e) {
                // Skip invalid JSON
            }
        }

        return Array.from(toolCounts.entries())
            .map(([tool, count]) => ({ tool, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
    } catch (e) {
        return [];
    }
}

export async function insightsCommand(options: {
    period?: string;
    html?: boolean;
} = {}): Promise<void> {
    const { period = "month", html = false } = options;

    const usagePeriod = period === "day" ? 1 
        : period === "week" ? 7 
        : period === "month" ? 30 
        : 90;
    const since = new Date(Date.now() - usagePeriod * 24 * 60 * 60 * 1000);

    title("📊 GravityClaw Insights");

    // Get usage data
    const usageStats = getUsageStats(undefined, since);
    const sessionData = analyzeSessions();
    const toolUsage = getToolUsage();
    const costs = getUsageByPeriod();

    // Determine time period label
    const periodLabel = period === "day" ? "Last 24 Hours"
        : period === "week" ? "Last 7 Days"
        : period === "month" ? "Last 30 Days"
        : "Last 90 Days";

    section(periodLabel);

    // Overview stats
    printTable([
        ["Sessions", sessionData.totalSessions.toLocaleString()],
        ["Messages", sessionData.totalMessages.toLocaleString()],
        ["Avg Msg/Session", sessionData.avgMessagesPerSession.toFixed(1)],
    ], [
        { header: "Metric", width: 20 },
        { header: "Value", width: 20 },
    ]);

    console.log();
    section("LLM Usage");

    printTable([
        ["API Calls", usageStats.totalCalls.toLocaleString()],
        ["Total Tokens", usageStats.totalTokens.toLocaleString()],
        ["Total Cost", `$${usageStats.totalCost.toFixed(2)}`],
    ], [
        { header: "Metric", width: 20 },
        { header: "Value", width: 20 },
    ]);

    // Show model breakdown if detailed
    if (usageStats.models.length > 0) {
        console.log();
        section("By Model");
        
        const rows = usageStats.models.slice(0, 5).map(m => [
            m.model.slice(0, 25),
            m.calls.toLocaleString(),
            `$${m.cost.toFixed(2)}`,
        ]);
        
        printTable(rows, [
            { header: "Model", width: 28 },
            { header: "Calls", width: 12, align: "right" },
            { header: "Cost", width: 12, align: "right" },
        ]);
    }

    // Tool usage
    if (toolUsage.length > 0) {
        console.log();
        section("Top Tools");
        
        const rows = toolUsage.slice(0, 8).map(t => [
            t.tool,
            t.count.toLocaleString(),
        ]);
        
        printTable(rows, [
            { header: "Tool", width: 25 },
            { header: "Calls", width: 12, align: "right" },
        ]);
    }

    // Time-based patterns
    console.log();
    section("Peak Hours");
    
    const hourLabels = ["12am", "3am", "6am", "9am", "12pm", "3pm", "6pm", "9pm"];
    const hourData = [0, 3, 6, 9, 12, 15, 18, 21].map(h => {
        const count = sessionData.messagesByHour.get(h) || 0;
        return hourLabels[Math.floor(h / 3)] + (count > 0 ? ` (${count})` : "");
    });
    
    info(hourData.filter(h => h.includes("(")).join(" | ") || "No data available");

    // Cost comparison
    console.log();
    section("Cost Trend");
    
    const todayCost = costs.today.totalCost;
    const weekCost = costs.week.totalCost;
    const monthCost = costs.month.totalCost;
    
    printTable([
        ["Today", `$${todayCost.toFixed(2)}`],
        ["This Week", `$${weekCost.toFixed(2)}`],
        ["This Month", `$${monthCost.toFixed(2)}`],
    ], [
        { header: "Period", width: 15 },
        { header: "Cost", width: 15 },
    ]);

    // Projections
    console.log();
    section("Projections");
    
    const dailyAvg = usagePeriod > 0 ? usageStats.totalCost / usagePeriod : 0;
    const projectedMonthly = dailyAvg * 30;
    const projectedYearly = dailyAvg * 365;
    
    printTable([
        ["Daily Average", `$${dailyAvg.toFixed(2)}`],
        ["Monthly Projected", `$${projectedMonthly.toFixed(2)}`],
        ["Yearly Projected", `$${projectedYearly.toFixed(2)}`],
    ], [
        { header: "Metric", width: 18 },
        { header: "Value", width: 18 },
    ]);

    console.log();
    section("Tips");
    info("gravityclaw insights           - Last 30 days");
    info("gravityclaw insights --period week  - Last 7 days");
    info("gravityclaw cost             - Cost details");
}