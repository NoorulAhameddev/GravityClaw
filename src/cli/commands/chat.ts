/**
 * Interactive chat command - REPL mode for direct agent interaction.
 */

import { createInterface } from "readline";
import { runAgent } from "../../agent.ts";
import { runWithConcurrencyLimit } from "../../concurrency.ts";
import { container } from "../../bootstrap.ts";
import { colors, success, error, info, dim } from "../utils.ts";

export interface ChatOptions {
    sessionId?: string | undefined;
    verbose?: boolean;
}

export async function chatCommand(options: ChatOptions): Promise<void> {
    const sessionId = options.sessionId || `cli-${Date.now()}`;
    
    console.log(`${colors.bright}${colors.cyan}Gravity Claw Interactive Chat${colors.reset}`);
    console.log(dim(`Session ID: ${sessionId}`));
    console.log(dim("Type 'exit' or 'quit' to leave, 'clear' to reset session\n"));

    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: `${colors.green}You${colors.reset} > `,
    });

    rl.prompt();

    rl.on("line", async (line) => {
        const message = line.trim();

        if (!message) {
            rl.prompt();
            return;
        }

        if (message === "exit" || message === "quit") {
            success("Goodbye!");
            rl.close();
            return;
        }

        if (message === "clear") {
            // Clear session by deleting from DB
            const { db } = await import("../../db.ts");
            db.prepare("DELETE FROM memory WHERE session_id = ?").run(sessionId);
            info("Session cleared");
            rl.prompt();
            return;
        }

        try {
            // Show thinking indicator
            process.stdout.write(`${colors.yellow}⏳${colors.reset} Thinking...\n`);

            const result = await runWithConcurrencyLimit(sessionId, () => runAgent({
                message,
                sessionId,
                userId: "cli-user",
                platform: "cli",
                onProgress: async (text) => {
                    if (options.verbose && text) {
                        console.log(`${colors.dim}[partial]${colors.reset} ${text}`);
                    }
                },
                dependencies: {
                    config: container.config,
                    toolRegistry: container.toolRegistry,
                    db: container.db,
                },
            }));

            console.log(`${colors.blue}Assistant${colors.reset} > ${result.text}\n`);

            if (options.verbose) {
                console.log(dim(`Tool calls: ${result.toolCallCount}, Hit limit: ${result.hitLimit}`));
            }
        } catch (err) {
            error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
        }

        rl.prompt();
    });

    rl.on("close", () => {
        process.exit(0);
    });
}
