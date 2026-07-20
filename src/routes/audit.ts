import { Router } from "express";
import { authMiddleware } from "../middleware/auth.ts";
import { requirePermission } from "../auth/rbac.ts";
import { auditLogger, AuditEvent } from "../audit/logger.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("audit-route");
export const router = Router();

router.use(authMiddleware);

router.get("/", requirePermission("admin:all"), (req, res) => {
    try {
        const { event, actorId, tenantId, startDate, endDate, limit, offset } = req.query;
        const filters: Record<string, any> = {};
        if (event) filters.event = event;
        if (actorId) filters.actorId = actorId;
        if (tenantId) filters.tenantId = tenantId;
        if (startDate) filters.startDate = startDate;
        if (endDate) filters.endDate = endDate;
        filters.limit = limit ? parseInt(limit as string, 10) : 100;
        filters.offset = offset ? parseInt(offset as string, 10) : 0;
        const results = auditLogger.query(filters as any);
        res.json({ success: true, data: results });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get("/events", requirePermission("admin:all"), (_req, res) => {
    res.json({ success: true, data: Object.values(AuditEvent) });
});
