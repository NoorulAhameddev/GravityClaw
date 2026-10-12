import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { auditLogger, AuditEvent } from './logger.ts';
import crypto from 'crypto';

function maskActorId(user?: { id: string }, apiKey?: string): string {
  if (user?.id) return user.id;
  if (apiKey) return `key_${crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 8)}`;
  return 'anonymous';
}

export function auditMiddleware(event: AuditEvent) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      const entry: Record<string, any> = {
        event,
        actorId: maskActorId((req as any).user, req.apiKey),
        actorType: req.apiKey ? 'api_key' : 'user',
        resourceType: req.path.split('/')[2] || 'unknown',
        resourceId: (req.params as any).id || 'unknown',
        details: { method: req.method, statusCode: res.statusCode },
        success: res.statusCode < 400,
      };
      const ua = req.headers['user-agent'];
      if (ua) entry.userAgent = ua;
      auditLogger.log(entry as any);
      return originalJson(body);
    };
    next();
  };
}

export function apiAuditMiddleware() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const entry: Record<string, any> = {
        event: 'api.request',
        actorId: maskActorId((req as any).user, req.apiKey),
        actorType: req.apiKey ? 'api_key' : 'user',
        resourceType: req.path.split('/')[1] || 'unknown',
        resourceId: (req.params as any).id || 'unknown',
        details: {
          method: req.method,
          path: req.originalUrl.split('?')[0],
          statusCode: res.statusCode,
          durationMs: Date.now() - start,
        },
        success: res.statusCode < 400,
      };
      const ua = req.headers['user-agent'];
      if (ua) entry.userAgent = ua;
      auditLogger.log(entry as any);
    });
    next();
  };
}
