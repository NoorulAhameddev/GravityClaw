import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.ts";
import { auditLogger, AuditEvent } from "./logger.ts";

export function auditMiddleware(event: AuditEvent) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const originalJson = res.json.bind(res);
        res.json = function (body: any) {
            const entry: Record<string, any> = {
                event,
                actorId: (req as any).user?.id || req.apiKey || "anonymous",
                actorType: req.apiKey ? "api_key" : "user",
                resourceType: req.path.split("/")[2] || "unknown",
                resourceId: (req.params as any).id || "unknown",
                details: { method: req.method, statusCode: res.statusCode },
                success: res.statusCode < 400,
            };
            const ua = req.headers["user-agent"];
            if (ua) entry.userAgent = ua;
            auditLogger.log(entry as any);
            return originalJson(body);
        };
        next();
    };
}
