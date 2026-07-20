import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";

import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INBOX_DIR = path.join(__dirname, "..", "..", ".agent_inbox");
const OUTBOX_DIR = path.join(__dirname, "..", "..", ".agent_outbox");

// Ensure directories exist
async function ensureDirs() {
    await fs.mkdir(INBOX_DIR, { recursive: true });
    await fs.mkdir(OUTBOX_DIR, { recursive: true });
}

const server = new Server({
    name: "antigravity-bridge",
    version: "1.0.0"
}, {
    capabilities: {
        tools: {}
    }
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "delegate_to_antigravity",
                description: "Delegate a complex sub-task or research question to your parallel AI co-pilot, Antigravity. This runs asynchronously. You will receive a taskId to check status later.",
                inputSchema: {
                    type: "object",
                    properties: {
                        title: { type: "string", description: "Short title of the task" },
                        instructions: { type: "string", description: "Detailed instructions and context for what Antigravity needs to do." }
                    },
                    required: ["title", "instructions"]
                }
            },
            {
                name: "check_antigravity_status",
                description: "Check the status and result of a task previously delegated to Antigravity.",
                inputSchema: {
                    type: "object",
                    properties: {
                        taskId: { type: "string", description: "The ID of the task to check." }
                    },
                    required: ["taskId"]
                }
            }
        ]
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    await ensureDirs();

    if (request.params.name === "delegate_to_antigravity") {
        const { title, instructions } = request.params.arguments as any;
        const taskId = `task_${Date.now()}`;
        
        const taskPayload = {
            taskId,
            title,
            instructions,
            status: "pending",
            createdAt: new Date().toISOString()
        };

        const inboxPath = path.join(INBOX_DIR, `${taskId}.json`);
        await fs.writeFile(inboxPath, JSON.stringify(taskPayload, null, 2), "utf8");

        return {
            content: [{
                type: "text",
                text: `Task successfully delegated to Antigravity! \nTask ID: ${taskId}\n\nAntigravity is now working on this in parallel. You can continue your own work and use the check_antigravity_status tool later to get the results.`
            }]
        };
    }

    if (request.params.name === "check_antigravity_status") {
        const { taskId } = request.params.arguments as any;
        const outboxPath = path.join(OUTBOX_DIR, `${taskId}.json`);
        
        try {
            const resultData = await fs.readFile(outboxPath, "utf8");
            const result = JSON.parse(resultData);
            const output = result.output || result.result || JSON.stringify(result, null, 2);
            return {
                content: [{
                    type: "text",
                    text: `Task Completed!\n\nResults:\n${output}`
                }]
            };
        } catch (e: any) {
            if (e.code === 'ENOENT') {
                return {
                    content: [{
                        type: "text",
                        text: `Task ${taskId} is still in progress by Antigravity. Please check back later.`
                    }]
                };
            }
            throw e;
        }
    }

    throw new Error(`Tool not found: ${request.params.name}`);
});

async function run() {
    await ensureDirs();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Antigravity MCP Bridge Server running on stdio");
}

run().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
