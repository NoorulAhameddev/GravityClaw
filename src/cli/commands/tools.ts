/**
 * Tools command - list and inspect available tools.
 */

import { registry } from "../../tools/index.ts";
import { title, section, printTable, info, dim } from "../utils.ts";

export async function toolsCommand(): Promise<void> {
    title("🛠️  Available Tools");

    const tools = registry.getOpenAIDefinitions();

    if (tools.length === 0) {
        info("No tools registered");
        return;
    }

    // Group tools by category (inferred from name prefix)
    const categories = new Map<string, typeof tools>();

    for (const tool of tools) {
        const name = tool.function.name;
        const category: string = name.includes("_") ? (name.split("_")[0] || "general") : "general";
        
        if (!categories.has(category)) {
            categories.set(category, []);
        }
        categories.get(category)!.push(tool);
    }

    // Print each category
    for (const [category, categoryTools] of Array.from(categories.entries()).sort()) {
        section(category.charAt(0).toUpperCase() + category.slice(1));

        const rows = categoryTools.map((tool) => [
            tool.function.name,
            tool.function.description || dim("(no description)"),
        ]);

        printTable(rows, [
            { header: "Tool", width: 30 },
            { header: "Description", width: 80 },
        ]);

        console.log();
    }

    info(`Total: ${tools.length} tools available`);
}
