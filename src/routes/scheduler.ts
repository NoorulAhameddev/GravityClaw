import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.ts';
import { db } from '../db.ts';

export const router = Router();
router.get('/tasks', authMiddleware, (req, res) => {
    try {
        const tasks = db.prepare('SELECT * FROM scheduled_tasks ORDER BY created_at DESC LIMIT 100').all();
        res.json({ success: true, data: tasks });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});
router.get('/heartbeats', authMiddleware, (req, res) => {
    try {
        const heartbeats = db.prepare('SELECT * FROM heartbeat_tasks ORDER BY created_at DESC LIMIT 100').all();
        res.json({ success: true, data: heartbeats });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});
