import type { Channel, UnifiedMessage } from "../types/channels.js";
import { runAgent } from "../agent.ts";
import { runWithConcurrencyLimit } from "../concurrency.ts";
import { createLogger } from "../logger.ts";
import { db } from "../db.ts";
import { getProvider } from "../llm/index.ts";
import { getSessionSettings, getSessionStats, listSessions } from "../session.ts";
import { config } from "../config.ts";
import { ensureEveningRecapTask } from "../recap/index.ts";
import { generateRequestId } from "../telemetry/requestId.ts";
import { container } from "../bootstrap.ts";
import type { CommandContext } from "./commands/index.ts";
import {
  handleFailover,
  handleHeartbeat,
  handleRecap,
  handleRecommendations,
  handleStatus,
  handleNew,
  handleCompact,
  handleUsage,
  handleGraph,
  handleThink,
  handlePlugins,
  handleShutdown,
} from "./commands/handlers.ts";
import { handleModel, handleModels } from "./commands/model.ts";

const log = createLogger("router");

export interface ChannelStatus {
    id: string;
    started: boolean;
    error?: string;
}

export class ChannelRouter {
    private channels = new Map<string, Channel>();
    private channelStatuses = new Map<string, ChannelStatus>();

    /** Pending dangerous-command confirmations */
    private pendingConfirmations = new Map<
        string,
        { command: string; resolve: (confirmed: boolean) => void }
    >();

    register(channel: Channel) {
        if (this.channels.has(channel.id)) {
            throw new Error(`Channel with ID ${channel.id} is already registered.`);
        }
        this.channels.set(channel.id, channel);
        log.info(`Registered channel: ${channel.id}`);
    }

    async startAll(): Promise<ChannelStatus[]> {
        const statuses: ChannelStatus[] = [];
        
        for (const channel of this.channels.values()) {
            const status: ChannelStatus = { id: channel.id, started: false };
            try {
                log.info(`Starting channel: ${channel.id}...`);
                await channel.start(this.handleMessage.bind(this));
                status.started = true;
                log.info(`✅ Channel started: ${channel.id}`);
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                status.error = errMsg;
                log.error(`Failed to start channel ${channel.id}: ${errMsg}`);
                // Continue with other channels - graceful degradation
            }
            this.channelStatuses.set(channel.id, status);
            statuses.push(status);
        }
        
        const startedCount = statuses.filter(s => s.started).length;
        log.info(`Channel startup complete: ${startedCount}/${statuses.length} started`);
        
        return statuses;
    }

    getChannelStatuses(): ChannelStatus[] {
        return [...this.channelStatuses.values()];
    }

    isChannelAvailable(channelId: string): boolean {
        const status = this.channelStatuses.get(channelId);
        return status?.started ?? false;
    }

    async stopAll() {
        for (const channel of this.channels.values()) {
            try {
                await channel.stop();
            } catch (err) {
                log.error(`Error stopping channel ${channel.id}:`, err);
            }
        }
    }

    /** Clear history for a chat */
    public clearHistory(channelId: string, chatId: string): void {
        const sessionId = `${channelId}:${chatId}`;
        db.prepare("DELETE FROM memory WHERE session_id = ?").run(sessionId);
        log.info(`History cleared for ${sessionId}`);
    }

    private async handleMessage(msg: UnifiedMessage) {
        const key = `${msg.channelId}:${msg.chatId}`;
        const channel = this.channels.get(msg.channelId);
        if (!channel) return;

        // Ensure recap task exists for this session (idempotent)
        try {
            const recapHourLocal = getSessionSettings(key).recapHourLocal;
            if (typeof recapHourLocal === "number") {
                ensureEveningRecapTask(key, { hourLocal: recapHourLocal });
            } else {
                ensureEveningRecapTask(key);
            }
        } catch (err) {
            log.warn(`Failed to ensure recap task for ${key}: ${err}`);
        }

        // Command to clear history
        if (msg.text.trim() === "/reset") {
            this.clearHistory(msg.channelId, msg.chatId);
            await channel.sendMessage(msg.chatId, "Conversation history cleared.");
            return;
        }

        // Build command context and run dispatch table
        const ctx: CommandContext = { msg, channel, sessionId: key };
        const cmds: [RegExp, (c: CommandContext) => Promise<boolean>][] = [
            [/^\/failover/, handleFailover],
            [/^\/model(?:\s|$)/, handleModel],
            [/^\/models(?:\s|$)/, handleModels],
            [/^\/heartbeat/, handleHeartbeat],
            [/^\/recap now$/, handleRecap],
            [/^\/recommendations/, handleRecommendations],
            [/^\/status$/, handleStatus],
            [/^\/new(?:\s|$)/, handleNew],
            [/^\/compact$/, handleCompact],
            [/^\/usage/, handleUsage],
            [/^\/graph/, handleGraph],
            [/^\/think/, handleThink],
            [/^\/plugins$/, handlePlugins],
            [/^\/shutdown$/, handleShutdown],
        ];

        const text = msg.text.trim();
        for (const [pattern, handler] of cmds) {
            if (pattern.test(text)) {
                const handled = await handler(ctx);
                if (handled) return;
            }
        }

        // Command: /mesh <goal> - Start a mesh workflow
        if (text.startsWith("/mesh")) {
            const sessionId = `${msg.channelId}:${msg.chatId}`;
            const goal = text.slice(5).trim();

            if (!goal) {
                await channel.sendMessage(
                    msg.chatId,
                    `🧩 **Mesh Workflows**\n\n` +
                    `Usage: \`/mesh <goal>\`\n\n` +
                    `Example: \`/mesh Write a comprehensive guide on quantum computing\`\n\n` +
                    `Mesh workflows decompose complex goals into subtasks, identify dependencies, ` +
                    `and execute them in the optimal order.`
                );
                return;
            }

            try {
                const { MeshWorkflow } = await import("../agents/mesh.ts");
                const mesh = new MeshWorkflow();

                // Step 1: Decompose goal
                await channel.sendMessage(msg.chatId, `🧩 **Starting Mesh Workflow**\n\n📝 Analyzing goal...\n"${goal}"`);

                const dag = await mesh.decompose(goal);

                // Step 2: Validate DAG
                const validation = mesh.validateDAG(dag);
                if (!validation.valid) {
                    const errorMsg = validation.errors.join("\n");
                    await channel.sendMessage(
                        msg.chatId,
                        `❌ **Workflow validation failed:**\n\n${errorMsg}`
                    );
                    return;
                }

                // Step 3: Show plan
                let planMsg = `✅ **Workflow Plan** (${dag.tasks.length} tasks)\n\n`;
                for (const task of dag.tasks) {
                    const deps = task.dependsOn.length > 0 ? ` (depends on: ${task.dependsOn.join(", ")})` : " (no dependencies)";
                    planMsg += `• Task ${task.id}: ${task.description}${deps}\n`;
                }
                await channel.sendMessage(msg.chatId, planMsg);

                // Step 4: Execute workflow
                await channel.sendMessage(msg.chatId, `⚙️ **Executing workflow...**`);

                const execution = await mesh.execute(dag, async (progress) => {
                    const progressBar = `${"█".repeat(Math.floor(progress.currentTask))}${"░".repeat(Math.max(0, progress.totalTasks - progress.currentTask))}`;
                    await channel.sendMessage(
                        msg.chatId,
                        `🔄 Task ${progress.currentTask}/${progress.totalTasks}\n${progressBar}\n\n${progress.message}`
                    );
                });

                // Step 5: Aggregate results
                let resultMsg = `✨ **Workflow Complete!**\n\n`;
                resultMsg += `**Summary:**\n`;
                resultMsg += `• Tasks completed: ${execution.tasksCompleted}/${execution.totalTasks}\n`;
                resultMsg += `• Status: ${execution.success ? "✅ Success" : "⚠️ Partial completion"}\n\n`;

                if (execution.results.size > 0) {
                    resultMsg += `**Results:**\n\n`;
                    for (const [taskId, result] of execution.results.entries()) {
                        const summary = result.length > 200 ? result.substring(0, 200) + "..." : result;
                        resultMsg += `**Task ${taskId}:**\n${summary}\n\n`;
                    }
                }

                if (execution.errors.size > 0) {
                    resultMsg += `**Errors:**\n`;
                    for (const [taskId, error] of execution.errors.entries()) {
                        resultMsg += `• Task ${taskId}: ${error}\n`;
                    }
                }

                // Split long messages
                if (resultMsg.length > 4000) {
                    const chunks = resultMsg.split("\n\n");
                    let currentChunk = "";
                    for (const chunk of chunks) {
                        if ((currentChunk + chunk).length > 3500) {
                            if (currentChunk) {
                                await channel.sendMessage(msg.chatId, currentChunk);
                                currentChunk = chunk;
                            } else {
                                currentChunk = chunk;
                            }
                        } else {
                            currentChunk += (currentChunk ? "\n\n" : "") + chunk;
                        }
                    }
                    if (currentChunk) {
                        await channel.sendMessage(msg.chatId, currentChunk);
                    }
                } else {
                    await channel.sendMessage(msg.chatId, resultMsg);
                }
            } catch (error) {
                const errMsg = error instanceof Error ? error.message : String(error);
                log.error(`Mesh workflow error: ${errMsg}`);
                await channel.sendMessage(
                    msg.chatId,
                    `❌ **Workflow failed:**\n\n${errMsg}`
                );
            }
            return;
        }

        // Command: /swarm <goal> - Trigger agent swarm orchestration
        if (msg.text.trim().startsWith("/swarm")) {
            const goal = msg.text.trim().substring(6).trim();
            
            if (!goal) {
                await channel.sendMessage(
                    msg.chatId,
                    "🐝 **Agent Swarm**\n\n" +
                    "Usage: `/swarm <goal>`\n\n" +
                    "Spawns a team of specialized agents (researcher, coder, reviewer, summarizer) to collaborate on a complex task.\n\n" +
                    "Example: `/swarm Build a TypeScript CLI tool that converts CSV to JSON`"
                );
                return;
            }

            const sessionId = `${msg.channelId}:${msg.chatId}`;
            
            try {
                await channel.sendMessage(
                    msg.chatId,
                    `🐝 **Activating Agent Swarm**\n\nGoal: ${goal}\n\nSpawning specialized agents...`
                );

                const { AgentSwarm } = await import("../agents/swarm.ts");
                
                // Decompose the goal into subtasks (simple strategy: create generic subtasks)
                const subTasks = [
                    `Research and analyze: ${goal}`,
                    `Design and plan implementation for: ${goal}`,
                    `Review and refine the approach for: ${goal}`,
                ];

                const swarm = new AgentSwarm(sessionId, {
                    numAgents: 3,
                    roles: ["researcher", "coder", "reviewer"],
                    maxConcurrency: 2,
                });

                const result = await swarm.orchestrate(goal, subTasks);

                let resultsMsg = `✅ **Swarm Execution Complete**\n\n`;
                resultsMsg += `**Agents engaged**: ${result.agentResults.length}\n\n`;

                for (const agentResult of result.agentResults) {
                    const status = agentResult.status === "completed" ? "✅" : "❌";
                    resultsMsg += `${status} **${agentResult.role}** (${agentResult.sessionId})\n`;
                }

                resultsMsg += `\n---\n\n`;

                // Send combined results
                const chunks = this.splitMessage(resultsMsg, 3000);
                for (const chunk of chunks) {
                    await channel.sendMessage(msg.chatId, chunk);
                }

                // Send aggregated result
                const aggregatedChunks = this.splitMessage(result.aggregatedResult, 4000);
                for (const chunk of aggregatedChunks) {
                    await channel.sendMessage(msg.chatId, chunk);
                }

                log.info(`Swarm execution completed for session: ${sessionId}`);
            } catch (err) {
                log.error(`Error in /swarm command: ${err}`);
                const errMsg = err instanceof Error ? err.message : String(err);
                await channel.sendMessage(msg.chatId, `❌ Swarm error: ${errMsg}`);
            }
            return;
        }

        // Handle y/n replies for confirmations
        const pending = this.pendingConfirmations.get(key);
        if (pending) {
            const answer = msg.text.trim().toLowerCase();
            if (answer === "y" || answer === "yes") {
                pending.resolve(true);
                this.pendingConfirmations.delete(key);
                await channel.sendMessage(msg.chatId, "✅ Confirmed. Executing…");
            } else {
                pending.resolve(false);
                this.pendingConfirmations.delete(key);
                await channel.sendMessage(msg.chatId, "🚫 Cancelled.");
            }
            return;
        }


        log.info(`Message received via router — channel: ${msg.channelId}, chat: ${msg.chatId}`);

        if (channel.sendTyping) await channel.sendTyping(msg.chatId);

        let typingInterval: NodeJS.Timeout | undefined;
        if (channel.sendTyping) {
            typingInterval = setInterval(() => {
                channel.sendTyping!(msg.chatId).catch((err) => log.debug("sendTyping error", err));
            }, 4000);
        }

        try {
            const requestId = generateRequestId();
            const result = await runWithConcurrencyLimit(key, () => runAgent({
                message: msg.text,
                sessionId: key,
                requestId,
                userId: msg.userId,
                platform: msg.platform,
                groupId: msg.groupId,
                isGroup: msg.isGroup,
                requestConfirmation: async (command: string): Promise<boolean> => {
                    return new Promise((resolve) => {
                        this.pendingConfirmations.set(key, { command, resolve });
                        channel.sendMessage(
                            msg.chatId,
                            `⚠️ *Dangerous command detected*\n\`\`\`\n${command}\n\`\`\`\n\nReply *y* to confirm or *n* to cancel.`
                        ).catch((err) => log.error("Failed to send confirmation prompt", err));
                    });
                },
                dependencies: {
                    config: container.config,
                    toolRegistry: container.toolRegistry,
                    db: container.db,
                },
            }));

            if (typingInterval) clearInterval(typingInterval);

            const replyText = result.text.trim() || "(no response)";

            // Chunk long messages
            const chunks = this.splitMessage(replyText, 4000);
            for (const chunk of chunks) {
                await channel.sendMessage(msg.chatId, chunk);
            }
        } catch (err) {
            if (typingInterval) clearInterval(typingInterval);
            log.error("Agent error in router", err);
            const errMsg = err instanceof Error ? err.message : "Unknown error";
            await channel.sendMessage(msg.chatId, `❌ Something went wrong:\n\`${errMsg}\``);
        }
    }

    public async sendProactiveToSession(sessionId: string, text: string): Promise<void> {
        const [channelId, ...chatParts] = sessionId.split(":");
        const chatId = chatParts.join(":");

        if (!channelId || !chatId) {
            throw new Error(`Invalid session ID format: ${sessionId}`);
        }

        const channel = this.channels.get(channelId);
        if (!channel) {
            throw new Error(`Channel not found for session: ${sessionId}`);
        }

        await channel.sendMessage(chatId, text);
    }

    private splitMessage(text: string, maxLen: number): string[] {
        const chunks: string[] = [];
        let remaining = text;
        while (remaining.length > maxLen) {
            let splitAt = remaining.lastIndexOf("\n", maxLen);
            if (splitAt <= 0) splitAt = maxLen;
            chunks.push(remaining.substring(0, splitAt));
            remaining = remaining.substring(splitAt).trimStart();
        }
        if (remaining) chunks.push(remaining);
        return chunks;
    }
}
