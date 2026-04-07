import Database from "better-sqlite3";
import "./config.ts"; // validate env first — exits if misconfigured
import { enforceAirGap } from "./airgap/enforcement.ts";
import { registry, registerBuiltInTools } from "./tools/index.ts";
import { bootstrap } from "./bootstrap.ts";
import { initializeBackupSystem, stopBackupScheduler, DEFAULT_BACKUP_CONFIG } from "./backup/index.ts";
import { EVENING_RECAP_PROMPT, buildEveningRecap } from "./recap/index.ts";
import { startDailyRecommendations } from "./recommendations/index.ts";
import { runAgent } from "./agent.ts";
import { ChannelRouter } from "./channels/router.ts";
import { TelegramChannel } from "./channels/telegram.ts";
import { WhatsAppChannel } from "./channels/whatsapp.ts";
import { WebChatChannel } from "./channels/webchat.ts";
import { DiscordChannel } from "./channels/discord.ts";
import { SlackChannel } from "./channels/slack.ts";
import { SignalChannel } from "./channels/signal.ts";
import { MobileChannel } from "./channels/mobile.ts";
import { mobileGateway } from "./gateway/mobile.ts";
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
import { initializePlugins, pluginRegistry } from "./plugins/registry.ts";
import { mcpClient } from "./mcp/index.ts";
import { skillsManager } from "./skills/index.ts";
import { registerTaskExecutionHandler } from "./scheduler/index.ts";
import { isHeartbeatTask, isHeartbeatEnabledForSession, markHeartbeatRun, isHeartbeatResponseNoteworthy } from "./heartbeat/index.ts";
import { withSpanAsync, injectTraceContext, extractTraceContext } from "./lib/telemetry/tracer.js";
import { telemetryLogger } from "./lib/telemetry/logger.js";
import { context } from "@opentelemetry/api";
import { recordWorkerJob } from "./lib/telemetry/metrics.js";
import { getTaskQueue, getTask } from "./queue/index.ts";
import { setWhatsAppChannel } from "./server.ts";
import { config } from "./config.ts";
import { runWithConcurrencyLimit } from "./concurrency.ts";

// Initialize OpenTelemetry early (before any other imports that might be instrumented)
import { initializeTelemetry, shutdownTelemetry } from "./lib/telemetry/telemetry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "../gravity.db");

const log = createLogger("main");

// SECTION 8.2 — Global Error Handlers
process.on("uncaughtException", (err: Error) => {
    log.error("UNCAUGHT EXCEPTION", {
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString(),
    });
    telemetryLogger.error("uncaught_exception", {
        message: err.message,
        stack: err.stack,
    });
    shutdownTelemetry().catch(() => {});
    process.exit(1);
});

process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
    const reasonMessage = reason instanceof Error ? reason.message : String(reason);
    const reasonStack = reason instanceof Error ? reason.stack : undefined;
    log.error("UNHANDLED REJECTION", {
        reason: reasonMessage,
        stack: reasonStack,
        timestamp: new Date().toISOString(),
    });
    telemetryLogger.error("unhandled_rejection", {
        reason: reasonMessage,
        stack: reasonStack,
    });
    // Keep the process alive in long-running mode; errors are logged and can be investigated.
});

// Initialize telemetry before other modules
const otelEnabled = Boolean(config.OTEL_ENABLED);
await initializeTelemetry({
    enabled: otelEnabled,
    otlpEndpoint: otelEnabled ? config.OTEL_EXPORTER_OTLP_ENDPOINT ?? "" : "",
    serviceName: "gravyclaw",
    serviceVersion: "0.1.0",
});

// Initialize via composition root
const container = bootstrap();

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

    // Warn about API_KEY
    if (!config.API_KEY) {
        log.warn('⚠️  API_KEY not set - API endpoints are UNPROTECTED');
        log.warn('   Generate one: openssl rand -hex 32');
    } else if (config.API_KEY.length < 32) {
        log.warn('⚠️  API_KEY is weak (< 32 chars) - use: openssl rand -hex 32');
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

    // Initialize backup system
    try {
        await initializeBackupSystem(db as unknown as Database.Database, dbPath, {
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

    // Initialize background task queue if enabled
    if (config.QUEUE_ENABLED) {
        try {
            const queue = getTaskQueue();
            if (queue && "startWorker" in queue) {
                (queue as any).startWorker(async (task: any) => {
                    let ctx;
                    if (task._trace) {
                        ctx = extractTraceContext(task._trace);
                        if (!ctx) {
                            telemetryLogger.warn("invalid trace context, using active", { job_id: task.id });
                        }
                    }

                    return await context.with(ctx || context.active(), async () => {
                        return await withSpanAsync("worker.job", async (span) => {
                            span.setAttribute("job.id", task.id);
                            span.setAttribute("job.tool", task.toolName);

                            try {
                                telemetryLogger.info("worker started", { job_id: task.id, tool: task.toolName });
                                log.info(`Processing queued task: ${task.id} - ${task.toolName}`);
                                span.setAttribute("job.success", true);
                                recordWorkerJob("default", task.toolName, true);
                            } catch (err) {
                                span.setAttribute("job.success", false);
                                span.recordException(err as Error);
                                telemetryLogger.error("worker failed", { job_id: task.id, error: (err as Error).message });
                                recordWorkerJob("default", task.toolName, false);
                                throw err;
                            }
                        });
                    });
                }, config.QUEUE_CONCURRENCY);
                log.info("✅ Background task queue initialized");
            }
        } catch (err) {
            log.error("⚠️  Warning: Queue initialization failed", err);
        }
    }

    // Dynamic tool listing
    const tools = registry.getOpenAIDefinitions().map(d => d.function.name);
    const loadedPlugins = pluginRegistry.listPlugins();
    
    log.info("🦾 Gravity Claw starting…");
    log.info(`Registered tools: ${tools.join(", ")}`);
    log.info(`Plugins loaded: ${loadedPlugins.length}`);

    const router = new ChannelRouter();
    router.register(new TelegramChannel());
    const whatsappChannel = new WhatsAppChannel();
    router.register(whatsappChannel);
    router.register(new WebChatChannel());
    setWhatsAppChannel(whatsappChannel);

    const discordChannel = DiscordChannel.create();
    if (discordChannel) {
        router.register(discordChannel);
    }

    const slackChannel = SlackChannel.create();
    if (slackChannel) {
        router.register(slackChannel);
    }

    const signalChannel = SignalChannel.create();
    if (signalChannel) {
        router.register(signalChannel);
    }

    if (config.MOBILE_CHANNEL_ENABLED) {
        const mobileChannel = new MobileChannel();
        router.register(mobileChannel);
        log.info("📱 Mobile companion channel enabled");
    }

    registerTaskExecutionHandler(async (taskId, sessionId, prompt) => {
        // Heartbeat tasks: send only when noteworthy
        if (isHeartbeatTask(taskId)) {
            if (!isHeartbeatEnabledForSession(sessionId)) {
                return;
            }

            const result = await runWithConcurrencyLimit(sessionId, () => runAgent({
                message: prompt,
                sessionId,
                dependencies: {
                    config: container.config,
                    toolRegistry: container.toolRegistry,
                    db: container.db,
                },
            }));

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
        const result = await runWithConcurrencyLimit(sessionId, () => runAgent({
            message: prompt,
            sessionId,
            dependencies: {
                config: container.config,
                toolRegistry: container.toolRegistry,
                db: container.db,
            },
        }));

        const text = result.text.trim();
        if (text) {
            await router.sendProactiveToSession(sessionId, text);
        }
    });

    // Start channels with graceful degradation - don't exit on failure
    try {
        log.info("🚀 Starting all channels...");
        const channelStatuses = await router.startAll();
        const startedCount = channelStatuses.filter(s => s.started).length;
        const totalCount = channelStatuses.length;
        
        if (startedCount === 0) {
            log.error("❌ No channels started - system running in headless mode");
        } else if (startedCount < totalCount) {
            log.warn(`⚠️  Partial channel startup: ${startedCount}/${totalCount} started`);
            channelStatuses.filter(s => !s.started).forEach(s => {
                log.warn(`  - ${s.id}: ${s.error}`);
            });
        } else {
            log.info(`✅ All ${totalCount} channels started successfully`);
        }
    } catch (err) {
        log.error("❌ Channel startup failed - continuing with available channels", err);
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
