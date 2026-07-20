import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.ts';
import { validateBody, toolsExecuteSchema } from '../middleware/validation.ts';
import { toolExecutor } from '../tools/index.ts';
import { safeJsonParse } from '../utils/json.ts';
import { createLogger } from '../logger.ts';

const log = createLogger('route:tools');
export const router = Router();

router.get('/', authMiddleware, async (req, res) => {
    try {
        const { registry } = await import('../tools/index.ts');
        const defs = registry.getOpenAIDefinitions();
        const tools = defs.map(d => ({ name: d.function.name, description: d.function.description }));
        res.json({ success: true, data: tools, count: tools.length });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/execute', authMiddleware, validateBody(toolsExecuteSchema), async (req, res) => {
    try {
        const { tool: toolName, input, sessionId, userId, approvalRequestId } = req.body;
        const execution = await toolExecutor.execute({
            toolName, input: input || {}, approvalRequestId,
            context: { sessionId: sessionId || `api:${toolName}`, userId, source: 'api' }
        });
        if (!execution.success) return res.status(500).json({ success: false, error: execution.error?.message });
        const parsedResult = safeJsonParse(execution.result ?? '', null, 'tool execution result');
        if (!parsedResult.success) return res.json({ success: true, data: execution.result ?? '' });
        res.json(parsedResult.data);
    } catch (error: any) {
        log.error('Tool execution error', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
