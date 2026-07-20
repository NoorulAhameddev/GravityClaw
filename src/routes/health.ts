import { Router } from 'express';
import { healthAuthMiddleware } from '../middleware/health-auth.ts';
import { db } from '../db.ts';
import { getActualPort } from '../lib/runtime.ts';
import { createLogger } from '../logger.ts';
import { wss } from '../server.ts';
import { asyncHandler } from '../middleware/errorHandler.ts';
import { getProvider } from '../llm/index.ts';

const log = createLogger('route:health');
export const router = Router();

router.get('/health', healthAuthMiddleware, (req, res) => {
    const startTime = Date.now();
    try {
        const wsClients = wss.clients.size;
        const memoryUsage = process.memoryUsage();

        let dbStatus = 'ok';
        try {
            const result = db.prepare('SELECT 1 as ping').get() as { ping: number };
            dbStatus = result?.ping === 1 ? 'ok' : 'error';
        } catch (err) {
            dbStatus = 'error';
            log.warn('Database health check failed', { error: err });
        }

        let factCount = 0;
        try {
            const result = db.prepare("SELECT COUNT(*) as count FROM memory WHERE type = 'fact'").get() as { count: number };
            factCount = result?.count || 0;
        } catch { }

        const isHealthy = dbStatus === 'ok';
        const status = isHealthy ? 'ok' : 'degraded';

        res.json({
            status, timestamp: new Date().toISOString(), uptime: process.uptime(), responseTime: Date.now() - startTime,
            server: { listening: true, port: getActualPort(), wsClients },
            database: { status: dbStatus, factsCount: factCount },
            memory: { heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), rss: Math.round(memoryUsage.rss / 1024 / 1024) },
        });
    } catch (error) {
        log.error('Health check failed', error);
        res.status(503).json({ status: 'error', timestamp: new Date().toISOString(), message: 'Health check failed' });
    }
});

// /api/live — simple process alive check
router.get("/live", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// /api/ready — checks dependencies
router.get("/ready", asyncHandler(async (_req, res) => {
    const checks = {
        database: false,
        llm: false,
    };
    
    try {
        db.prepare("SELECT 1 as ping").get();
        checks.database = true;
    } catch {}
    
    try {
        // Lightweight LLM provider check
        const provider = getProvider();
        checks.llm = provider !== null;
    } catch {}
    
    const allOk = Object.values(checks).every(Boolean);
    const statusCode = allOk ? 200 : 503;
    
    res.status(statusCode).json({
        status: allOk ? "ok" : "degraded",
        checks,
        timestamp: new Date().toISOString(),
    });
}));
