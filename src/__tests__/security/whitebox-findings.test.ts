/**
 * White-Box Testing Findings — Verification Test Suite
 *
 * Verifies all confirmed and potential findings from the white-box analysis report.
 * Each test is tagged with its finding ID (TC-001 through TC-012).
 */

import { describe, it, expect, beforeEach } from 'vitest';

// -------------------------------------------------------------------
// TC-001 / TC-002 — F-001: SQL Injection prevention in TenantAwareDb
// -------------------------------------------------------------------
import { TenantAwareDb } from '../../middleware/tenant.ts';

describe('FINDING-001: TenantAwareDb SQL injection prevention', () => {
  it('TC-001: injects tenant_id using ? placeholder, not string interpolation', () => {
    const maliciousTenantId = "' OR '1'='1";
    const db = new TenantAwareDb(maliciousTenantId);

    const result = (db as any).injectTenantFilter('SELECT * FROM memory', []);

    // SQL must contain ? placeholder, NOT the raw tenant string
    expect(result.sql).toContain('?');
    expect(result.sql).not.toContain(maliciousTenantId);
    // Tenant ID in params, not inline SQL
    expect(result.params).toContain(maliciousTenantId);
  });

  it('TC-002: uses AND (not a second WHERE) when WHERE clause already present', () => {
    const db = new TenantAwareDb('my-tenant');
    const result = (db as any).injectTenantFilter(
      'SELECT * FROM memory WHERE session_id = ?',
      ['sess-1'],
    );

    expect(result.sql).toMatch(/AND tenant_id = \?/i);
    const whereCount = (result.sql.toUpperCase().match(/\bWHERE\b/g) || []).length;
    expect(whereCount).toBe(1);
    expect(result.params).toEqual(['sess-1', 'my-tenant']);
  });

  it('TC-002b: does not modify non-SELECT statements', () => {
    const db = new TenantAwareDb('my-tenant');
    const result = (db as any).injectTenantFilter(
      'UPDATE memory SET message_json = ? WHERE id = ?',
      ['{}', 1],
    );
    expect(result.sql).toBe('UPDATE memory SET message_json = ? WHERE id = ?');
    expect(result.params).toEqual(['{}', 1]);
  });

  it('TC-002c: does not re-inject when tenant_id already in query', () => {
    const db = new TenantAwareDb('my-tenant');
    const result = (db as any).injectTenantFilter(
      'SELECT * FROM memory WHERE tenant_id = ?',
      ['my-tenant'],
    );
    expect((result.sql.match(/tenant_id/gi) || []).length).toBe(1);
  });
});

// -------------------------------------------------------------------
// TC-003 — F-003: constantTimeEquals timing safety
// -------------------------------------------------------------------
import { constantTimeEquals } from '../../middleware/auth.ts';

describe('FINDING-003: constantTimeEquals length-leak prevention', () => {
  it('TC-003: returns false for strings of different lengths without short-circuiting', () => {
    expect(constantTimeEquals('short', 'a-much-longer-string')).toBe(false);
    expect(constantTimeEquals('a-much-longer-string', 'short')).toBe(false);
  });

  it('TC-003b: returns true for identical strings', () => {
    expect(constantTimeEquals('my-api-key-value', 'my-api-key-value')).toBe(true);
  });

  it('TC-003c: returns false for same-length but different strings', () => {
    expect(constantTimeEquals('aaaaaaaaa', 'bbbbbbbbb')).toBe(false);
  });

  it('TC-003d: handles empty strings', () => {
    expect(constantTimeEquals('', '')).toBe(true);
    expect(constantTimeEquals('', 'x')).toBe(false);
    expect(constantTimeEquals('x', '')).toBe(false);
  });
});

// -------------------------------------------------------------------
// TC-004 — F-006: decryptAllSecrets skips soft-deleted secrets
// -------------------------------------------------------------------
import { encryptSecret, decryptAllSecrets, saveSecretsFile } from '../../secrets.ts';
import { unlink } from 'fs/promises';
import { resolve } from 'path';

describe('FINDING-006: decryptAllSecrets soft-delete filter', () => {
  const testFile = resolve('test-whitebox-secrets.enc.json');
  const masterKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(async () => {
    try { await unlink(testFile); } catch { /* ignore */ }
  });

  it('TC-004: does not return secrets with status=deleted', async () => {
    const secrets = new Map();
    const active = encryptSecret('active-value', masterKey);
    const deleted = encryptSecret('deleted-value', masterKey);
    deleted.metadata = { status: 'deleted' };

    secrets.set('ACTIVE_SECRET', active);
    secrets.set('DELETED_SECRET', deleted);
    await saveSecretsFile(testFile, secrets);

    const result = await decryptAllSecrets(testFile, masterKey);

    expect(result.has('ACTIVE_SECRET')).toBe(true);
    expect(result.get('ACTIVE_SECRET')).toBe('active-value');
    expect(result.has('DELETED_SECRET')).toBe(false);

    await unlink(testFile);
  });

  it('TC-004b: returns all non-deleted secrets normally', async () => {
    const secrets = new Map();
    secrets.set('KEY_A', encryptSecret('value-a', masterKey));
    secrets.set('KEY_B', encryptSecret('value-b', masterKey));
    await saveSecretsFile(testFile, secrets);

    const result = await decryptAllSecrets(testFile, masterKey);
    expect(result.size).toBe(2);

    await unlink(testFile);
  });
});

// -------------------------------------------------------------------
// TC-005 / TC-006 — F-004: WebSocket auth rejects invalid credentials
// -------------------------------------------------------------------
import { validateWebSocketAuth } from '../../middleware/websocket-auth.ts';
import { IncomingMessage } from 'http';
import { Socket } from 'net';

function makeWsRequest(opts: {
  apiKey?: string;
  token?: string;
  remoteAddress?: string;
}): IncomingMessage {
  const socket = new Socket();
  Object.defineProperty(socket, 'remoteAddress', { value: opts.remoteAddress ?? '203.0.113.1' });
  const req = new IncomingMessage(socket);
  req.url = opts.token ? `/?token=${opts.token}` : '/';
  req.headers = { host: 'test.local' };
  if (opts.apiKey) req.headers['x-api-key'] = opts.apiKey;
  return req;
}

describe('FINDING-004: WebSocket auth explicit rejection paths', () => {
  it('TC-005: rejects when API key is invalid and session token is also invalid', () => {
    const result = validateWebSocketAuth(
      makeWsRequest({ apiKey: 'wrong-key', token: 'garbage.token.here' }),
      '/ws',
    );
    expect(result.isAuthenticated).toBe(false);
  });

  it('TC-006: rejects when no credentials provided (non-localhost)', () => {
    const result = validateWebSocketAuth(makeWsRequest({}), '/ws');
    expect(result.isAuthenticated).toBe(false);
  });

  it('TC-006b: rejects when only invalid API key provided', () => {
    const result = validateWebSocketAuth(
      makeWsRequest({ apiKey: 'totally-wrong' }),
      '/ws',
    );
    expect(result.isAuthenticated).toBe(false);
  });
});

// -------------------------------------------------------------------
// TC-007 — RBAC unknown role defaults to viewer
// -------------------------------------------------------------------
import { getPermissions } from '../../auth/rbac.ts';

describe('Coverage gap: RBAC unknown role fallback', () => {
  it('TC-007: unknown role string falls back to viewer permissions', () => {
    const permissions = getPermissions('superadmin' as any);
    expect(permissions).toContain('session:read');
    expect(permissions).not.toContain('admin:all');
    expect(permissions).not.toContain('tools:execute');
  });
});

// -------------------------------------------------------------------
// TC-010 / TC-011 — Path validator edge cases
// -------------------------------------------------------------------
import { isPathSafe, validatePathAccess, clearValidationCache } from '../../security/path-validator.ts';

describe('FINDING-009: isPathSafe return semantics', () => {
  // Use a real absolute path — Unix-style literals resolve differently on Windows
  const base = process.cwd();

  it('TC-010: returns true when targetPath stays inside basePath', () => {
    expect(isPathSafe(base, 'subdir/file.txt')).toBe(true);
  });

  it('TC-010b: returns false when targetPath escapes basePath via ..', () => {
    // Enough .. to escape any real working directory depth
    expect(isPathSafe(base, '../../../../../../../../../etc/passwd')).toBe(false);
  });
});

describe('Coverage gap: validatePathAccess empty allowedPaths', () => {
  beforeEach(() => clearValidationCache());

  it('TC-011: rejects path when allowedPaths is empty array', () => {
    const result = validatePathAccess('/workspace/file.txt', {
      allowedPaths: [],
      action: 'read',
    });
    expect(result.allowed).toBe(false);
  });
});

// -------------------------------------------------------------------
// TC-012 — URL validator port allow-list enforcement
// -------------------------------------------------------------------
import { validateUrl } from '../../security/url-validator.ts';

describe('Coverage gap: validateUrl allowedPorts enforcement', () => {
  it('TC-012: rejects port not in allowedPorts', () => {
    const result = validateUrl('http://example.com:8080/data', {
      allowPrivate: false,
      allowedPorts: [80, 443],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/port/i);
  });

  it('TC-012b: allows port that is in allowedPorts', () => {
    const result = validateUrl('http://example.com/data', {
      allowPrivate: false,
      allowedPorts: [80, 443],
    });
    expect(result.valid).toBe(true);
  });
});

// -------------------------------------------------------------------
// DEF-001 — SSRF prevention on bracketed IPv6
// -------------------------------------------------------------------
describe('DEF-001: SSRF prevention for bracketed IPv6 addresses', () => {
  it('rejects bracketed IPv6 loopback [::1] when allowPrivate is false', () => {
    const result = validateUrl('http://[::1]/', { allowPrivate: false });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/private or internal/i);
  });

  it('rejects bracketed IPv6 link-local [fe80::1] when allowPrivate is false', () => {
    const result = validateUrl('http://[fe80::1]:8080/', {
      allowPrivate: false,
      allowedPorts: [8080],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/private or internal/i);
  });

  it('allows bracketed IPv6 loopback [::1] when allowLocalhost is true', () => {
    const result = validateUrl('http://[::1]/', {
      allowPrivate: false,
      allowLocalhost: true,
    });
    expect(result.valid).toBe(true);
  });
});

// -------------------------------------------------------------------
// DEF-004 — Command validator allows quoted chaining/redirection characters
// -------------------------------------------------------------------
import { validateCommand } from '../../security/command-validator.ts';

describe('DEF-004: Command validator quoted character handling', () => {
  it('allows semicolons inside double quotes (e.g. commit messages)', () => {
    const result = validateCommand('git commit -m "feat: user; fix: auth"');
    expect(result.allowed).toBe(true);
  });

  it('allows redirection operators inside quotes', () => {
    const result = validateCommand('echo "score: a > b"');
    expect(result.allowed).toBe(true);
  });

  it('still blocks unquoted chaining operators', () => {
    const result = validateCommand('git status; ls');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/dangerous patterns|chaining/i);
  });
});

// -------------------------------------------------------------------
// DEF-002 — Auth middleware sets admin role and user context
// -------------------------------------------------------------------
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth.ts';
import { requirePermission } from '../../auth/rbac.ts';
import { config } from '../../config.ts';

describe('DEF-002: Auth middleware RBAC context propagation', () => {
  it('attaches admin role and user object when authenticated via API key', () => {
    const req = {
      headers: { 'x-api-key': config.API_KEY || 'test-key' },
      path: '/api/admin/users',
      method: 'POST',
      ip: '198.51.100.1',
    } as unknown as AuthenticatedRequest;
    const res = { status: () => res, json: () => res } as any;
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    authMiddleware(req, res, next);
    expect(nextCalled).toBe(true);
    expect(req.role).toBe('admin');
    expect(req.user?.role).toBe('admin');

    // Verify requirePermission('users:manage') succeeds with this request
    let permNextCalled = false;
    const permMiddleware = requirePermission('users:manage');
    permMiddleware(req, res, () => { permNextCalled = true; });
    expect(permNextCalled).toBe(true);
  });
});

