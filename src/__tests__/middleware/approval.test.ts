import { describe, it, expect } from 'vitest';
import { ApprovalGate } from '../../middleware/approval.ts';

describe('Approval Gate Security Enforcement', () => {
  it('should require approval for delete_file even when configured as file_delete', () => {
    const gate = new ApprovalGate({
      enabled: true,
      requiredTools: new Set(['file_delete', 'run_shell']),
    });

    expect(gate.isApprovalRequired('delete_file')).toBe(true);
    expect(gate.isApprovalRequired('file_delete')).toBe(true);
    expect(gate.isApprovalRequired('run_shell')).toBe(true);
    expect(gate.isApprovalRequired('read_file')).toBe(false);
    gate.stopExpirationChecker();
  });

  it('binds an approval to the exact parameters and ignores key order', async () => {
    const gate = new ApprovalGate({
      enabled: true,
      requiredTools: new Set(['run_shell']),
    });

    try {
      const request = await gate.createApprovalRequest(
        'run_shell',
        { command: 'git status', options: { cwd: '/workspace', verbose: true } },
        { userId: 'user-1', sessionId: 'session-1', channel: 'test' },
      );

      expect(
        gate.matchesParameters(request.id, {
          options: { verbose: true, cwd: '/workspace' },
          command: 'git status',
        }),
      ).toBe(true);
      expect(
        gate.matchesParameters(request.id, {
          command: 'rm -rf /',
          options: { cwd: '/workspace', verbose: true },
        }),
      ).toBe(false);
    } finally {
      gate.stopExpirationChecker();
    }
  });
});
