import { Router } from 'express';
import { rateLimitMiddleware } from '../middleware/rate-limit.ts';
import { validateParams, webhookParamsSchema } from '../middleware/validation.ts';
import { getWebhookByName, verifySignature, recordDelivery } from '../webhooks/index.ts';
import { createLogger } from '../logger.ts';

const log = createLogger('route:webhooks');
export const router = Router();

router.post('/:session_id/:hook_name',
    rateLimitMiddleware({ windowMs: 60_000, maxRequests: 60, prefix: 'webhook' }),
    validateParams(webhookParamsSchema),
    async (req, res) => {
    const toParam = (v: string | string[] | undefined): string => Array.isArray(v) ? v[0]! : v ?? '';
    const session_id = toParam(req.params.session_id);
    const hook_name = toParam(req.params.hook_name);
    try {
        const webhook = getWebhookByName(hook_name, session_id);
        if (!webhook) return res.status(404).json({ success: false, error: 'Webhook not found' });
        if (!webhook.secret) return res.status(426).json({ success: false, error: 'Webhook requires an HMAC secret.' });
        
        const signature = req.headers['x-webhook-signature'] as string;
        if (!signature) return res.status(401).json({ success: false, error: 'Missing signature' });
        
        const payload = JSON.stringify(req.body);
        if (!verifySignature(payload, signature, webhook.secret)) return res.status(401).json({ success: false, error: 'Invalid signature' });
        
        log.info(`Webhook received: ${hook_name}`);
        recordDelivery(webhook.id, payload, 'success', 200);
        res.status(200).json({ success: true, message: 'Webhook received' });
    } catch (error: any) {
        log.error(`Error processing webhook: ${error}`);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});
