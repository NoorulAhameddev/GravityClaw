import type { Channel, UnifiedMessage } from "../types/channels.js";
import { runAgent } from "../agent.ts";
import { runWithConcurrencyLimit } from "../concurrency.ts";
import { createLogger } from "../logger.ts";
import { db } from "../db.ts";
import { getProvider, FailoverProvider, OpenRouterProvider } from "../llm/index.ts";
import { getSessionSettings, updateSessionSetting, getSessionStats, listSessions } from "../session.ts";
import { config } from "../config.ts";
import { pluginRegistry } from "../plugins/registry.ts";
import { pruneContext, getPruningStatus, formatPruningResult, isContextNearLimit } from "../memory/pruning.ts";
import { queryGraph, formatGraphAsMermaid } from "../memory/graph.ts";
import { getHeartbeatStatus, setHeartbeatEnabled } from "../heartbeat/index.ts";
import { ensureEveningRecapTask, buildEveningRecap } from "../recap/index.ts";
import { getRecommendationsStatus, setRecommendationsEnabled } from "../recommendations/index.ts";
import { container } from "../bootstrap.ts";
import * as fs from "fs";
import * as os from "os";

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

        // Command to clear history (could be intercepted at channel level too, but helpful here)
        if (msg.text.trim() === "/reset") {
            this.clearHistory(msg.channelId, msg.chatId);
            await channel.sendMessage(msg.chatId, "🔄 Conversation history cleared.");
            return;
        }

        // Command to view failover provider status
        if (msg.text.trim() === "/failover" || msg.text.trim() === "/failover status") {
            const provider = getProvider();
            
            if (!(provider instanceof FailoverProvider)) {
                await channel.sendMessage(
                    msg.chatId,
                    "ℹ️ Failover mode is not currently enabled.\n\nTo enable failover, set `LLM_PROVIDER=failover` in your .env file and configure `LLM_FAILOVER_LIST` with comma-separated provider names (e.g., `openai,anthropic,openrouter`)."
                );
                return;
            }

            const health = provider.getHealthStatus();
            
            // Build status message
            let statusMsg = "🔄 **Failover Provider Status**\n\n";
            
            for (const h of health) {
                const statusIcon = h.isCircuitOpen ? "🔴 CIRCUIT OPEN" : "🟢 Available";
                const successRate = h.totalCalls > 0 
                    ? ((h.totalSuccesses / h.totalCalls) * 100).toFixed(1)
                    : "N/A";
                
                statusMsg += `**${h.name}**: ${statusIcon}\n`;
                statusMsg += `├─ Total calls: ${h.totalCalls}\n`;
                statusMsg += `├─ Successes: ${h.totalSuccesses}\n`;
                statusMsg += `├─ Failures: ${h.totalFailures}\n`;
                statusMsg += `├─ Success rate: ${successRate}%\n`;
                statusMsg += `├─ Consecutive failures: ${h.consecutiveFailures}\n`;
                
                if (h.isCircuitOpen && h.lastFailureTime > 0) {
                    const timeSinceFailure = Date.now() - h.lastFailureTime;
                    const secondsAgo = Math.floor(timeSinceFailure / 1000);
                    statusMsg += `└─ Circuit will reset in ${Math.max(0, 60 - secondsAgo)}s\n`;
                } else {
                    statusMsg += `└─ Status: Healthy\n`;
                }
                
                statusMsg += "\n";
            }
            
            await channel.sendMessage(msg.chatId, statusMsg.trim());
            return;
        }

        // Command to switch model: /model <provider> <model-name> or /model <model-name>
        if (msg.text.trim().startsWith("/model")) {
            const parts = msg.text.trim().split(/\s+/).slice(1); // Remove "/model" part
            const sessionId = `${msg.channelId}:${msg.chatId}`;
            
            // No arguments - show current model
            if (parts.length === 0) {
                const settings = getSessionSettings(sessionId);
                const currentProvider = settings.provider || "<default>";
                const currentModel = settings.model || "<default>";
                
                await channel.sendMessage(
                    msg.chatId,
                    `🤖 **Current Model Configuration**\n\n` +
                    `Provider: ${currentProvider}\n` +
                    `Model: ${currentModel}\n\n` +
                    `To change: \`/model <provider> <model-name>\`\n` +
                    `Example: \`/model anthropic claude-3-5-sonnet-20241022\`\n\n` +
                    `Available providers: openrouter, anthropic, openai, google, groq, deepseek, ollama\n` +
                    `Use \`/models openrouter\` to see available OpenRouter models.`
                );
                return;
            }
            
            let provider: string;
            let model: string;
            
            // Check if first arg is a provider name or a model name
            const validProviders = ["openrouter", "anthropic", "openai", "google", "groq", "deepseek", "ollama"];
            
            if (parts.length === 1) {
                // Only model name provided - keep current provider
                const settings = getSessionSettings(sessionId);
                provider = settings.provider || "openrouter";
                model = parts[0]!;
            } else if (parts.length >= 2 && validProviders.includes(parts[0]!.toLowerCase())) {
                // Provider and model provided
                provider = parts[0]!.toLowerCase();
                model = parts.slice(1).join(" ").trim(); // Support model names with spaces
            } else {
                // Treat all as model name
                const settings = getSessionSettings(sessionId);
                provider = settings.provider || "openrouter";
                model = parts.join(" ").trim();
            }
            
            // Save to session settings
            updateSessionSetting(sessionId, "provider", provider);
            updateSessionSetting(sessionId, "model", model);
            
            await channel.sendMessage(
                msg.chatId,
                `✅ Model switched!\n\n` +
                `Provider: **${provider}**\n` +
                `Model: **${model}**\n\n` +
                `This setting applies only to this conversation. To change the global default, update your .env file.`
            );
            return;
        }

        // Command to list available models
        if (msg.text.trim().startsWith("/models")) {
            const parts = msg.text.trim().split(/\s+/);
            const providerArg = parts[1]?.toLowerCase();

            // Default to openrouter if no provider specified
            const targetProvider = providerArg || "openrouter";

            if (targetProvider === "openrouter") {
                // Check if current provider is OpenRouter or if we can create one
                const provider = getProvider();
                let openRouterProvider: OpenRouterProvider;

                if (provider instanceof OpenRouterProvider) {
                    openRouterProvider = provider;
                } else if (provider instanceof FailoverProvider) {
                    // Try to find OpenRouter in failover list
                    const failoverHealth = provider.getHealthStatus();
                    const hasOpenRouter = failoverHealth.some(h => h.name === "openrouter");
                    
                    if (!hasOpenRouter) {
                        await channel.sendMessage(
                            msg.chatId,
                            "ℹ️ OpenRouter is not available in the current configuration.\n\nTo view OpenRouter models, set `LLM_PROVIDER=openrouter` or include `openrouter` in `LLM_FAILOVER_LIST`."
                        );
                        return;
                    }
                    
                    // Create temporary OpenRouter provider for model listing
                    const { config } = await import("../config.ts");
                    if (!config.OPENROUTER_API_KEY) {
                        await channel.sendMessage(
                            msg.chatId,
                            "❌ OPENROUTER_API_KEY not configured."
                        );
                        return;
                    }
                    openRouterProvider = new OpenRouterProvider(config.OPENROUTER_API_KEY);
                } else {
                    await channel.sendMessage(
                        msg.chatId,
                        "ℹ️ OpenRouter is not the current provider. Use `/models openrouter` to view OpenRouter models specifically."
                    );
                    return;
                }

                try {
                    await channel.sendMessage(msg.chatId, "🔍 Fetching OpenRouter models...");
                    const modelsText = await openRouterProvider.formatModelsForDisplay(20);
                    await channel.sendMessage(msg.chatId, modelsText);
                } catch (error) {
                    log.error("Error fetching OpenRouter models", error);
                    await channel.sendMessage(
                        msg.chatId,
                        "❌ Failed to fetch models from OpenRouter. Check your API key and connection."
                    );
                }
                return;
            } else {
                await channel.sendMessage(
                    msg.chatId,
                    `ℹ️ Model listing for provider '${targetProvider}' is not yet implemented.\n\nCurrently supported: \`/models openrouter\``
                );
                return;
            }
        }

        // Command: /heartbeat status|enable|disable
        if (msg.text.trim().startsWith("/heartbeat")) {
            const parts = msg.text.trim().split(/\s+/);
            const subcommand = parts[1]?.toLowerCase() || "status";
            const sessionId = `${msg.channelId}:${msg.chatId}`;

            if (subcommand === "enable") {
                const result = setHeartbeatEnabled(sessionId, true);
                if (!result.success) {
                    await channel.sendMessage(msg.chatId, `❌ Failed to enable heartbeat: ${result.error}`);
                    return;
                }

                await channel.sendMessage(
                    msg.chatId,
                    `✅ Heartbeat enabled (${result.affected} prompt task${result.affected === 1 ? "" : "s"} active).`
                );
                return;
            }

            if (subcommand === "disable") {
                const result = setHeartbeatEnabled(sessionId, false);
                if (!result.success) {
                    await channel.sendMessage(msg.chatId, `❌ Failed to disable heartbeat: ${result.error}`);
                    return;
                }

                await channel.sendMessage(
                    msg.chatId,
                    `⏸️ Heartbeat disabled (${result.affected} prompt task${result.affected === 1 ? "" : "s"} paused).`
                );
                return;
            }

            if (subcommand !== "status") {
                await channel.sendMessage(
                    msg.chatId,
                    "Usage: `/heartbeat status`, `/heartbeat enable`, or `/heartbeat disable`"
                );
                return;
            }

            const status = getHeartbeatStatus(sessionId);
            await channel.sendMessage(
                msg.chatId,
                `💓 **Heartbeat Status**\n\n` +
                `- Enabled: ${status.enabled ? "yes" : "no"}\n` +
                `- Interval (minutes): ${status.intervalMinutes}\n` +
                `- Total prompts: ${status.taskCount}\n` +
                `- Active prompts: ${status.activeTaskCount}\n` +
                `- Last run: ${status.lastRun || "never"}\n` +
                `- Next run: ${status.nextRun || "n/a"}`
            );
            return;
        }

        // Command: /recap now
        if (msg.text.trim() === "/recap now") {
            const sessionId = `${msg.channelId}:${msg.chatId}`;
            const recap = buildEveningRecap(sessionId, "manual");

            if (!recap.success || !recap.reportMarkdown) {
                await channel.sendMessage(msg.chatId, `❌ Failed to generate recap: ${recap.error || "unknown error"}`);
                return;
            }

            await channel.sendMessage(msg.chatId, recap.reportMarkdown);
            return;
        }

        // Command: /recommendations [on|off]
        if (msg.text.trim().startsWith("/recommendations")) {
            const parts = msg.text.trim().split(/\s+/);
            const subcommand = parts[1]?.toLowerCase();
            const sessionId = `${msg.channelId}:${msg.chatId}`;

            if (subcommand === "off") {
                setRecommendationsEnabled(sessionId, false);
                await channel.sendMessage(msg.chatId, "🛑 Smart recommendations disabled for this session.");
                return;
            }

            if (subcommand === "on") {
                setRecommendationsEnabled(sessionId, true);
                await channel.sendMessage(msg.chatId, "✅ Smart recommendations enabled for this session.");
                return;
            }

            const status = getRecommendationsStatus(sessionId);
            await channel.sendMessage(
                msg.chatId,
                `💡 **Recommendations**\n\n` +
                `- Enabled: ${status.enabled ? "yes" : "no"}\n` +
                `- Last sent: ${status.lastSentDate || "never"}\n\n` +
                `Use \`/recommendations on\` or \`/recommendations off\`.`
            );
            return;
        }

        // Command: /status - Show system status
        if (msg.text.trim() === "/status") {
            const sessionId = `${msg.channelId}:${msg.chatId}`;
            const stats = getSessionStats(sessionId);
            const allSessions = listSessions();
            const currentProvider = getProvider();
            
            // Get uptime
            const uptimeSeconds = process.uptime();
            const uptimeHours = Math.floor(uptimeSeconds / 3600);
            const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
            
            // Get database size
            let dbSize = "unknown";
            try {
                if (fs.existsSync("gravity.db")) {
                    const fileStats = fs.statSync("gravity.db");
                    const sizeKB = (fileStats.size / 1024).toFixed(2);
                    dbSize = `${sizeKB} KB`;
                }
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                log.warn(`Could not read DB file size: ${errMsg}`);
            }
            
            // Get memory usage
            const memUsage = process.memoryUsage();
            const memoryMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
            
            let statusMsg = "📊 **System Status**\n\n";
            statusMsg += `🔹 **Current Session**\n`;
            statusMsg += `├─ Messages: ${stats.messageCount}\n`;
            statusMsg += `├─ User messages: ${stats.userMessages}\n`;
            statusMsg += `├─ Assistant messages: ${stats.assistantMessages}\n`;
            statusMsg += `└─ Provider: ${stats.settings.provider || config.LLM_PROVIDER || "openrouter"}\n\n`;
            
            statusMsg += `🔹 **Global Stats**\n`;
            statusMsg += `├─ Active sessions: ${allSessions.length}\n`;
            statusMsg += `├─ Database size: ${dbSize}\n`;
            statusMsg += `├─ Memory usage: ${memoryMB} MB\n`;
            statusMsg += `├─ Uptime: ${uptimeHours}h ${uptimeMinutes}m\n`;
            statusMsg += `└─ Provider: ${currentProvider.name}\n`;
            
            await channel.sendMessage(msg.chatId, statusMsg);
            return;
        }

        // Command: /new - Create new conversation branch
        if (msg.text.trim().startsWith("/new")) {
            const baseSessionId = `${msg.channelId}:${msg.chatId}`;
            
            // Find next branch number
            const allSessions = listSessions();
            const existingBranches = allSessions.filter(s => s.startsWith(baseSessionId));
            let branchNum = 1;
            while (existingBranches.includes(`${baseSessionId}-branch-${branchNum}`)) {
                branchNum++;
            }
            
            const newSessionId = `${baseSessionId}-branch-${branchNum}`;
            
            // Copy current session settings to new branch (if any)
            const currentSettings = getSessionSettings(baseSessionId);
            if (Object.keys(currentSettings).length > 0) {
                const { setSessionSettings } = await import("../session.ts");
                setSessionSettings(newSessionId, currentSettings);
            }
            
            await channel.sendMessage(
                msg.chatId,
                `✨ **New conversation branch created!**\n\n` +
                `Branch ID: \`${newSessionId}\`\n\n` +
                `This is a fresh conversation with the same settings as your current session. ` +
                `To return to the main thread, use \`/reset\` (note: this will clear the current history).`
            );
            
            // Note: The session ID is still based on channelId:chatId, so this is more of a
            // conceptual branch. In a real implementation, you'd need to modify the session
            // resolution logic to support explicit branch switching.
            log.info(`Created new branch: ${newSessionId}`);
            return;
        }

        // Command: /compact - Trigger context pruning
        if (msg.text.trim() === "/compact") {
            try {
                const sessionSettings = getSessionSettings(msg.chatId);
                const modelName = sessionSettings.model || config.LLM_MODEL;
                const status = getPruningStatus(msg.chatId, modelName);

                await channel.sendMessage(
                    msg.chatId,
                    `📊 **Context Status**\n\n` +
                    `• Messages: ${status.messageCount}\n` +
                    `• Model: ${status.modelName}\n` +
                    `• Context window: ${status.contextWindow.toLocaleString()} tokens\n` +
                    `• Current usage: ${status.contextUsagePercent}%\n` +
                    `• Estimated tokens used: ${status.estimatedTokensUsed.toLocaleString()}\n\n` +
                    `${status.isNearLimit ? "⚠️ **Approaching limit!** Pruning context..." : "✅ Context usage healthy."}`
                );

                if (status.isNearLimit && status.messageCount >= 20) {
                    // Trigger automatic pruning
                    const result = await pruneContext(msg.chatId, modelName);
                    await channel.sendMessage(msg.chatId, formatPruningResult(result));
                } else {
                    await channel.sendMessage(
                        msg.chatId,
                        `No pruning needed yet. Pruning activates at 80% context usage.`
                    );
                }
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                log.error(`Error in /compact command: ${errMsg}`);
                await channel.sendMessage(msg.chatId, `❌ Error: ${errMsg}`);
            }
            return;
        }

        // Command: /usage - Show token usage stats
        if (msg.text.trim().startsWith("/usage")) {
            const parts = msg.text.trim().split(/\s+/);
            const subcommand = parts[1]?.toLowerCase();
            
            const sessionId = `${msg.channelId}:${msg.chatId}`;
            
            // Import usage functions
            const { formatPeriodUsage, formatUsageStats, getUsageStats } = await import("../usage.ts");
            
            if (subcommand === "detail" || subcommand === "details") {
                // Show detailed stats for this session
                const stats = getUsageStats(sessionId);
                const formatted = formatUsageStats(stats, "Session Usage Details");
                await channel.sendMessage(msg.chatId, formatted);
                return;
            }
            
            if (subcommand === "global") {
                // Show global stats across all sessions
                const stats = getUsageStats();
                const formatted = formatUsageStats(stats, "Global Usage Statistics");
                await channel.sendMessage(msg.chatId, formatted);
                return;
            }
            
            // Default: Show period breakdown (today/week/month/all-time)
            const formatted = formatPeriodUsage(sessionId);
            await channel.sendMessage(msg.chatId, formatted);
            return;
        }

        // Command: /graph <entity> [depth] - Query knowledge graph and render Mermaid
        if (msg.text.trim().startsWith("/graph")) {
            const parts = msg.text.trim().split(/\s+/).slice(1);
            const sessionId = `${msg.channelId}:${msg.chatId}`;

            if (parts.length === 0) {
                await channel.sendMessage(
                    msg.chatId,
                    "🕸️ **Knowledge Graph**\n\n" +
                    "Usage: `/graph <entity-name> [depth]`\n" +
                    "Example: `/graph GravityClaw 2`"
                );
                return;
            }

            const maybeDepth = Number(parts[parts.length - 1]);
            const hasDepth = Number.isFinite(maybeDepth);
            const depth = hasDepth ? Math.max(1, Math.min(5, Math.floor(maybeDepth))) : 2;
            const entityName = (hasDepth ? parts.slice(0, -1) : parts).join(" ").trim();

            if (!entityName) {
                await channel.sendMessage(msg.chatId, "❌ Please provide an entity name.");
                return;
            }

            const result = queryGraph(sessionId, entityName, depth);
            if (!result) {
                await channel.sendMessage(
                    msg.chatId,
                    `ℹ️ No graph data found for entity: **${entityName}**\n\n` +
                    "Tip: Save nodes with `save_entity` and edges with `save_relationship`."
                );
                return;
            }

            const mermaid = formatGraphAsMermaid(result);
            await channel.sendMessage(
                msg.chatId,
                `🕸️ **Graph for ${result.rootEntity.name}**\n` +
                `Depth: ${result.depth}\n` +
                `Entities: ${result.entities.length}\n` +
                `Relationships: ${result.relationships.length}\n\n` +
                `\`\`\`mermaid\n${mermaid}\n\`\`\``
            );
            return;
        }

        // Command: /think - Set thinking level
        if (msg.text.trim().startsWith("/think")) {
            const parts = msg.text.trim().split(/\s+/);
            const level = parts[1]?.toLowerCase();
            
            // Import thinking module
            const { isValidThinkingLevel, formatThinkingLevelsForDisplay, getThinkingConfig } = await import("../thinking.ts");
            
            if (!level) {
                // Show current level and available options
                const sessionId = `${msg.channelId}:${msg.chatId}`;
                const settings = getSessionSettings(sessionId);
                const currentLevel = settings.thinkingLevel || "off";
                
                const levelsDisplay = formatThinkingLevelsForDisplay();
                await channel.sendMessage(
                    msg.chatId,
                    `🧠 **Current Thinking Level**: ${currentLevel}\n\n` +
                    levelsDisplay
                );
                return;
            }
            
            if (!isValidThinkingLevel(level)) {
                await channel.sendMessage(
                    msg.chatId,
                    `❌ Invalid thinking level: "${level}"\n\n` +
                    `Valid levels: off, low, medium, high\n\n` +
                    `Use \`/think\` with no arguments to see all options.`
                );
                return;
            }
            
            // Store setting
            const sessionId = `${msg.channelId}:${msg.chatId}`;
            updateSessionSetting(sessionId, "thinkingLevel", level);
            
            const config = getThinkingConfig(level);
            await channel.sendMessage(
                msg.chatId,
                `✅ Thinking level set to: **${level}** (${config.name})\n\n` +
                `${config.description}\n\n` +
                `This setting applies to this conversation only.`
            );
            return;
        }

        // Command: /mesh <goal> - Start a mesh workflow
        if (msg.text.trim().startsWith("/mesh")) {
            const sessionId = `${msg.channelId}:${msg.chatId}`;
            const goal = msg.text.trim().slice(5).trim();

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

        // Command: /plugins - List loaded plugins
        if (msg.text.trim() === "/plugins") {
            try {
                const allPlugins = pluginRegistry.listPlugins();
                
                if (allPlugins.length === 0) {
                    await channel.sendMessage(
                        msg.chatId,
                        `🔌 **Plugins**\n\n` +
                        `No plugins currently loaded.\n\n` +
                        `To add plugins, create plugin packages in the \`plugins/\` directory ` +
                        `with a \`plugin.json\` manifest file.`
                    );
                    return;
                }
                
                let pluginMsg = `🔌 **Loaded Plugins** (${allPlugins.length})\n\n`;
                
                for (const plugin of allPlugins) {
                    pluginMsg += `**${plugin.name}** v${plugin.version}\n`;
                    if (plugin.description) {
                        pluginMsg += `  ${plugin.description}\n`;
                    }
                    
                    // Show traits
                    if (plugin.traits && plugin.traits.length > 0) {
                        const traitNames = plugin.traits
                            .map((t: string) => t.charAt(0).toUpperCase() + t.slice(1))
                            .join(", ");
                        pluginMsg += `  Traits: ${traitNames}\n`;
                    }
                    
                    pluginMsg += "\n";
                }
                
                pluginMsg += `\nUse \`/help plugins\` for more information about the plugin system.`;
                
                await channel.sendMessage(msg.chatId, pluginMsg);
            } catch (err) {
                log.error("Error listing plugins", err);
                await channel.sendMessage(
                    msg.chatId,
                    `❌ Error loading plugin list. Check logs for details.`
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

                // Send individual agent results
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
                channel.sendTyping!(msg.chatId).catch(() => { });
            }, 4000);
        }

        try {
            const result = await runWithConcurrencyLimit(key, () => runAgent({
                message: msg.text,
                sessionId: key,
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
