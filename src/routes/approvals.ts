import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.ts';
import { validateBody, validateQuery, validateParams, approvalCreateSchema, approvalsListQuerySchema, approvalIdParamSchema, approvalActionSchema } from '../middleware/validation.ts';
import { approvalGate } from '../middleware/approval.ts';
import { createLogger } from '../logger.ts';

const log = createLogger('route:approvals');
export const router = Router();

router.post('/', authMiddleware, validateBody(approvalCreateSchema), async (req, res) => {
    try {
        const { toolName, parameters, userId, sessionId, channel } = req.body;
        const request = await approvalGate.createApprovalRequest(
            toolName, parameters || {}, { userId, sessionId, channel: channel || 'api' }
        );
        res.json({ success: true, request });
    } catch (error: any) {
        log.error('Create approval error', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/', authMiddleware, validateQuery(approvalsListQuerySchema), async (req, res) => {
    try {
        const { sessionId } = req.query;
        let approvals;
        if (sessionId && typeof sessionId === 'string') {
            approvals = approvalGate.getBySession(sessionId);
        } else {
            approvals = approvalGate.getPending();
        }
        res.json({ success: true, approvals });
    } catch (error: any) {
        log.error('List approvals error', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/:id/approve', authMiddleware, validateParams(approvalIdParamSchema), validateBody(approvalActionSchema), async (req, res) => {
    try {
        const id = req.params.id as string;
        const approver = req.body.approver as string;
        const result = await approvalGate.approve(id, approver);
        if (!result.success) return res.status(400).json(result);
        res.json({ success: true, request: result.request });
    } catch (error: any) {
        log.error('Approve error', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/:id/deny', authMiddleware, validateParams(approvalIdParamSchema), validateBody(approvalActionSchema), async (req, res) => {
    try {
        const id = req.params.id as string;
        const approver = req.body.approver as string;
        const result = await approvalGate.deny(id, approver);
        if (!result.success) return res.status(400).json(result);
        res.json({ success: true, request: result.request });
    } catch (error: any) {
        log.error('Deny error', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/:id', authMiddleware, validateParams(approvalIdParamSchema), async (req, res) => {
    try {
        const id = req.params.id as string;
        const request = approvalGate.getById(id);
        if (!request) return res.status(404).json({ success: false, error: 'Approval request not found' });
        res.json({ success: true, request });
    } catch (error: any) {
        log.error('Get approval error', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
