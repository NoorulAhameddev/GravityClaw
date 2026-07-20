import { db } from "../db.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("audit");

export enum AuditEvent {
    LOGIN_SUCCESS = "login.success",
    LOGIN_FAILURE = "login.failure",
    LOGOUT = "logout",
    SESSION_CREATED = "session.created",
    SESSION_DELETED = "session.deleted",
    TOOL_EXECUTED = "tool.executed",
    ADMIN_ACTION = "admin.action",
    SETTINGS_CHANGED = "settings.changed",
    USER_CREATED = "user.created",
    USER_DELETED = "user.deleted",
    ROLE_CHANGED = "role.changed",
    API_KEY_ROTATED = "api_key.rotated",
    DATA_EXPORTED = "data.exported",
    DATA_DELETED = "data.deleted",
}

export interface AuditEntry {
    timestamp: string;
    event: AuditEvent;
    actorId: string;
    actorType: "user" | "admin" | "system" | "api_key";
    tenantId?: string;
    resourceType: string;
    resourceId: string;
    details: Record<string, unknown>;
    ipAddress?: string | undefined;
    userAgent?: string | undefined;
    success: boolean;
}

export function ensureAuditTable(): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL DEFAULT (datetime('now')),
            event TEXT NOT NULL,
            actor_id TEXT NOT NULL,
            actor_type TEXT NOT NULL,
            tenant_id TEXT,
            resource_type TEXT NOT NULL,
            resource_id TEXT NOT NULL,
            details TEXT,
            ip_address TEXT,
            user_agent TEXT,
            success INTEGER NOT NULL DEFAULT 1
        )
    `);
    db.exec("CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log(event)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp)");
}

export class AuditLogger {
    log(entry: Omit<AuditEntry, "timestamp">): void {
        try {
            db.prepare(`
                INSERT INTO audit_log (event, actor_id, actor_type, tenant_id, resource_type, resource_id, details, ip_address, user_agent, success)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                entry.event,
                entry.actorId,
                entry.actorType,
                entry.tenantId || null,
                entry.resourceType,
                entry.resourceId,
                JSON.stringify(entry.details),
                entry.ipAddress || null,
                entry.userAgent || null,
                entry.success ? 1 : 0,
            );
        } catch (error) {
            log.error("Failed to write audit log", error as Error);
        }
    }

    query(filters: Record<string, any>): AuditEntry[] {
        const conditions: string[] = [];
        const params: any[] = [];

        if (filters.event) {
            conditions.push("event = ?");
            params.push(filters.event);
        }
        if (filters.actorId) {
            conditions.push("actor_id = ?");
            params.push(filters.actorId);
        }
        if (filters.tenantId) {
            conditions.push("tenant_id = ?");
            params.push(filters.tenantId);
        }
        if (filters.startDate) {
            conditions.push("timestamp >= ?");
            params.push(filters.startDate);
        }
        if (filters.endDate) {
            conditions.push("timestamp <= ?");
            params.push(filters.endDate);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const limit = filters.limit ?? 100;
        const offset = filters.offset ?? 0;

        return db.prepare(`SELECT * FROM audit_log ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`).all(limit, offset) as AuditEntry[];
    }
}

export const auditLogger = new AuditLogger();
