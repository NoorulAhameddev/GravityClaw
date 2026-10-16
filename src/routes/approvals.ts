import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.ts';
import {
  validateBody,
  validateQuery,
  validateParams,
  approvalCreateSchema,
  approvalsListQuerySchema,
  approvalIdParamSchema,
  approvalActionSchema,
} from '../middleware/validation.ts';
import { approvalGate } from '../middleware/approval.ts';
import { createLogger } from '../logger.ts';

const log = createLogger('route:approvals');
export const router = Router();

router.post('/', authMiddleware, validateBody(approvalCreateSchema), async (req, res) => {
  try {
    const { toolName, parameters, sessionId: bodySessionId, channel } = req.body;
    const authUser = (req as any).user;
    const principalId = String(authUser?.id || 'api-key-holder');
    const toolSessionId = `api:${toolName}`;
    if (
      bodySessionId &&
      bodySessionId !== principalId &&
      bodySessionId !== toolSessionId
    ) {
      log.warn(`Approval session mismatch: body ${bodySessionId} for tool ${toolName}`);
      return res.status(403).json({
        success: false,
        error: 'SessionId does not match authenticated principal or tool session',
      });
    }
    const request = await approvalGate.createApprovalRequest(toolName, parameters || {}, {
      userId: principalId,
      sessionId: toolSessionId,
      channel: channel || 'api',
    });
    res.json({ success: true, request });
  } catch (error: any) {
    log.error('Create approval error', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/', authMiddleware, validateQuery(approvalsListQuerySchema), async (req, res) => {
  try {
    const authUser = (req as any).user;
    const principalId = String(authUser?.id || 'api-key-holder');
    const querySessionId = req.query.sessionId as string | undefined;
    if (
      querySessionId &&
      querySessionId !== principalId &&
      !querySessionId.startsWith('api:')
    ) {
      return res.status(403).json({
        success: false,
        error: 'SessionId does not match authenticated principal or tool session',
      });
    }
    const approvals = querySessionId
      ? approvalGate.getBySession(querySessionId).filter((item) => item.userId === principalId)
      : approvalGate.getPending().filter((item) => item.userId === principalId);
    res.json({ success: true, approvals });
  } catch (error: any) {
    log.error('List approvals error', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post(
  '/:id/approve',
  authMiddleware,
  validateParams(approvalIdParamSchema),
  validateBody(approvalActionSchema),
  async (req, res) => {
    try {
      const id = req.params.id as string;
      const principalId = String((req as any).user?.id || 'api-key-holder');
      const existing = approvalGate.getById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Approval request not found' });
      }
      if (existing.userId !== principalId) {
        return res.status(403).json({ success: false, error: 'Approval belongs to a different principal' });
      }
      const result = await approvalGate.approve(id, principalId);
      if (!result.success) return res.status(400).json(result);
      res.json({ success: true, request: result.request });
    } catch (error: any) {
      log.error('Approve error', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },
);

router.post(
  '/:id/deny',
  authMiddleware,
  validateParams(approvalIdParamSchema),
  validateBody(approvalActionSchema),
  async (req, res) => {
    try {
      const id = req.params.id as string;
      const principalId = String((req as any).user?.id || 'api-key-holder');
      const existing = approvalGate.getById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Approval request not found' });
      }
      if (existing.userId !== principalId) {
        return res.status(403).json({ success: false, error: 'Approval belongs to a different principal' });
      }
      const result = await approvalGate.deny(id, principalId);
      if (!result.success) return res.status(400).json(result);
      res.json({ success: true, request: result.request });
    } catch (error: any) {
      log.error('Deny error', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },
);

router.get('/:id', authMiddleware, validateParams(approvalIdParamSchema), async (req, res) => {
  try {
    const id = req.params.id as string;
    const request = approvalGate.getById(id);
    if (!request)
      return res.status(404).json({ success: false, error: 'Approval request not found' });
    const principalId = String((req as any).user?.id || 'api-key-holder');
    if (request.userId !== principalId) {
      return res
        .status(403)
        .json({ success: false, error: 'Approval belongs to a different principal' });
    }
    res.json({ success: true, request });
  } catch (error: any) {
    log.error('Get approval error', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
