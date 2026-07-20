import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.ts';
import { validateQuery, memoryQuerySchema } from '../middleware/validation.ts';
import { db } from '../db.ts';

export const router = Router();

router.get('/', authMiddleware, validateQuery(memoryQuerySchema), (req, res) => {
    try {
        const limit = Math.min(parseInt((req.query.limit as string) || '50'), 200);
        const sessionId = req.query.session as string | undefined;
        if (sessionId) {
            const rows = db.prepare('SELECT id, session_id, timestamp, message_json FROM memory WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?').all(sessionId, limit);
            res.json({ success: true, data: rows });
        } else {
            const rows = db.prepare('SELECT session_id, COUNT(*) as message_count, MAX(timestamp) as last_active FROM memory GROUP BY session_id ORDER BY last_active DESC LIMIT ?').all(limit);
            res.json({ success: true, data: rows });
        }
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});
