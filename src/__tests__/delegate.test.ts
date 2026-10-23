import { describe, it, expect, vi } from 'vitest';
import { delegateTaskTool } from '../tools/core/delegate.ts';

describe('Subagent Delegation Tool (Hermes Parity)', () => {
  it('should have standard Tool definition', () => {
    expect(delegateTaskTool.name).toBe('delegate_task');
    expect(delegateTaskTool.description).toBeDefined();
    expect(delegateTaskTool.inputSchema).toBeDefined();
    expect(delegateTaskTool.requiresApproval).toBe(true);
  });

  it('should validate required task field', async () => {
    const res = await delegateTaskTool.execute({
      task: '',
    });
    const parsed = JSON.parse(res);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('task is required');
  });

  it('should guard against infinite subagent recursion depth', async () => {
    const res = await delegateTaskTool.execute({
      task: 'nested delegation',
      depth: 2,
    });
    const parsed = JSON.parse(res);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Maximum subagent recursion depth reached');
  });
});
