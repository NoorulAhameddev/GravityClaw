import "./config.ts"; // validate env first — exits if misconfigured
import { enforceAirGap } from "./airgap/enforcement.ts";
import { registry } from "./tools/index.ts";
import { datetimeTool, shellTool, searchAttachmentsTool, fileOperationTools } from "./tools/system/index.ts";
import { saveFactTool, recallFactsTool, saveEntityTool, saveRelationshipTool, queryGraphTool, searchMemorySemanticTool, searchTools, memoryTools } from "./tools/memory/index.ts";
import { voiceTools, ttsTools, elevenLabsTools, voiceSettingsTools, wakeWordTools, talkModeTools } from "./tools/voice/index.ts";
import { browserTools } from "./tools/automation/index.ts";
import { schedulerTools, registerTaskExecutionHandler } from "./scheduler/index.ts";
import { webhookTools } from "./webhooks/index.ts";
import { mcpTools, mcpClient } from "./mcp/index.ts";
import { skillManagementTools, skillsManager } from "./skills/index.ts";
import { spawnAgentTool, aggregateResultsTool, communicationTools, adminTools } from "./tools/core/index.ts";
import { canvasPushTool } from "./canvas/index.ts";
import { heartbeatTools, isHeartbeatTask, markHeartbeatRun, isHeartbeatResponseNoteworthy, isHeartbeatEnabledForSession } from "./heartbeat/index.ts";
import { dashboardTools, uiAdminTools } from "./tools/ui/index.ts";
import { securityTools } from "./tools/security/index.ts";
import { exportChatHistoryTool, exportMemoryTool, exportUsageStatsTool, exportGraphTool } from "./tools/export/index.ts";
import { backupTools } from "./tools/backup/index.ts";
import { initializeBackupSystem, stopBackupScheduler, DEFAULT_BACKUP_CONFIG } from "./backup/index.ts";
import { EVENING_RECAP_PROMPT, buildEveningRecap } from "./recap/index.ts";
import { startDailyRecommendations } from "./recommendations/index.ts";
import { runAgent } from "./agent.ts";
import { ChannelRouter } from "./channels/router.ts";
import { TelegramChannel } from "./channels/telegram.ts";
import { WhatsAppChannel } from "./channels/whatsapp.ts";
import { WebChatChannel } from "./channels/webchat.ts";
import { createLogger } from "./logger.ts";
import { db } from "./db.ts";
import path from "path";
import { fileURLToPath } from "url";
import { validateSecurityConfiguration } from "./security/startup-validation.ts";
import {
    initializePerformanceOptimizations,
    initializeMemoryOptimizations,
    precompileCommonPatterns,
} from "./performance/index.ts";

import { initializePlugins } from "./plugins/registry.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "../gravity.db");

const log = createLogger("main");

// Register all tools
registry.register(datetimeTool);
registry.register(shellTool);
registry.register(saveFactTool);
registry.register(recallFactsTool);
registry.register(saveEntityTool);
registry.register(saveRelationshipTool);
registry.register(queryGraphTool);
registry.register(searchAttachmentsTool);
registry.register(searchMemorySemanticTool);
voiceTools.forEach(tool => registry.register(tool));
ttsTools.forEach(tool => registry.register(tool));
elevenLabsTools.forEach(tool => registry.register(tool));
voiceSettingsTools.forEach(tool => registry.register(tool));
wakeWordTools.forEach(tool => registry.register(tool));
talkModeTools.forEach(tool => registry.register(tool));
fileOperationTools.forEach(tool => registry.register(tool));
searchTools.forEach(tool => registry.register(tool));
browserTools.forEach(tool => registry.register(tool));
schedulerTools.forEach(tool => registry.register(tool));
webhookTools.forEach(tool => registry.register(tool));
mcpTools.forEach(tool => registry.register(tool));
skillManagementTools.forEach(tool => registry.register(tool));
communicationTools.forEach(tool => registry.register(tool));
heartbeatTools.forEach(tool => registry.register(tool));
dashboardTools.forEach(tool => registry.register(tool));
uiAdminTools.forEach(tool => registry.register(tool));
securityTools.forEach(tool => registry.register(tool));
registry.register(exportChatHistoryTool);
registry.register(exportMemoryTool);
registry.register(exportUsageStatsTool);
registry.register(exportGraphTool);
backupTools.forEach(tool => registry.register(tool));
memoryTools.forEach(tool => registry.register(tool));
adminTools.forEach(tool => registry.register(tool));
registry.register(spawnAgentTool);
registry.register(aggregateResultsTool);
registry.register(canvasPushTool);

async function main() {
    // Enforce air-gapped mode (if enabled)
    try {
        await enforceAirGap();
    } catch (err) {
        log.error("Air-gap enforcement failed", err);
        process.exit(1);
    }

    // Validate security configuration
    try {
        validateSecurityConfiguration();
    } catch (err) {
        log.error("Security validation failed", err);
        process.exit(1);
    }

    // Initialize performance monitoring and optimizations
    try {
        initializePerformanceOptimizations();
        initializeMemoryOptimizations();
        precompileCommonPatterns();
        log.info("✅ Performance optimizations initialized");
    } catch (err) {
        log.warn("⚠️  Warning: Performance optimization initialization failed", { error: err });
        // Do not exit - performance monitoring is optional
    }

    // Initialize plugin system
    await initializePlugins();
    
    // Initialize MCP client (Model Context Protocol bridge)
    await mcpClient.initialize();
    
    // Initialize skills system
    await skillsManager.initialize();
    const skillTools = skillsManager.getSkillTools();
    skillTools.forEach(tool => registry.register(tool));

    // Initialize backup system
    try {
        await initializeBackupSystem(db, dbPath, {
            enabled: DEFAULT_BACKUP_CONFIG.enabled,
            cronExpression: DEFAULT_BACKUP_CONFIG.cronExpression,
            retentionDays: DEFAULT_BACKUP_CONFIG.retentionDays,
            encryptBackups: DEFAULT_BACKUP_CONFIG.encryptBackups,
            compressBackups: DEFAULT_BACKUP_CONFIG.compressBackups,
        });
        log.info("✅ Backup system initialized and scheduler started");
    } catch (err) {
        log.error("⚠️  Warning: Backup system initialization failed", err);
        // Do not exit - backup is optional
    }

    // Dynamic tool listing
    const tools = registry.getOpenAIDefinitions().map(d => d.function.name);
    log.info("🦾 Gravity Claw starting…");
    log.info(`Registered tools: ${tools.join(", ")}`);

    const router = new ChannelRouter();
    router.register(new TelegramChannel());
    router.register(new WhatsAppChannel());
    router.register(new WebChatChannel());

    registerTaskExecutionHandler(async (taskId, sessionId, prompt) => {
        // Heartbeat tasks: send only when noteworthy
        if (isHeartbeatTask(taskId)) {
            if (!isHeartbeatEnabledForSession(sessionId)) {
                return;
            }

            const result = await runAgent({
                message: prompt,
                sessionId,
            });

            markHeartbeatRun(taskId);

            if (isHeartbeatResponseNoteworthy(result.text)) {
                await router.sendProactiveToSession(sessionId, `💓 **Heartbeat Update**\n\n${result.text.trim()}`);
            }
            return;
        }

        // Evening recap uses a deterministic report generator
        if (prompt.trim() === EVENING_RECAP_PROMPT) {
            const recap = buildEveningRecap(sessionId, "scheduled");
            if (recap.success && recap.reportMarkdown) {
                await router.sendProactiveToSession(sessionId, recap.reportMarkdown);
            }
            return;
        }

        // Generic scheduled tasks
        const result = await runAgent({
            message: prompt,
            sessionId,
        });

        const text = result.text.trim();
        if (text) {
            await router.sendProactiveToSession(sessionId, text);
        }
    });

    // ADD ERROR HANDLING FOR CHANNEL STARTUP
    try {
        log.info("🚀 Starting all channels...");
        await router.startAll();
        log.info("✅ All channels started successfully");
    } catch (err) {
        log.error("❌ FATAL: Channel startup failed, exiting", err);
        process.exit(1);
    }

    const recommendationsRuntime = startDailyRecommendations((sessionId, text) => router.sendProactiveToSession(sessionId, text));

    // Graceful shutdown
    const shutdown = async (signal: string) => {
        log.info(`${signal} received — stopping router…`);
        recommendationsRuntime.stop();
        stopBackupScheduler();
        await router.stopAll();
        await mcpClient.shutdown();
        await skillsManager.shutdown();
        process.exit(0);
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
    log.error("Fatal error during startup", err);
    process.exit(1);
});
