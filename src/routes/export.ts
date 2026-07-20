import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.ts';
import { validateQuery, exportDownloadQuerySchema } from '../middleware/validation.ts';
import { createLogger } from '../logger.ts';

const log = createLogger('route:export');
export const router = Router();

router.get('/download', authMiddleware, validateQuery(exportDownloadQuerySchema), (req, res) => {
    try {
        const { filename, data, format } = req.query;
        const filename_str = typeof filename === 'string' ? filename : 'export.bin';
        const buffer = Buffer.from(data as string, 'base64');
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename_str}"`);
        res.setHeader('Content-Length', buffer.length);
        res.send(buffer);
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});
