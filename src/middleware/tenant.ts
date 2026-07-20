import type { Request, Response, NextFunction } from "express";
import { createLogger } from "../logger.ts";

const log = createLogger("tenant");

export interface TenantContext {
    id: string;
    isolation: "row" | "schema" | "database";
}

declare global {
    namespace Express {
        interface Request {
            tenant?: TenantContext;
        }
    }
}

export function tenantMiddleware(req: Request, _res: Response, next: NextFunction) {
    const tenantId = req.headers["x-tenant-id"] as string | undefined;

    if (!tenantId) {
        next();
        return;
    }

    req.tenant = {
        id: tenantId,
        isolation: "row",
    };

    next();
}

export class TenantAwareDb {
    constructor(private tenantId: string) {}

    async all(sql: string, params: any[] = []): Promise<any[]> {
        const dbModule = await import("../db.ts");
        const db = dbModule.db;
        const tenantAwareSql = this.injectTenantFilter(sql);
        return db.prepare(tenantAwareSql).all(...params) as any[];
    }

    async get(sql: string, params: any[] = []): Promise<any> {
        const dbModule = await import("../db.ts");
        const db = dbModule.db;
        const tenantAwareSql = this.injectTenantFilter(sql);
        return db.prepare(tenantAwareSql).get(...params);
    }

    async run(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid: number }> {
        const dbModule = await import("../db.ts");
        const db = dbModule.db;
        return db.prepare(sql).run(...params) as any;
    }

    private injectTenantFilter(sql: string): string {
        const upper = sql.toUpperCase().trim();
        if (upper.startsWith("SELECT") && !upper.includes("tenant_id")) {
            const insertPos = upper.indexOf("WHERE") > 0
                ? sql.indexOf(upper.match(/WHERE/i)![0])
                : sql.length;
            const prefix = sql.slice(0, insertPos);
            const suffix = sql.slice(insertPos);
            if (suffix.trim().toUpperCase().startsWith("WHERE")) {
                return `${prefix} ${suffix.trim()} AND tenant_id = '${this.tenantId}'`;
            }
            return `${sql} WHERE tenant_id = '${this.tenantId}'`;
        }
        return sql;
    }
}
