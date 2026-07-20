import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.ts';
import { db } from '../db.ts';
import { createLogger } from "../logger.ts";

const log = createLogger("admin-routes");

export const router = Router();

router.get('/health', authMiddleware, async (_req, res) => {
    try {
        const dbOk = (db.prepare("SELECT 1").get() as { 1: number }) !== undefined;
        const sessionCount = (db.prepare("SELECT COUNT(*) as count FROM sessions").get() as { count: number }).count;
        res.json({
            status: dbOk ? "healthy" : "degraded",
            database: dbOk ? "connected" : "error",
            uptime: process.uptime(),
            sessions: sessionCount,
        });
  } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(503).json({ status: "degraded", database: "error", error: message });
    }
});

router.get('/sessions/count', authMiddleware, (req, res) => {
    try {
        const { period } = req.query;
        const periodSql = period === "24h" ? "WHERE created_at > datetime('now', '-1 day')"
            : period === "7d" ? "WHERE created_at > datetime('now', '-7 days')"
            : period === "30d" ? "WHERE created_at > datetime('now', '-30 days')"
            : "";
        const count = (db.prepare(`SELECT COUNT(*) as count FROM sessions ${periodSql}`).get() as { count: number }).count;
        res.json({ count, period: period || "all" });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

router.get('/usage/summary', authMiddleware, async (req, res) => {
    try {
        const summary = db.prepare(`
            SELECT 
                COUNT(*) as total_messages,
                COUNT(DISTINCT session_id) as total_sessions
            FROM memory WHERE timestamp > datetime('now', '-24 hours')
        `).get() as { total_messages: number; total_sessions: number };
        res.json(summary);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

router.get('/stats', authMiddleware, (req, res) => {
    try {
        const getCount = (sql: string) => (db.prepare(sql).get() as { count: number }).count;
        res.json({
            success: true,
            data: {
                sessions: getCount('SELECT COUNT(*) as count FROM sessions'),
                activeTasks: getCount('SELECT COUNT(*) as count FROM scheduled_tasks WHERE enabled = 1'),
                webhooks: getCount('SELECT COUNT(*) as count FROM webhooks'),
                swarms: getCount('SELECT COUNT(*) as count FROM agent_swarms'),
                workflows: getCount('SELECT COUNT(*) as count FROM workflows'),
                memorySessions: getCount('SELECT COUNT(DISTINCT session_id) as count FROM memory'),
                heartbeats: getCount('SELECT COUNT(*) as count FROM heartbeat_tasks WHERE enabled = 1'),
            }
        });
  } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: message });
    }
});

router.get('/sessions', authMiddleware, (req, res) => {
    try {
        const sessions = db.prepare(`
            SELECT s.id, s.allow_messages, s.created_at, s.updated_at, COUNT(m.id) as message_count
            FROM sessions s LEFT JOIN memory m ON s.id = m.session_id
            GROUP BY s.id ORDER BY s.updated_at DESC LIMIT 100
        `).all();
        res.json({ success: true, data: sessions });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: message });
    }
});

router.get('/usage', authMiddleware, async (req, res) => {
    try {
        const { getUsageStats } = await import('../usage.ts');
        const allTime = getUsageStats();
        const modelsObj: Record<string, { calls: number; tokens: number; cost: number }> = {};
        allTime.models.forEach((m: { model: string; calls: number; tokens: number; cost: number }) => { modelsObj[m.model] = { calls: m.calls, tokens: m.tokens, cost: m.cost }; });
        res.json({ success: true, data: { allTime: { requests: allTime.totalCalls, tokens: allTime.totalTokens, cost: allTime.totalCost }, models: modelsObj, avgLatency: allTime.avgLatency } });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: message });
    }
});
