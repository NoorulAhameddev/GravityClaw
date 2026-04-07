import { bootstrap } from "../../bootstrap.ts";

const container = bootstrap();

// Test improved tool filtering
const query = "list files in folder";
const relevantTools = container.toolRegistry.getRelevantTools(query);

console.log("Query:", query);
console.log("\n=== Selected Tools (max 8) ===\n");

relevantTools.forEach((tool: any, i: any) => {
    console.log(`${i + 1}. ${tool.name}`);
});

console.log("\nTotal:", relevantTools.length);