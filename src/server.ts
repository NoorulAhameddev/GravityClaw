import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.ts";
import { createLogger } from "./logger.ts";
import cors from "cors";
import { registerCanvasClient } from "./canvas/index.ts";
import { db } from "./db.ts";
import { validateWebSocketAuth, createSessionToken } from './middleware/websocket-auth.ts';
import { authMiddleware } from "./middleware/auth.ts";
import { createTelemetryMiddleware } from "./lib/telemetry/middleware.ts";
import metricsRouter from "./performance/metrics-api.ts";
import { router as adminRouter } from "./routes/admin.ts";
import { router as adminUsersRouter } from "./routes/admin/users.ts";
import { router as auditRouter } from "./routes/audit.ts";
import { router as pluginsRouter } from "./routes/plugins.ts";
import { router as ssoRouter } from "./auth/sso.ts";
import { router as toolsRouter } from "./routes/tools.ts";
import { router as memoryRouter } from "./routes/memory.ts";
import { router as approvalsRouter } from "./routes/approvals.ts";
import { router as exportRouter } from "./routes/export.ts";
import { router as swarmsRouter } from "./routes/swarms.ts";
import { router as workflowsRouter } from "./routes/workflows.ts";
import { router as schedulerRouter } from "./routes/scheduler.ts";
import { router as voiceRouter } from "./routes/voice.ts";
import { router as webhooksRouter } from "./routes/webhooks.ts";
import { router as healthRouter } from "./routes/health.ts";
import { tenantMiddleware } from "./middleware/tenant.ts";
import { ensureAuditTable } from "./audit/logger.ts";
import { errorHandler } from "./middleware/errorHandler.ts";
import { approvalGate } from "./middleware/approval.ts";
import { rateLimitMiddleware, rateLimiter } from "./middleware/rate-limit.ts";
import { stopMemoryOptimizations } from "./performance/memory-optimization.ts";
import { stopBrowserIdleCheck } from "./tools/automation/browser.ts";

const log = createLogger("server");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173',
    ],
    credentials: true,
}));

import helmet from "helmet";
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
}));

// Double-submit cookie pattern for CSRF protection
app.use((req, res, next) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
        const csrfCookie = req.cookies?.["XSRF-TOKEN"];
        const csrfHeader = req.headers["x-xsrf-token"] as string | undefined;
        if (req.path.startsWith("/webhook/") || req.path.startsWith("/auth/sso/")) {
            return next();
        }
        if (csrfCookie && csrfHeader && csrfCookie === csrfHeader) {
            return next();
        }
        if (csrfCookie || csrfHeader) {
            return res.status(403).json({ success: false, error: "CSRF token mismatch" });
        }
    }
    next();
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
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

// Apply rate limiting to all API and auth routes
app.use("/api", rateLimitMiddleware({ maxRequests: 120, prefix: "api" }));
app.use("/auth", rateLimitMiddleware({ maxRequests: 30, prefix: "auth" }));

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
            (ws as WebSocket & { auth: typeof auth }).auth = auth;
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
            (ws as WebSocket & { auth: typeof auth }).auth = auth;
            log.info(`Authenticated WebSocket connection`, {
                sessionId: auth.sessionId,
                userId: auth.userId || ''
            });
            wss.emit("connection", ws, request);
        });
    }
});

const heartbeatTimer = setInterval(() => {
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

// Initialize audit table
ensureAuditTable();

app.use(tenantMiddleware);

// Mount admin APIs
app.use("/api/admin", adminRouter);
app.use("/api/admin/users", adminUsersRouter);
app.use("/api/audit", auditRouter);
app.use("/api/plugins", pluginsRouter);
app.use("/auth/sso", ssoRouter);

// Mount performance metrics API
app.use("/api/metrics", metricsRouter);

// Mount route modules (replace inline handlers below)
app.use("/api/tools", toolsRouter);
app.use("/api/memory", memoryRouter);
app.use("/api/approvals", approvalsRouter);
app.use("/api/export", exportRouter);
app.use("/api/swarms", swarmsRouter);
app.use("/api/workflows", workflowsRouter);
app.use("/api/scheduler", schedulerRouter);
app.use("/api/voice", voiceRouter);
app.use("/webhook", webhooksRouter);
app.use("/api", healthRouter);

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
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        log.error('Token generation error', error);
        res.status(500).json({ 
            success: false, 
            error: message 
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
 * Usage API - aggregate token usage statistics
 */
app.get("/api/usage", authMiddleware, async (req, res) => {
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
app.get("/api/stats", authMiddleware, (req, res) => {
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







// WhatsApp endpoints removed — channel implementation not available

app.use(errorHandler);

const cleanupTimers: (() => void)[] = [];

export function registerCleanupTimer(fn: () => void): void {
    cleanupTimers.push(fn);
}

export function stopServer(): Promise<void> {
    return new Promise((resolve) => {
        clearInterval(heartbeatTimer);
        approvalGate.stopExpirationChecker();
        stopMemoryOptimizations();
        stopBrowserIdleCheck();
        rateLimiter.stop();
        for (const cleanup of cleanupTimers) {
            try { cleanup(); } catch { /* ignore cleanup errors */ }
        }
        wss?.close(() => {
            server.close(() => {
                log.info("Server stopped");
                resolve();
            });
        });
    });
}

export function startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
        const basePort = config.PORT || 3000;
        let currentPort = basePort;
        const maxTries = 5;
        let tries = 0;

        const attemptListen = (port: number) => {
            const errorHandler = (err: NodeJS.ErrnoException) => {
                if (err.code === "EADDRINUSE" && tries < maxTries) {
                    tries++;
                    log.warn(`⚠️ Port ${port} is in use, trying ${port + 1}...`);
                    server.off("error", errorHandler);
                    attemptListen(port + 1);
                } else {
                    log.error(`❌ Server startup error:`, err);
                    server.off("error", errorHandler);
                    reject(err);
                }
            };

            server.on("error", errorHandler);

            server.listen(port, () => {
                server.off("error", errorHandler);
                log.info(`🚀 Web server listening on http://localhost:${port}`);
                process.env.PORT = String(port);
                resolve();
            });
        };

        attemptListen(currentPort);
    });
}
