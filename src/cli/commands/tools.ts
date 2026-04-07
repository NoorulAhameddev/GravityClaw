/**
 * Tools command - list and inspect available tools.
 */

import { registry } from "../../tools/index.ts";
import { title, section, printTable, info, dim, printBox, c } from "../rich-utils.ts";

export async function toolsCommand(): Promise<void> {
    title("🛠️  Available Tools");

    const tools = registry.getOpenAIDefinitions();

    if (tools.length === 0) {
        info("No tools registered");
        return;
    }

    const categories = new Map<string, typeof tools>();

    for (const tool of tools) {
        const name = tool.function.name;
        const category: string = name.includes("_") ? (name.split("_")[0] || "general") : "general";
        
        if (!categories.has(category)) {
            categories.set(category, []);
        }
        categories.get(category)!.push(tool);
    }

    for (const [category, categoryTools] of Array.from(categories.entries()).sort()) {
        const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
        
        const rows = categoryTools.map((tool) => [
            tool.function.name,
            tool.function.description || dim("(no description)"),
        ]);

        const tableContent = rows.map(row => {
            const cell0 = row[0] || "";
            const cell1 = row[1] || "";
            return `${c.cyan(cell0.padEnd(30))}  ${cell1}`;
        }).join("\n");

        printBox(tableContent, {
            title: categoryName,
            borderColor: "cyan"
        });

        console.log();
    }

    info(`Total: ${tools.length} tools available`);
}
