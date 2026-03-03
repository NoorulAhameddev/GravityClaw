import type { Tool } from "./index.ts";
import { saveFact, recallFacts } from "../../memory/markdown.ts";

function getSessionIdFromInput(input: Record<string, unknown>): string {
    return String(input["__sessionId"] ?? "").trim();
}

export const saveFactTool: Tool = {
    name: "save_fact",
    description:
        "Saves a durable user fact or preference to markdown memory for this session. Use this for stable preferences, constraints, profile facts, and long-term context.",
    inputSchema: {
        type: "object",
        properties: {
            category: {
                type: "string",
                description: "Fact category (e.g., preferences, profile, project, constraints)",
            },
            fact: {
                type: "string",
                description: "The fact text to remember",
            },
        },
        required: ["category", "fact"],
    },
    async execute(input) {
        const sessionId = getSessionIdFromInput(input);
        if (!sessionId) {
            return "Error: save_fact requires active session context.";
        }

        const category = String(input["category"] ?? "general");
        const fact = String(input["fact"] ?? "");

        try {
            const saved = saveFact(sessionId, category, fact);
            return JSON.stringify({
                ok: true,
                saved,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : "unknown error";
            return `Error saving fact: ${message}`;
        }
    },
};

export const recallFactsTool: Tool = {
    name: "recall_facts",
    description:
        "Searches markdown memory for previously saved facts in this session. Use this when you need durable user context, prior preferences, or stored project details.",
    inputSchema: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description: "Search query over stored facts and categories",
            },
            limit: {
                type: "number",
                description: "Maximum facts to return (default: 10)",
            },
        },
        required: ["query"],
    },
    async execute(input) {
        const sessionId = getSessionIdFromInput(input);
        if (!sessionId) {
            return "Error: recall_facts requires active session context.";
        }

        const query = String(input["query"] ?? "");
        const limitInput = Number(input["limit"] ?? 10);
        const limit = Number.isFinite(limitInput) ? Math.max(1, Math.min(50, limitInput)) : 10;

        const facts = recallFacts(sessionId, query, limit);
        return JSON.stringify({
            count: facts.length,
            facts,
        });
    },
};
