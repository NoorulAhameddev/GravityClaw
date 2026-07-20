import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.ts';
import { db } from '../db.ts';

export const router = Router();
router.get('/', authMiddleware, (req, res) => {
    try {
        const workflows = db.prepare('SELECT id, session_id, goal, status, progress, created_at, completed_at FROM workflows ORDER BY created_at DESC LIMIT 100').all();
        res.json({ success: true, data: workflows });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});
