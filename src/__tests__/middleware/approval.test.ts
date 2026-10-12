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
  });
});
