import { describe, expect, it, vi } from 'vitest';
import { tenantMiddleware } from '../../middleware/tenant.ts';

describe('Tenant identity trust boundary', () => {
  it('does not derive a tenant identity from a client-supplied x-tenant-id header', () => {
    const req: any = { headers: { 'x-tenant-id': 'victim-tenant' } };
    const next = vi.fn();

    tenantMiddleware(req, {} as any, next);

    expect(req.tenant).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('uses tenant identity only when attached by trusted server-side authentication', () => {
    const req: any = {
      headers: { 'x-tenant-id': 'attacker-value' },
      authenticatedTenantId: 'verified-tenant',
    };
    const next = vi.fn();

    tenantMiddleware(req, {} as any, next);

    expect(req.tenant).toEqual({ id: 'verified-tenant', isolation: 'row' });
    expect(next).toHaveBeenCalledOnce();
  });
});
