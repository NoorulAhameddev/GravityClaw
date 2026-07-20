import { getSessionSettings, updateSessionSetting, getSessionStats, listSessions } from "../../session.ts";
import { getProvider, FailoverProvider } from "../../llm/index.ts";
import { config } from "../../config.ts";
import { pluginRegistry } from "../../plugins/registry.ts";
import { pruneContext, getPruningStatus, formatPruningResult } from "../../memory/pruning.ts";
import { queryGraph, formatGraphAsMermaid } from "../../memory/graph.ts";
import { getHeartbeatStatus, setHeartbeatEnabled } from "../../heartbeat/index.ts";
import { buildEveningRecap } from "../../recap/index.ts";
import { getRecommendationsStatus, setRecommendationsEnabled } from "../../recommendations/index.ts";
import { createLogger } from "../../logger.ts";
import * as fs from "fs";
import type { CommandContext } from "./index.ts";

const log = createLogger("commands");

export async function handleFailover(ctx: CommandContext): Promise<boolean> {
  const { msg, channel } = ctx;
  const provider = getProvider();

  if (!(provider instanceof FailoverProvider)) {
    await channel.sendMessage(
      msg.chatId,
      "Failover mode is not currently enabled.\n\nTo enable failover, set `LLM_PROVIDER=failover` in your .env file and configure `LLM_FAILOVER_LIST` with comma-separated provider names (e.g., `openai,anthropic,openrouter`)."
    );
    return true;
  }

  const health = provider.getHealthStatus();
  let statusMsg = "**Failover Provider Status**\n\n";

  for (const h of health) {
    const statusIcon = h.isCircuitOpen ? "CIRCUIT OPEN" : "Available";
    const successRate = h.totalCalls > 0
      ? ((h.totalSuccesses / h.totalCalls) * 100).toFixed(1)
      : "N/A";

    statusMsg += `**${h.name}**: ${statusIcon}\n`;
    statusMsg += `Total calls: ${h.totalCalls}\n`;
    statusMsg += `Successes: ${h.totalSuccesses}\n`;
    statusMsg += `Failures: ${h.totalFailures}\n`;
    statusMsg += `Success rate: ${successRate}%\n`;
    statusMsg += `Consecutive failures: ${h.consecutiveFailures}\n`;

    if (h.isCircuitOpen && h.lastFailureTime > 0) {
      const timeSinceFailure = Date.now() - h.lastFailureTime;
      const secondsAgo = Math.floor(timeSinceFailure / 1000);
      statusMsg += `Circuit will reset in ${Math.max(0, 60 - secondsAgo)}s\n`;
    } else {
      statusMsg += `Status: Healthy\n`;
    }
    statusMsg += "\n";
  }

  await channel.sendMessage(msg.chatId, statusMsg.trim());
  return true;
}

export async function handleHeartbeat(ctx: CommandContext): Promise<boolean> {
  const { msg, channel, sessionId } = ctx;
  const parts = msg.text.trim().split(/\s+/);
  const subcommand = parts[1]?.toLowerCase() || "status";

  if (subcommand === "enable") {
    const result = setHeartbeatEnabled(sessionId, true);
    if (!result.success) {
      await channel.sendMessage(msg.chatId, `Failed to enable heartbeat: ${result.error}`);
      return true;
    }
    await channel.sendMessage(msg.chatId, `Heartbeat enabled (${result.affected} prompt task${result.affected === 1 ? "" : "s"} active).`);
    return true;
  }

  if (subcommand === "disable") {
    const result = setHeartbeatEnabled(sessionId, false);
    if (!result.success) {
      await channel.sendMessage(msg.chatId, `Failed to disable heartbeat: ${result.error}`);
      return true;
    }
    await channel.sendMessage(msg.chatId, `Heartbeat disabled (${result.affected} prompt task${result.affected === 1 ? "" : "s"} paused).`);
    return true;
  }

  if (subcommand !== "status") {
    await channel.sendMessage(msg.chatId, "Usage: `/heartbeat status`, `/heartbeat enable`, or `/heartbeat disable`");
    return true;
  }

  const status = getHeartbeatStatus(sessionId);
  await channel.sendMessage(
    msg.chatId,
    `**Heartbeat Status**\n\n` +
    `Enabled: ${status.enabled ? "yes" : "no"}\n` +
    `Interval (minutes): ${status.intervalMinutes}\n` +
    `Total prompts: ${status.taskCount}\n` +
    `Active prompts: ${status.activeTaskCount}\n` +
    `Last run: ${status.lastRun || "never"}\n` +
    `Next run: ${status.nextRun || "n/a"}`
  );
  return true;
}

export async function handleRecap(ctx: CommandContext): Promise<boolean> {
  const { msg, channel, sessionId } = ctx;
  const recap = buildEveningRecap(sessionId, "manual");

  if (!recap.success || !recap.reportMarkdown) {
    await channel.sendMessage(msg.chatId, `Failed to generate recap: ${recap.error || "unknown error"}`);
    return true;
  }

  await channel.sendMessage(msg.chatId, recap.reportMarkdown);
  return true;
}

export async function handleRecommendations(ctx: CommandContext): Promise<boolean> {
  const { msg, channel, sessionId } = ctx;
  const parts = msg.text.trim().split(/\s+/);
  const subcommand = parts[1]?.toLowerCase();

  if (subcommand === "off") {
    setRecommendationsEnabled(sessionId, false);
    await channel.sendMessage(msg.chatId, "Smart recommendations disabled for this session.");
    return true;
  }

  if (subcommand === "on") {
    setRecommendationsEnabled(sessionId, true);
    await channel.sendMessage(msg.chatId, "Smart recommendations enabled for this session.");
    return true;
  }

  const status = getRecommendationsStatus(sessionId);
  await channel.sendMessage(
    msg.chatId,
    `**Recommendations**\n\n` +
    `Enabled: ${status.enabled ? "yes" : "no"}\n` +
    `Last sent: ${status.lastSentDate || "never"}\n\n` +
    `Use \`/recommendations on\` or \`/recommendations off\`.`
  );
  return true;
}

export async function handleStatus(ctx: CommandContext): Promise<boolean> {
  const { msg, channel, sessionId } = ctx;
  const stats = getSessionStats(sessionId);
  const allSessions = listSessions();
  const currentProvider = getProvider();

  const uptimeSeconds = process.uptime();
  const uptimeHours = Math.floor(uptimeSeconds / 3600);
  const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);

  let dbSize = "unknown";
  try {
    if (fs.existsSync("gravity.db")) {
      const fileStats = fs.statSync("gravity.db");
      const sizeKB = (fileStats.size / 1024).toFixed(2);
      dbSize = `${sizeKB} KB`;
    }
  } catch (err) {
    log.warn(`Could not read DB file size: ${err}`);
  }

  const memUsage = process.memoryUsage();
  const memoryMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);

  let statusMsg = "**System Status**\n\n";
  statusMsg += `**Current Session**\n`;
  statusMsg += `Messages: ${stats.messageCount}\n`;
  statusMsg += `User messages: ${stats.userMessages}\n`;
  statusMsg += `Assistant messages: ${stats.assistantMessages}\n`;
  statusMsg += `Provider: ${stats.settings.provider || config.LLM_PROVIDER || "openrouter"}\n\n`;

  statusMsg += `**Global Stats**\n`;
  statusMsg += `Active sessions: ${allSessions.length}\n`;
  statusMsg += `Database size: ${dbSize}\n`;
  statusMsg += `Memory usage: ${memoryMB} MB\n`;
  statusMsg += `Uptime: ${uptimeHours}h ${uptimeMinutes}m\n`;
  statusMsg += `Provider: ${currentProvider.name}\n`;

  await channel.sendMessage(msg.chatId, statusMsg);
  return true;
}

export async function handleNew(ctx: CommandContext): Promise<boolean> {
  const { msg, channel, sessionId } = ctx;
  const allSessions = listSessions();
  const existingBranches = allSessions.filter(s => s.startsWith(sessionId));
  let branchNum = 1;
  while (existingBranches.includes(`${sessionId}-branch-${branchNum}`)) {
    branchNum++;
  }

  const newSessionId = `${sessionId}-branch-${branchNum}`;
  const currentSettings = getSessionSettings(sessionId);
  if (Object.keys(currentSettings).length > 0) {
    const { setSessionSettings } = await import("../../session.ts");
    setSessionSettings(newSessionId, currentSettings);
  }

  await channel.sendMessage(
    msg.chatId,
    `**New conversation branch created!**\n\n` +
    `Branch ID: \`${newSessionId}\`\n\n` +
    `This is a fresh conversation with the same settings as your current session.`
  );

  log.info(`Created new branch: ${newSessionId}`);
  return true;
}

export async function handleCompact(ctx: CommandContext): Promise<boolean> {
  const { msg, channel } = ctx;
  try {
    const sessionSettings = getSessionSettings(msg.chatId);
    const modelName = sessionSettings.model || config.LLM_MODEL;
    const status = getPruningStatus(msg.chatId, modelName);

    await channel.sendMessage(
      msg.chatId,
      `**Context Status**\n\n` +
      `Messages: ${status.messageCount}\n` +
      `Model: ${status.modelName}\n` +
      `Context window: ${status.contextWindow.toLocaleString()} tokens\n` +
      `Current usage: ${status.contextUsagePercent}%\n` +
      `Estimated tokens used: ${status.estimatedTokensUsed.toLocaleString()}\n\n` +
      `${status.isNearLimit ? "Approaching limit! Pruning context..." : "Context usage healthy."}`
    );

    if (status.isNearLimit && status.messageCount >= 20) {
      const result = await pruneContext(msg.chatId, modelName);
      await channel.sendMessage(msg.chatId, formatPruningResult(result));
    } else {
      await channel.sendMessage(msg.chatId, "No pruning needed yet. Pruning activates at 80% context usage.");
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error(`Error in /compact command: ${errMsg}`);
    await channel.sendMessage(msg.chatId, `Error: ${errMsg}`);
  }
  return true;
}

export async function handleUsage(ctx: CommandContext): Promise<boolean> {
  const { msg, channel, sessionId } = ctx;
  const parts = msg.text.trim().split(/\s+/);
  const subcommand = parts[1]?.toLowerCase();

  const { formatPeriodUsage, formatUsageStats, getUsageStats } = await import("../../usage.ts");

  if (subcommand === "detail" || subcommand === "details") {
    const stats = getUsageStats(sessionId);
    const formatted = formatUsageStats(stats, "Session Usage Details");
    await channel.sendMessage(msg.chatId, formatted);
    return true;
  }

  if (subcommand === "global") {
    const stats = getUsageStats();
    const formatted = formatUsageStats(stats, "Global Usage Statistics");
    await channel.sendMessage(msg.chatId, formatted);
    return true;
  }

  const formatted = formatPeriodUsage(sessionId);
  await channel.sendMessage(msg.chatId, formatted);
  return true;
}

export async function handleGraph(ctx: CommandContext): Promise<boolean> {
  const { msg, channel, sessionId } = ctx;
  const parts = msg.text.trim().split(/\s+/).slice(1);

  if (parts.length === 0) {
    await channel.sendMessage(
      msg.chatId,
      "**Knowledge Graph**\n\n" +
      "Usage: `/graph <entity-name> [depth]`\n" +
      "Example: `/graph GravityClaw 2`"
    );
    return true;
  }

  const maybeDepth = Number(parts[parts.length - 1]);
  const hasDepth = Number.isFinite(maybeDepth);
  const depth = hasDepth ? Math.max(1, Math.min(5, Math.floor(maybeDepth))) : 2;
  const entityName = (hasDepth ? parts.slice(0, -1) : parts).join(" ").trim();

  if (!entityName) {
    await channel.sendMessage(msg.chatId, "Please provide an entity name.");
    return true;
  }

  const result = queryGraph(sessionId, entityName, depth);
  if (!result) {
    await channel.sendMessage(
      msg.chatId,
      `No graph data found for entity: **${entityName}**\n\n` +
      "Tip: Save nodes with `save_entity` and edges with `save_relationship`."
    );
    return true;
  }

  const mermaid = formatGraphAsMermaid(result);
  await channel.sendMessage(
    msg.chatId,
    `**Graph for ${result.rootEntity.name}**\n` +
    `Depth: ${result.depth}\n` +
    `Entities: ${result.entities.length}\n` +
    `Relationships: ${result.relationships.length}\n\n` +
    "```mermaid\n" + mermaid + "\n```"
  );
  return true;
}

export async function handleThink(ctx: CommandContext): Promise<boolean> {
  const { msg, channel, sessionId } = ctx;
  const parts = msg.text.trim().split(/\s+/);
  const level = parts[1]?.toLowerCase();

  const { isValidThinkingLevel, formatThinkingLevelsForDisplay, getThinkingConfig } = await import("../../thinking.ts");

  if (!level) {
    const settings = getSessionSettings(sessionId);
    const currentLevel = settings.thinkingLevel || "off";
    const levelsDisplay = formatThinkingLevelsForDisplay();
    await channel.sendMessage(msg.chatId, `**Current Thinking Level**: ${currentLevel}\n\n` + levelsDisplay);
    return true;
  }

  if (!isValidThinkingLevel(level)) {
    await channel.sendMessage(
      msg.chatId,
      `Invalid thinking level: "${level}"\n\n` +
      `Valid levels: off, low, medium, high\n\n` +
      `Use \`/think\` with no arguments to see all options.`
    );
    return true;
  }

  updateSessionSetting(sessionId, "thinkingLevel", level);

  const thinkingConfig = getThinkingConfig(level);
  await channel.sendMessage(
    msg.chatId,
    `Thinking level set to: **${level}** (${thinkingConfig.name})\n\n` +
    `${thinkingConfig.description}\n\n` +
    `This setting applies to this conversation only.`
  );
  return true;
}

export async function handlePlugins(ctx: CommandContext): Promise<boolean> {
  const { msg, channel } = ctx;
  try {
    const allPlugins = pluginRegistry.listPlugins();

    if (allPlugins.length === 0) {
      await channel.sendMessage(
        msg.chatId,
        "**Plugins**\n\n" +
        "No plugins currently loaded.\n\n" +
        "To add plugins, create plugin packages in the `plugins/` directory with a `plugin.json` manifest file."
      );
      return true;
    }

    let pluginMsg = `**Loaded Plugins** (${allPlugins.length})\n\n`;
    for (const plugin of allPlugins) {
      pluginMsg += `**${plugin.metadata.name}** v${plugin.metadata.version}\n`;
      if (plugin.metadata.description) {
        pluginMsg += `  ${plugin.metadata.description}\n`;
      }
      if (plugin.metadata.traits && plugin.metadata.traits.length > 0) {
        const traitNames = plugin.metadata.traits
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
    await channel.sendMessage(msg.chatId, "Error loading plugin list. Check logs for details.");
  }
  return true;
}

export async function handleShutdown(ctx: CommandContext): Promise<boolean> {
  const { msg, channel } = ctx;
  if (msg.channelId === "telegram" && msg.userId !== String(config.TELEGRAM_ALLOWED_USER_ID)) {
    await channel.sendMessage(msg.chatId, "Unauthorized: You do not have permission to shutdown the system.");
    return true;
  }

  await channel.sendMessage(msg.chatId, "**System Shutdown Initiated**\n\nClearing sessions and exiting process...");

  const { clearSessions } = await import("../../concurrency.ts");
  clearSessions();

  setTimeout(() => {
    log.warn(`Emergency shutdown triggered by user ${msg.userId}`);
    process.exit(0);
  }, 1500);
  return true;
}
