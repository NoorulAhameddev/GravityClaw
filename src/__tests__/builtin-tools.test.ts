import { describe, it, expect, beforeAll } from 'vitest';
import { registry, registerBuiltInTools } from '../tools/index.ts';

const REGISTERED_SUITES = {
  backup: [
    'create_backup',
    'restore_backup',
    'list_backups',
    'delete_backup',
    'get_backup_status',
    'verify_backup',
  ],
  security: ['getSecurityAuditLog', 'getSecurityStatus', 'rotateSecrets', 'validatePathAccess'],
  uiAdmin: ['listGroupsForUser', 'getGroupSettings', 'updateGroupTools', 'updateGroupSettings'],
};

describe('Built-in tool registration', () => {
  beforeAll(() => {
    registerBuiltInTools();
  });

  it('should register all backup tools', () => {
    for (const name of REGISTERED_SUITES.backup) {
      expect(registry.get(name), `expected ${name} to be registered`).toBeDefined();
    }
  });

  it('should register all security tools', () => {
    for (const name of REGISTERED_SUITES.security) {
      expect(registry.get(name), `expected ${name} to be registered`).toBeDefined();
    }
  });

  it('should register all ui admin tools', () => {
    for (const name of REGISTERED_SUITES.uiAdmin) {
      expect(registry.get(name), `expected ${name} to be registered`).toBeDefined();
    }
  });

  it('should not register duplicate tool names', () => {
    const names = registry.getAll().map((t) => t.name);
    const unique = new Set(names);
    expect(names.length).toBe(unique.size);
  });
});
