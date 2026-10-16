import type { Request, Response, NextFunction } from 'express';

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
  // Raw x-tenant-id is attacker-controlled. An authentication adapter may set
  // authenticatedTenantId only after validating a tenant-bound credential.
  const tenantId = (req as Request & { authenticatedTenantId?: string }).authenticatedTenantId;

  if (typeof tenantId !== 'string' || tenantId.trim().length === 0) {
    next();
    return;
  }

  req.tenant = { id: tenantId, isolation: 'row' };
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
    const scoped = this.injectTenantFilter(sql, params);
    return db.prepare(scoped.sql).all(...scoped.params) as any[];
  }

  async get(sql: string, params: any[] = []): Promise<any> {
    const dbModule = await import('../db.ts');
    const db = dbModule.db;
    const scoped = this.injectTenantFilter(sql, params);
    return db.prepare(scoped.sql).get(...scoped.params);
  }

  async run(
    _sql: string,
    _params: any[] = [],
  ): Promise<{ changes: number; lastInsertRowid: number }> {
    throw new Error(
      'TenantAwareDb does not support writes until tenant-scoped write enforcement is implemented.',
    );
  }

  /**
   * Wrap the caller query and filter its output outside all caller predicates.
   * Reject unsupported SQL rather than accidentally passing it through unscoped.
   */
  private injectTenantFilter(sql: string, params: any[]): TenantFilterResult {
    const trimmed = sql.trim();
    const statement = trimmed.replace(/;\s*$/, '');

    if (!/^SELECT\b/i.test(statement) || statement.includes(';')) {
      throw new Error(
        'TenantAwareDb only supports single SELECT statements with a projected tenant_id column.',
      );
    }

    return {
      sql: 'SELECT * FROM (' + statement + ') AS tenant_scoped WHERE tenant_id = ?',
      params: [...params, this.tenantId],
    };
  }
}
