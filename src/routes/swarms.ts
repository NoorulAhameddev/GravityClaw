import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.ts';
import { db } from '../db.ts';

export const router = Router();
router.get('/', authMiddleware, (req, res) => {
    try {
        const swarms = db.prepare('SELECT * FROM agent_swarms ORDER BY created_at DESC LIMIT 100').all();
        res.json({ success: true, data: swarms });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});
