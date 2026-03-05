import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.ts";
import { createLogger } from "./logger.ts";
import cors from "cors";
import { getWebhookByName, verifySignature } from "./webhooks/index.ts";
import { registerCanvasClient } from "./canvas/index.ts";
import { parse } from "url";
import { db } from "./db.ts";
import {
    getMetricsSnapshot,
    exportPrometheusFormat,
} from "./observability/metrics.ts";
import { getActiveCorrelations } from "./observability/correlation.ts";
import { exportSpans, getTraceSpans } from "./observability/tracing.ts";
import metricsRouter from "./performance/metrics-api.ts";

const log = createLogger("server");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: "10mb" })); // Parse form data
export const server = createServer(app);
export const wss = new WebSocketServer({ server });

// Keep-alive mechanism for WebSocket connections
// Sends a ping every 30 seconds, closes connection if no pong received
setInterval(() => {
    wss.clients.forEach((client: any) => {
        if (client.isAlive === false) {
            return client.terminate();
        }
        client.isAlive = false;
        client.ping();
    });
}, 30000);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "../public")));

// Mount performance metrics API
app.use("/api/metrics", metricsRouter);

/**
 * Health check endpoint - returns server status and metrics
 * Response time: < 100ms
 */
app.get("/api/health", (req, res) => {
    const startTime = Date.now();

    try {
        // Get WebSocket client count
        const wsClients = (wss as any).clients?.size || 0;

        // Get memory statistics
        const memoryUsage = process.memoryUsage();

        // Get metrics
        const metrics = getMetricsSnapshot();

        // Check database connectivity
        let dbStatus = "ok";
        try {
            const result = db.prepare("SELECT 1 as ping").get() as any;
            dbStatus = result?.ping === 1 ? "ok" : "error";
        } catch (err) {
            dbStatus = "error";
            log.warn("Database health check failed", { error: err });
        }

        // Get memory facts count
        let factCount = 0;
        try {
            const result = db.prepare("SELECT COUNT(*) as count FROM memory WHERE type = 'fact'").get() as any;
            factCount = result?.count || 0;
        } catch {
            // Table might not exist yet
        }

        // Determine overall status
        const isHealthy = dbStatus === "ok";
        const status = isHealthy ? "ok" : "degraded";

        const health = {
            status,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            responseTime: Date.now() - startTime,
            server: {
                listening: true,
                port: config.PORT || 3000,
                wsClients,
            },
            database: {
                status: dbStatus,
                factsCount: factCount,
            },
            memory: {
                heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
                heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
                rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
            },
            metrics: {
                uptime: Math.round(metrics.uptime),
                requestCount: metrics.requestCount,
                toolCallCount: metrics.toolCallCount,
                errorCount: metrics.errorCount,
                avgToolLatencyMs: metrics.avgToolLatency ? Math.round(metrics.avgToolLatency) : null,
                avgMessageLatencyMs: metrics.avgMessageLatency ? Math.round(metrics.avgMessageLatency) : null,
                toolSuccessRate: Math.round(metrics.toolSuccessRate * 100) / 100,
            },
        };

        res.json(health);
    } catch (error) {
        log.error("Health check failed", error);
        res.status(503).json({
            status: "error",
            timestamp: new Date().toISOString(),
            message: "Health check failed",
        });
    }
});

/**
 * Metrics endpoint - returns metrics in Prometheus text format
 */
app.get("/metrics", (req, res) => {
    try {
        const metricsText = exportPrometheusFormat();
        res.set("Content-Type", "text/plain; charset=utf-8");
        res.send(metricsText);
    } catch (error) {
        log.error("Metrics export failed", error);
        res.status(500).json({
            status: "error",
            message: "Failed to export metrics",
        });
    }
});

/**
 * Metrics JSON endpoint - returns metrics as structured JSON
 */
app.get("/api/metrics", (req, res) => {
    try {
        const metrics = getMetricsSnapshot();
        const correlations = getActiveCorrelations();

        res.json({
            timestamp: new Date().toISOString(),
            metrics,
            correlations: {
                active: correlations.length,
                details: correlations.slice(0, 10), // Last 10
            },
        });
    } catch (error) {
        log.error("Metrics JSON export failed", error);
        res.status(500).json({
            status: "error",
            message: "Failed to export metrics",
        });
    }
});

/**
 * Tracing endpoint - returns traces for debugging
 */
app.get("/api/traces", (req, res) => {
    try {
        res.json({
            message: "Provide traceId as parameter",
            example: "/api/traces/{traceId}",
        });
    } catch (error) {
        log.error("Error getting traces:", error);
        res.status(500).json({ error: String(error) });
    }
});

app.get("/api/traces/:traceId", (req, res) => {
    try {
        const { traceId } = req.params;

        const spans = getTraceSpans(traceId);

        if (spans.length === 0) {
            res.status(404).json({
                error: "Trace not found",
                traceId,
            });
            return;
        }

        res.json({
            traceId,
            spanCount: spans.length,
            spans,
            duration: spans.reduce((max, s) => Math.max(max, s.duration || 0), 0),
        });
    } catch (error) {
        log.error("Trace export failed", error);
        res.status(500).json({
            status: "error",
            message: "Failed to export traces",
        });
    }
});

/**
 * WebSocket diagnostic endpoint - returns WebSocket info
 */
app.get("/api/ws-info", (req, res) => {
    const handlers = (wss as any)._events?.connection;
    const isHandlerRegistered = !!handlers;

    res.json({
        status: "ok",
        websocket: {
            server_exists: !!wss,
            handlers_registered: isHandlerRegistered,
            connected_clients: (wss as any).clients?.size || 0,
            ready_for_connections: wss && isHandlerRegistered
        }
    });
});

/**
 * Webhook endpoint handler
 * POST /webhook/:session_id/:hook_name
 * Receives webhook payloads and forwards them to the agent
 */
app.post("/webhook/:session_id/:hook_name", async (req, res) => {
    const { session_id, hook_name } = req.params;

    try {
        // Get webhook from database
        const webhook = getWebhookByName(decodeURIComponent(hook_name), session_id);

        if (!webhook) {
            log.warn(`Webhook not found: ${hook_name} for session ${session_id}`);
            return res.status(404).json({
                success: false,
                error: "Webhook not found",
            });
        }

        // Verify HMAC signature if secret exists
        if (webhook.secret) {
            const signature = req.headers["x-webhook-signature"] as string;

            if (!signature) {
                log.warn(`Missing signature for webhook: ${hook_name}`);
                return res.status(401).json({
                    success: false,
                    error: "Missing X-Webhook-Signature header",
                });
            }

            const payload = JSON.stringify(req.body);
            const isValid = verifySignature(payload, signature, webhook.secret);

            if (!isValid) {
                log.warn(`Invalid signature for webhook: ${hook_name}`);
                return res.status(401).json({
                    success: false,
                    error: "Invalid webhook signature",
                });
            }
        }

        // Log the webhook event
        log.info(`Webhook received: ${hook_name} (session: ${session_id})`);

        // Store the webhook event for the agent to process
        // The agent can read this via a tool or it will be injected as context
        // For now, we'll just acknowledge receipt
        // In a full implementation, you'd want to:
        // 1. Store the payload in a queue
        // 2. Trigger the agent to process it
        // 3. Send the result back to the webhook caller or the user's channel

        res.status(200).json({
            success: true,
            message: "Webhook received",
            webhook: {
                name: hook_name,
                session_id: session_id,
            },
            payload: req.body,
        });
    } catch (error: any) {
        log.error(`Error processing webhook: ${error}`);
        res.status(500).json({
            success: false,
            error: "Internal server error",
        });
    }
});

/**
 * Memory API - list sessions or messages for a specific session
 */
app.get("/api/memory", (req, res) => {
    try {
        const limit = Math.min(parseInt((req.query.limit as string) || "50"), 200);
        const sessionId = req.query.session as string | undefined;

        if (sessionId) {
            const rows = db.prepare(
                `SELECT id, session_id, timestamp, message_json
                 FROM memory WHERE session_id = ?
                 ORDER BY timestamp DESC LIMIT ?`
            ).all(sessionId, limit);
            res.json({ success: true, data: rows });
        } else {
            const rows = db.prepare(
                `SELECT session_id, COUNT(*) as message_count, MAX(timestamp) as last_active
                 FROM memory GROUP BY session_id
                 ORDER BY last_active DESC LIMIT ?`
            ).all(limit);
            res.json({ success: true, data: rows });
        }
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Tools API - list all registered tools with name and description
 */
app.get("/api/tools", async (req, res) => {
    try {
        const { registry } = await import("./tools/index.ts");
        const defs = registry.getOpenAIDefinitions();
        const tools = defs.map(d => ({
            name: d.function.name,
            description: d.function.description,
        }));
        res.json({ success: true, data: tools, count: tools.length });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Usage API - aggregate token usage statistics
 */
app.get("/api/usage", async (req, res) => {
    try {
        const { getUsageStats } = await import("./usage.ts");
        const allTime = getUsageStats();
        const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const today = getUsageStats(undefined, todayStart);
        const week = getUsageStats(undefined, weekAgo);

        // Convert models array to object keyed by model name (for dashboard compatibility)
        const modelsObj: Record<string, { calls: number; tokens: number; cost: number }> = {};
        allTime.models.forEach(m => { modelsObj[m.model] = { calls: m.calls, tokens: m.tokens, cost: m.cost }; });

        res.json({
            success: true,
            data: {
                byPeriod: {
                    today: { requests: today.totalCalls, tokens: today.totalTokens, cost: today.totalCost },
                    week: { requests: week.totalCalls, tokens: week.totalTokens, cost: week.totalCost },
                    allTime: { requests: allTime.totalCalls, tokens: allTime.totalTokens, cost: allTime.totalCost },
                },
                models: modelsObj,
                avgLatency: allTime.avgLatency,
            }
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Dashboard stats - combined counts for the overview page
 */
app.get("/api/stats", (req, res) => {
    try {
        const getCount = (sql: string) => (db.prepare(sql).get() as { count: number }).count;
        res.json({
            success: true,
            data: {
                sessions: getCount("SELECT COUNT(*) as count FROM sessions"),
                activeTasks: getCount("SELECT COUNT(*) as count FROM scheduled_tasks WHERE enabled = 1"),
                webhooks: getCount("SELECT COUNT(*) as count FROM webhooks"),
                swarms: getCount("SELECT COUNT(*) as count FROM agent_swarms"),
                workflows: getCount("SELECT COUNT(*) as count FROM workflows"),
                memorySessions: getCount("SELECT COUNT(DISTINCT session_id) as count FROM memory"),
                heartbeats: getCount("SELECT COUNT(*) as count FROM heartbeat_tasks WHERE enabled = 1"),
            }
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Scheduler tasks API
 */
app.get("/api/scheduler/tasks", (req, res) => {
    try {
        const tasks = db.prepare("SELECT * FROM scheduled_tasks ORDER BY created_at DESC LIMIT 100").all();
        res.json({ success: true, data: tasks });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Webhooks list API (secrets masked)
 */
app.get("/api/webhooks", (req, res) => {
    try {
        const webhooks = db.prepare(
            "SELECT id, name, session_id, created_at, created_by FROM webhooks ORDER BY created_at DESC LIMIT 100"
        ).all();
        res.json({ success: true, data: webhooks });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Sessions list API with message count
 */
app.get("/api/sessions", (req, res) => {
    try {
        const sessions = db.prepare(`
            SELECT s.id, s.allow_messages, s.created_at, s.updated_at,
                   COUNT(m.id) as message_count
            FROM sessions s
            LEFT JOIN memory m ON s.id = m.session_id
            GROUP BY s.id
            ORDER BY s.updated_at DESC LIMIT 100
        `).all();
        res.json({ success: true, data: sessions });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Agent swarms API
 */
app.get("/api/swarms", (req, res) => {
    try {
        const swarms = db.prepare(
            "SELECT * FROM agent_swarms ORDER BY created_at DESC LIMIT 100"
        ).all();
        res.json({ success: true, data: swarms });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Workflows API
 */
app.get("/api/workflows", (req, res) => {
    try {
        const workflows = db.prepare(
            "SELECT id, session_id, goal, status, progress, created_at, completed_at FROM workflows ORDER BY created_at DESC LIMIT 100"
        ).all();
        res.json({ success: true, data: workflows });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Heartbeat tasks API
 */
app.get("/api/heartbeats", (req, res) => {
    try {
        const heartbeats = db.prepare(
            "SELECT * FROM heartbeat_tasks ORDER BY created_at DESC LIMIT 100"
        ).all();
        res.json({ success: true, data: heartbeats });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/** 
 * Export API endpoints for downloading data
 */

/**
 * Download exported data file
 * GET /api/export/download?filename=...
 */
app.get("/api/export/download", (req, res) => {
    try {
        const { filename, data, format } = req.query;

        if (!data || typeof data !== "string") {
            return res.status(400).json({
                success: false,
                error: "Missing or invalid 'data' parameter",
            });
        }

        const filename_str = typeof filename === "string" ? filename : "export.bin";

        // Determine content type based on filename
        let contentType = "application/octet-stream";
        if (filename_str.endsWith(".json") || filename_str.endsWith(".json.gz")) {
            contentType = "application/json";
        } else if (filename_str.endsWith(".csv") || filename_str.endsWith(".csv.gz")) {
            contentType = "text/csv";
        } else if (filename_str.endsWith(".md") || filename_str.endsWith(".md.gz")) {
            contentType = "text/markdown";
        } else if (filename_str.endsWith(".graphml") || filename_str.endsWith(".graphml.gz")) {
            contentType = "application/graphml+xml";
        } else if (filename_str.endsWith(".gz")) {
            contentType = "application/gzip";
        }

        // Decode base64 data
        const buffer = Buffer.from(data, "base64");

        res.setHeader("Content-Type", contentType);
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${filename_str}"`
        );
        res.setHeader("Content-Length", buffer.length);
        res.send(buffer);

        log.info(`Downloaded export: ${filename_str}`);
    } catch (error: any) {
        log.error("Export download error", error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * Execute tool via API
 * POST /api/tools/execute
 * Body: { tool: string, input: Record<string, unknown> }
 */
app.post("/api/tools/execute", async (req, res) => {
    try {
        const { tool: toolName, input } = req.body;

        if (!toolName || typeof toolName !== "string") {
            return res.status(400).json({
                success: false,
                error: "Missing or invalid 'tool' parameter",
            });
        }

        // Get the tool from registry
        const { registry } = await import("./tools/index.ts");
        const tool = registry.get(toolName);

        if (!tool) {
            return res.status(404).json({
                success: false,
                error: `Tool '${toolName}' not found`,
            });
        }

        // Execute the tool
        const result = await tool.execute(input || {});
        const parsed = JSON.parse(result);

        res.json(parsed);
    } catch (error: any) {
        log.error(`Tool execution error (${req.body?.tool})`, error);
        res.status(500).json({
            success: false,
            error: error.message || "Tool execution failed",
        });
    }
});

export function startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
        const port = config.PORT || 3000;

        // Add error handler for server startup failures
        server.on("error", (err: any) => {
            if (err.code === "EADDRINUSE") {
                log.error(`❌ Port ${port} is already in use`);
                reject(new Error(`Port ${port} is already in use. Is another instance running?`));
            } else {
                log.error(`❌ Server startup error:`, err);
                reject(err);
            }
        });

        server.listen(port, () => {
            log.info(`🚀 Web server listening on http://localhost:${port}`);
            resolve();
        });
    });
}
