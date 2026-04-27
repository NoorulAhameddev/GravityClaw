import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.ts";
import { createLogger } from "./logger.ts";
import { safeJsonParse } from "./utils/json.ts";
import cors from "cors";
import { getWebhookByName, verifySignature } from "./webhooks/index.ts";
import { registerCanvasClient } from "./canvas/index.ts";
import { URL } from "url";
import { db } from "./db.ts";
import multer from "multer";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import {
    validateBody,
    validateQuery,
    validateParams,
    toolsExecuteSchema,
    voiceSpeakSchema,
    approvalCreateSchema,
    approvalActionSchema,
    memoryQuerySchema,
    traceIdParamSchema,
    exportDownloadQuerySchema,
    webhookParamsSchema,
    approvalIdParamSchema,
    approvalsListQuerySchema,
} from "./middleware/validation.ts";
import { validateWebSocketAuth, createSessionToken } from './middleware/websocket-auth.ts';
import {
    getMetricsSnapshot,
    exportPrometheusFormat,
} from "./observability/metrics.ts";
import { getActiveCorrelations } from "./observability/correlation.ts";
import { exportSpans, getTraceSpans } from "./observability/tracing.ts";
import metricsRouter from "./performance/metrics-api.ts";
import { authMiddleware } from "./middleware/auth.ts";
import { WhatsAppChannel } from "./channels/whatsapp.ts";
import { mobileGateway } from "./gateway/mobile.ts";
import { createTelemetryMiddleware } from "./lib/telemetry/middleware.ts";

let whatsappChannelInstance: WhatsAppChannel | null = null;

export function setWhatsAppChannel(channel: WhatsAppChannel) {
    whatsappChannelInstance = channel;
}

const log = createLogger("server");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: "10mb" })); // Parse form data
app.use(createTelemetryMiddleware());

// Strict No-Cache middleware to prevent stale UI in browsers
app.use((req, res, next) => {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
    });
    next();
});
export const server = createServer(app);
export const wss = new WebSocketServer({ noServer: true });

// Add mobile gateway routes
app.use(mobileGateway.getExpressApp());

// Handle WebSocket upgrades manually to support multiple paths
server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    const pathname = url.pathname;

    // Validate authentication
    const auth = validateWebSocketAuth(request, pathname);
    
    if (!auth.isAuthenticated) {
        log.warn(`WebSocket authentication failed for ${pathname}`);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
    }

    if (pathname === "/canvas") {
        const sessionId = auth.sessionId || url.searchParams.get("session") || "default";

        // Handle canvas connections with authentication
        wss.handleUpgrade(request, socket, head, (ws) => {
            // Add authentication info to socket
            (ws as any).auth = auth;
            log.info(`Authenticated Canvas connection for session: ${sessionId}`, {
                userId: auth.userId || '',
                platform: auth.platform || ''
            });
            registerCanvasClient(sessionId, ws);
        });
    } else {
        // Default to main chat websocket with authentication
        wss.handleUpgrade(request, socket, head, (ws) => {
            // Add authentication info to socket
            (ws as any).auth = auth;
            log.info(`Authenticated WebSocket connection`, {
                sessionId: auth.sessionId,
                userId: auth.userId || ''
            });
            wss.emit("connection", ws, request);
        });
    }
});

setInterval(() => {
    wss.clients.forEach((client: WebSocket) => {
        const ext = client as unknown as { isAlive?: boolean };
        if (ext.isAlive === false) {
            return client.terminate();
        }
        ext.isAlive = false;
        client.ping();
    });
}, 30000);

// Serve static files from the 'dashboard/dist' directory (modernized frontend)
const distPath = path.join(process.cwd(), "dashboard", "dist");
app.use(express.static(distPath));
// Fallback to legacy 'public' directory for other assets
app.use(express.static(path.join(process.cwd(), "public")));

// SPA fallback for the modern dashboard
app.get(/^(?!\/(api|webhook|metrics)).*$/, (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
});

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
        const wsClients = wss.clients.size;

        // Get memory statistics
        const memoryUsage = process.memoryUsage();

        // Get metrics
        const metrics = getMetricsSnapshot();

        // Check database connectivity
        let dbStatus = "ok";
        try {
            const result = db.prepare("SELECT 1 as ping").get() as { ping: number } | undefined;
            dbStatus = result?.ping === 1 ? "ok" : "error";
        } catch (err) {
            dbStatus = "error";
            log.warn("Database health check failed", { error: err });
        }

        // Get memory facts count
        let factCount = 0;
        try {
            const result = db.prepare("SELECT COUNT(*) as count FROM memory WHERE type = 'fact'").get() as { count: number } | undefined;
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
 * Token generation endpoint for WebSocket authentication
 * POST /api/auth/token
 */
app.post('/api/auth/token', authMiddleware, (req, res) => {
    try {
        const { sessionId, userId, platform } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ 
                success: false, 
                error: 'sessionId is required' 
            });
        }
        
        const token = createSessionToken(sessionId, userId, platform);
        
        res.json({
            success: true,
            token,
            expiresIn: 86400, // 24 hours
            usage: `ws://localhost:${config.PORT}?token=${token}&session=${sessionId}`
        });
    } catch (error: any) {
        log.error('Token generation error', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
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
app.get("/api/metrics", authMiddleware, (req, res) => {
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
app.get("/api/traces", authMiddleware, (req, res) => {
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

app.get("/api/traces/:traceId", authMiddleware, validateParams(traceIdParamSchema), (req, res) => {
    try {
        const traceId = req.params.traceId as string;

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
app.get("/api/ws-info", authMiddleware, (req, res) => {
    const ext = wss as unknown as { _events?: { connection?: unknown } };
    const handlers = ext._events?.connection;
    const isHandlerRegistered = !!handlers;

    res.json({
        status: "ok",
        websocket: {
            server_exists: !!wss,
            handlers_registered: isHandlerRegistered,
            connected_clients: wss.clients.size,
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
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
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
app.get("/api/memory", authMiddleware, validateQuery(memoryQuerySchema), (req, res) => {
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
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: message });
    }
});

/**
 * Tools API - list all registered tools with name and description
 */
app.get("/api/tools", authMiddleware, async (req, res) => {
    try {
        const { registry } = await import("./tools/index.ts");
        const defs = registry.getOpenAIDefinitions();
        const tools = defs.map(d => ({
            name: d.function.name,
            description: d.function.description,
        }));
        res.json({ success: true, data: tools, count: tools.length });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: message });
    }
});

/**
 * Usage API - aggregate token usage statistics
 */
app.get("/api/usage", async (req, res) => {
    const clientIp = req.ip || "";
    const isLocalhost = clientIp === "127.0.0.1" || clientIp === "::1" || clientIp === "::ffff:127.0.0.1";
    
    if (!isLocalhost && config.API_KEY) {
        const apiKey = req.headers["x-api-key"];
        if (!apiKey || apiKey !== config.API_KEY) {
            res.status(401).json({ success: false, error: "Unauthorized" });
            return;
        }
    }
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
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: message });
    }
});

/**
 * Dashboard stats - unauthenticated local-only endpoint
 */
app.get("/api/stats", (req, res) => {
    const clientIp = req.ip || "";
    const isLocalhost = clientIp === "127.0.0.1" || clientIp === "::1" || clientIp === "::ffff:127.0.0.1";
    
    if (!isLocalhost && config.API_KEY) {
        const apiKey = req.headers["x-api-key"];
        if (!apiKey || apiKey !== config.API_KEY) {
            res.status(401).json({ success: false, error: "Unauthorized" });
            return;
        }
    }
    
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
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: message });
    }
});

/**
 * Scheduler tasks API
 */
app.get("/api/scheduler/tasks", authMiddleware, (req, res) => {
    try {
        const tasks = db.prepare("SELECT * FROM scheduled_tasks ORDER BY created_at DESC LIMIT 100").all();
        res.json({ success: true, data: tasks });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: message });
    }
});

/**
 * Webhooks list API (secrets masked)
 */
app.get("/api/webhooks", authMiddleware, (req, res) => {
    try {
        const webhooks = db.prepare(
            "SELECT id, name, session_id, created_at, created_by FROM webhooks ORDER BY created_at DESC LIMIT 100"
        ).all();
        res.json({ success: true, data: webhooks });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: message });
    }
});

/**
 * Sessions list API with message count
 */
app.get("/api/sessions", authMiddleware, (req, res) => {
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
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: message });
    }
});

/**
 * Agent swarms API
 */
app.get("/api/swarms", authMiddleware, (req, res) => {
    try {
        const swarms = db.prepare(
            "SELECT * FROM agent_swarms ORDER BY created_at DESC LIMIT 100"
        ).all();
        res.json({ success: true, data: swarms });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: message });
    }
});

/**
 * Workflows API
 */
app.get("/api/workflows", authMiddleware, (req, res) => {
    try {
        const workflows = db.prepare(
            "SELECT id, session_id, goal, status, progress, created_at, completed_at FROM workflows ORDER BY created_at DESC LIMIT 100"
        ).all();
        res.json({ success: true, data: workflows });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: message });
    }
});

/**
 * Heartbeat tasks API
 */
app.get("/api/heartbeats", authMiddleware, (req, res) => {
    try {
        const heartbeats = db.prepare(
            "SELECT * FROM heartbeat_tasks ORDER BY created_at DESC LIMIT 100"
        ).all();
        res.json({ success: true, data: heartbeats });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: message });
    }
});

/** 
 * Export API endpoints for downloading data
 */

/**
 * Download exported data file
 * GET /api/export/download?filename=...
 */
app.get("/api/export/download", authMiddleware, validateQuery(exportDownloadQuerySchema), (req, res) => {
    try {
        const { filename, data, format } = req.query;

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
        const buffer = Buffer.from(data as string, "base64");

        res.setHeader("Content-Type", contentType);
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${filename_str}"`
        );
        res.setHeader("Content-Length", buffer.length);
        res.send(buffer);

        log.info(`Downloaded export: ${filename_str}`);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        log.error("Export download error", error);
        res.status(500).json({
            success: false,
            error: message,
        });
    }
});

/**
 * Execute tool via API
 * POST /api/tools/execute
 * Body: { tool: string, input: Record<string, unknown> }
 */
app.post("/api/tools/execute", authMiddleware, validateBody(toolsExecuteSchema), async (req, res) => {
    try {
        const { tool: toolName, input } = req.body;

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
        const parsedResult = safeJsonParse<unknown>(result, null, "tool execution result");
        
        if (!parsedResult.success || parsedResult.data === null) {
            log.warn(`Failed to parse tool result: ${parsedResult.error}`);
            return res.status(500).json({
                success: false,
                error: "Tool returned invalid result",
            });
        }

        res.json(parsedResult.data);
    } catch (error: any) {
        log.error(`Tool execution error (${req.body?.tool})`, error);
        res.status(500).json({
            success: false,
            error: error.message || "Tool execution failed",
        });
    }
});


const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

/**
 * Voice: Transcribe audio blob to text (Whisper STT)
 * POST /api/voice/transcribe
 * Body: multipart/form-data with 'audio' file
 */
app.post("/api/voice/transcribe", authMiddleware, upload.single("audio"), async (req: any, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: "No audio file uploaded" });
        }

        const openaiKey = (config as any).OPENAI_API_KEY ?? (config as any).OPENROUTER_API_KEY;
        if (!openaiKey) {
            return res.status(503).json({ success: false, error: "No OpenAI API key configured" });
        }

        // Write buffer to temp file
        const tmpPath = `${tmpdir()}/gc_audio_${Date.now()}.webm`;
        await writeFile(tmpPath, req.file.buffer);

        const { transcribeAudio } = await import("./voice/transcription.ts");
        const text = await transcribeAudio(tmpPath, openaiKey);
        await unlink(tmpPath).catch(() => { });

        log.info(`Voice transcribed: "${text.substring(0, 60)}..."`);
        res.json({ success: true, text });
    } catch (error: any) {
        log.error("Voice transcription error", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Voice: Convert text to speech audio blob (TTS)
 * POST /api/voice/speak
 * Body: { text: string, voice?: string }
 */
app.post("/api/voice/speak", authMiddleware, validateBody(voiceSpeakSchema), async (req, res) => {
    try {
        const { text, voice = "alloy" } = req.body;

        const openaiKey = (config as any).OPENAI_API_KEY ?? (config as any).OPENROUTER_API_KEY;
        if (!openaiKey) {
            return res.status(503).json({ success: false, error: "No OpenAI API key configured" });
        }

        const { TTSService } = await import("./voice/tts.ts");
        const tts = new TTSService(openaiKey, "tts-1", voice as any);
        const audioBuffer = await tts.textToSpeech(text.substring(0, 4096));

        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Content-Length", audioBuffer.length);
        res.send(audioBuffer);

        log.info(`Voice TTS: ${text.length} chars → ${audioBuffer.length} bytes`);
    } catch (error: any) {
        log.error("Voice TTS error", error);
        // If TTS fails, just send an em,pty response - client will handle gracefully
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Approval API Endpoints
 */
import { approvalGate, type ApprovalRequest } from "./middleware/approval.ts";

app.post("/api/approvals", authMiddleware, validateBody(approvalCreateSchema), async (req, res) => {
    try {
        const { toolName, parameters, userId, sessionId, channel } = req.body;

        const request = await approvalGate.createApprovalRequest(
            toolName,
            parameters || {},
            { userId, sessionId, channel: channel || "api" }
        );

        res.json({ success: true, request });
    } catch (error: any) {
        log.error("Create approval error", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get("/api/approvals", authMiddleware, validateQuery(approvalsListQuerySchema), async (req, res) => {
    try {
        const { sessionId } = req.query;
        
        let approvals: ApprovalRequest[];
        if (sessionId && typeof sessionId === "string") {
            approvals = approvalGate.getBySession(sessionId);
        } else {
            approvals = approvalGate.getPending();
        }

        res.json({ success: true, approvals });
    } catch (error: any) {
        log.error("List approvals error", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post("/api/approvals/:id/approve", authMiddleware, validateParams(approvalIdParamSchema), validateBody(approvalActionSchema), async (req, res) => {
    try {
        const id = req.params.id as string;
        const approver = req.body.approver as string;

        const result = await approvalGate.approve(id, approver);

        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json({ success: true, request: result.request });
    } catch (error: any) {
        log.error("Approve error", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post("/api/approvals/:id/deny", authMiddleware, validateParams(approvalIdParamSchema), validateBody(approvalActionSchema), async (req, res) => {
    try {
        const id = req.params.id as string;
        const approver = req.body.approver as string;

        const result = await approvalGate.deny(id, approver);

        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json({ success: true, request: result.request });
    } catch (error: any) {
        log.error("Deny error", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get("/api/approvals/:id", authMiddleware, validateParams(approvalIdParamSchema), async (req, res) => {
    try {
        const id = req.params.id as string;
        const request = approvalGate.getById(id);

        if (!request) {
            return res.status(404).json({ success: false, error: "Approval request not found" });
        }

        res.json({ success: true, request });
    } catch (error: any) {
        log.error("Get approval error", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get("/api/whatsapp/qr", authMiddleware, async (req, res) => {
    try {
        if (!whatsappChannelInstance) {
            return res.status(503).json({ success: false, error: "WhatsApp channel not initialized" });
        }

        const qr = whatsappChannelInstance.getQrCode();
        const status = whatsappChannelInstance.getConnectionStatus();
        const qrDataUrl = await whatsappChannelInstance.getQrCodeDataUrl();

        res.json({
            success: true,
            data: {
                qr: qr,
                qrDataUrl: qrDataUrl,
                status: status,
            }
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        log.error("WhatsApp QR error", error);
        res.status(500).json({ success: false, error: message });
    }
});

app.post("/api/whatsapp/reconnect", authMiddleware, async (req, res) => {
    try {
        if (!whatsappChannelInstance) {
            return res.status(503).json({ success: false, error: "WhatsApp channel not initialized" });
        }

        await whatsappChannelInstance.triggerReconnect();

        res.json({
            success: true,
            message: "Reconnection triggered"
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        log.error("WhatsApp reconnect error", error);
        res.status(500).json({ success: false, error: message });
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
