import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.ts';
import { createSessionToken } from '../middleware/websocket-auth.ts';
import { getActualPort } from '../lib/runtime.ts';
import { createLogger } from '../logger.ts';

const log = createLogger('route:auth');
export const router = Router();

router.post('/token', authMiddleware, (req, res) => {
    try {
        const { sessionId, userId, platform } = req.body;
        if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId is required' });
        const token = createSessionToken(sessionId, userId, platform);
        res.json({ success: true, token, expiresIn: 86400, usage: `ws://localhost:${getActualPort()}?token=${token}&session=${sessionId}` });
    } catch (error: any) {
        log.error('Token generation error', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
