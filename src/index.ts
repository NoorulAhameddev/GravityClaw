import Database from "better-sqlite3";
import "./config.ts"; // validate env first — exits if misconfigured
import { enforceAirGap } from "./airgap/enforcement.ts";
import { registry, registerBuiltInTools } from "./tools/index.ts";
import { bootstrap } from "./bootstrap.ts";
import { initializeBackupSystem, stopBackupScheduler, createBackup, verifyBackup, DEFAULT_BACKUP_CONFIG } from "./backup/index.ts";
import { EVENING_RECAP_PROMPT, buildEveningRecap } from "./recap/index.ts";
import { startDailyRecommendations } from "./recommendations/index.ts";
import { startAutoDreamScheduler } from "./memory/autoDream.ts";
import { runAgent } from "./agent.ts";
import { destroyProvider } from "./llm/index.ts";
import { ChannelRouter } from "./channels/router.ts";
import type { Channel } from "./types/channels.js";
import { TelegramChannel } from "./channels/telegram.ts";
import { WebChatChannel } from "./channels/webchat.ts";
import { createLogger } from "./logger.ts";
import { db } from "./db.ts";
import { stopServer } from "./server.ts";
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
import { destroyAllPools } from "./mcp/pool.ts";
import { skillsManager } from "./skills/index.ts";
import { registerTaskExecutionHandler } from "./scheduler/index.ts";
import { isHeartbeatTask, isHeartbeatEnabledForSession, markHeartbeatRun, isHeartbeatResponseNoteworthy } from "./heartbeat/index.ts";
import { telemetryLogger } from "./lib/telemetry/logger.js";
import { getTaskQueue } from "./queue/index.ts";
import { startBackgroundWorker } from "./queue/worker.ts";
import { config } from "./config.ts";
import { closePgPool } from "./db-pg.ts";
import { runWithConcurrencyLimit } from "./concurrency.ts";

// Initialize OpenTelemetry early (before any other imports that might be instrumented)
import { initializeTelemetry, shutdownTelemetry } from "./lib/telemetry/telemetry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "../gravity.db");

const log = createLogger("main");

import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

// SECTION 8.2 — Global Error Handlers
if (config.SENTRY_DSN) {
    Sentry.init({
        dsn: config.SENTRY_DSN,
        integrations: [nodeProfilingIntegration()],
        tracesSampleRate: 0.1,
        profilesSampleRate: 0.1,
        environment: process.env.NODE_ENV || "development",
    });
}

process.on("uncaughtException", (err: Error) => {
    if (config.SENTRY_DSN) Sentry.captureException(err);
    log.error("UNCAUGHT EXCEPTION", {
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString(),
    });
    telemetryLogger.error("uncaught_exception", {
        message: err.message,
        stack: err.stack,
    });
    shutdownTelemetry().catch((err) => log.error("Failed to shutdown telemetry", err));
    process.exit(1);
});

process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
    if (config.SENTRY_DSN) Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)));
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
        throw err;
    }

    // Validate security configuration
    try {
        validateSecurityConfiguration();
    } catch (err) {
        log.error("Security validation failed", err);
        throw err;
    }

    // Enforce API_KEY in all environments
    if (!config.API_KEY) {
        const isDev = process.env.NODE_ENV !== "production";
        const msg = isDev
            ? '⚠️  API_KEY not set - API endpoints are UNPROTECTED. Generate one: openssl rand -hex 32'
            : '❌ API_KEY is required in production. Generate one: openssl rand -hex 32';
        
        if (isDev) {
            log.warn(msg);
        } else {
            log.error(msg);
            throw new Error(msg);
        }
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

    // Initialize background worker
    if (config.QUEUE_ENABLED) {
        log.info("Initializing task queue worker...");
        try {
            startBackgroundWorker(container);
            log.info("✅ Background task queue initialized");
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
    
    // Register only Telegram and WebChat channels
    const channelClasses: Array<{ create(): Channel | null; name: string }> = [
        TelegramChannel,
        WebChatChannel,
    ];

    for (const ChannelClass of channelClasses) {
        try {
            const instance = ChannelClass.create();
            if (instance) {
                router.register(instance);
                log.info(`✅ Registered channel: ${instance.id}`);
            }
        } catch (err: any) {
            log.warn(`⚠️ Failed to register channel ${ChannelClass.name}:`, err);
        }
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
        log.info(`${signal} received — stopping services…`);
        recommendationsRuntime.stop();
        stopBackupScheduler();

        try {
            const backupFilename = await createBackup(db as unknown as Database.Database, dbPath);
            const backupPath = path.join(DEFAULT_BACKUP_CONFIG.backupDir, backupFilename);
            const result = verifyBackup(backupPath);
            if (result.valid) {
                log.info(`Final backup verified: ${backupFilename} (${result.size} bytes)`);
            } else {
                log.warn(`Final backup verification issues: ${result.errors.join("; ")}`);
            }
        } catch (err) {
            log.error("Failed to create or verify final backup", err);
        }
        
        try {
            await stopServer();
        } catch (err) {
            log.error("Error stopping server", err);
        }
        
        if (config.QUEUE_ENABLED) {
            getTaskQueue().stopWorker?.();
        }
        
        await router.stopAll();
        destroyProvider();
        await mcpClient.shutdown();
        await destroyAllPools();
        await skillsManager.shutdown();
        
        try {
            await closePgPool();
        } catch (err) {
            log.error("Error closing PostgreSQL pool", err);
        }

        try {
            db.close?.();
            log.info("Database connection closed");
        } catch (err) {
            log.error("Error closing database", err);
        }
        
        process.exit(0);
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
    log.error("Fatal error during startup", err);
    process.exit(1);
});
