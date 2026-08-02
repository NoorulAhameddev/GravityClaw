import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.ts';
import { getUsageByPeriod, getUsageStats } from '../usage.ts';

export const router = Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const stats = getUsageStats();
    const periods = getUsageByPeriod();

    // Convert the model breakdown to a map for easy JSON serialization
    const byModelTokens: Record<string, number> = {};
    const byModelCost: Record<string, number> = {};

    stats.models.forEach((m) => {
      byModelTokens[m.model] = m.tokens;
      byModelCost[m.model] = m.cost;
    });

    res.json({
      requests: {
        total: stats.totalCalls,
        // We don't have hourly/daily time-series yet, so we return empty arrays for now
        // to satisfy the schema without mocking fake data.
        byHour: [],
        byDay: [],
      },
      tokens: {
        total: stats.totalTokens,
        byModel: byModelTokens,
      },
      cost: {
        total: stats.totalCost,
        byModel: byModelCost,
      },
      latency: {
        avg: stats.avgLatency || 0,
        p50: stats.avgLatency || 0, // Placeholder until percentile queries are added
        p95: stats.avgLatency || 0,
        p99: stats.avgLatency || 0,
      },
      errors: {
        total: 0,
        byType: {},
      },
      sessions: {
        active: 0,
        total: 0,
        avgDuration: 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});
