import type { Request, Response, NextFunction } from 'express';
import { createLogger } from '../logger.ts';

const log = createLogger('tenant');

export interface TenantContext {
  id: string;
  isolation: 'row' | 'schema' | 'database';
}

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
    }
  }
}

export function tenantMiddleware(req: Request, _res: Response, next: NextFunction) {
  const tenantId = req.headers['x-tenant-id'] as string | undefined;

  if (!tenantId) {
    next();
    return;
  }

  req.tenant = {
    id: tenantId,
    isolation: 'row',
  };

  next();
}

interface TenantFilterResult {
  sql: string;
  params: any[];
}

export class TenantAwareDb {
  constructor(private tenantId: string) {}

  async all(sql: string, params: any[] = []): Promise<any[]> {
    const dbModule = await import('../db.ts');
    const db = dbModule.db;
    const { sql: filteredSql, params: filteredParams } = this.injectTenantFilter(sql, params);
    return db.prepare(filteredSql).all(...filteredParams) as any[];
  }

  async get(sql: string, params: any[] = []): Promise<any> {
    const dbModule = await import('../db.ts');
    const db = dbModule.db;
    const { sql: filteredSql, params: filteredParams } = this.injectTenantFilter(sql, params);
    return db.prepare(filteredSql).get(...filteredParams);
  }

  async run(
    sql: string,
    params: any[] = [],
  ): Promise<{ changes: number; lastInsertRowid: number }> {
    const dbModule = await import('../db.ts');
    const db = dbModule.db;
    return db.prepare(sql).run(...params) as any;
  }

  /**
   * Inject a parameterized tenant_id filter into SELECT queries.
   * Uses ? placeholder — never string interpolation — to prevent SQL injection.
   */
  private injectTenantFilter(sql: string, params: any[]): TenantFilterResult {
    const upper = sql.toUpperCase().trim();

    if (!upper.startsWith('SELECT') || upper.includes('TENANT_ID')) {
      return { sql, params };
    }

    const hasWhere = upper.includes('WHERE');

    if (hasWhere) {
      return {
        sql: `${sql} AND tenant_id = ?`,
        params: [...params, this.tenantId],
      };
    }

    return {
      sql: `${sql} WHERE tenant_id = ?`,
      params: [...params, this.tenantId],
    };
  }
}
