import { describe, expect, it } from 'vitest';
import type { Tool } from '../types/tools.js';
import { ToolExecutor } from '../tools/executor.ts';
import { approvalGate } from '../middleware/approval.ts';

function createExecutor(tool: Tool) {
  return new ToolExecutor({
    get: (name: string) => (name === tool.name ? tool : undefined),
  });
}

describe('ToolExecutor', () => {
  it('rejects invalid input before executing a tool', async () => {
    let executed = false;
    const tool: Tool = {
      name: 'needs_value',
      description: 'test tool',
      inputSchema: {
        type: 'object',
        properties: {
          value: { type: 'string' },
        },
        required: ['value'],
      },
      async execute() {
        executed = true;
        return JSON.stringify({ success: true });
      },
    };

    const result = await createExecutor(tool).execute({
      toolName: 'needs_value',
      input: {},
      context: { sessionId: 'test:executor' },
    });

    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('validation');
    expect(executed).toBe(false);
  });

  it('requires explicit approval for tools marked requiresApproval', async () => {
    let executed = false;
    const tool: Tool = {
      name: 'dangerous_test_tool',
      description: 'test tool',
      inputSchema: { type: 'object', properties: {}, required: [] },
      requiresApproval: true,
      async execute() {
        executed = true;
        return 'executed';
      },
    };

    const result = await createExecutor(tool).execute({
      toolName: 'dangerous_test_tool',
      input: {},
      context: { sessionId: 'test:executor' },
    });

    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('approval_required');
    expect(executed).toBe(false);
  });

  it('blocks unsafe shell commands even when approval is present', async () => {
    let executed = false;
    const tool: Tool = {
      name: 'run_shell',
      description: 'shell',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string' },
        },
        required: ['command'],
      },
      requiresApproval: true,
      async execute() {
        executed = true;
        return 'executed';
      },
    };

    const request = await approvalGate.createApprovalRequest(
      'run_shell',
      { command: 'rm -rf /' },
      { userId: 'test', sessionId: 'test:executor', channel: 'test' },
    );
    await approvalGate.approve(request.id, 'test');

    const result = await createExecutor(tool).execute({
      toolName: 'run_shell',
      input: { command: 'rm -rf /' },
      context: { sessionId: 'test:executor' },
      approvalRequestId: request.id,
    });

    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('security_policy');
    expect(executed).toBe(false);
  });

  it('requires approval for dangerous shell commands even when tool requiresApproval is false', async () => {
    let executed = false;
    const tool: Tool = {
      name: 'run_shell',
      description: 'shell',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string' },
        },
        required: ['command'],
      },
      requiresApproval: false,
      async execute() {
        executed = true;
        return 'executed';
      },
    };

    const result = await createExecutor(tool).execute({
      toolName: 'run_shell',
      input: { command: 'Remove-Item -Recurse C:\\temp' },
      context: { sessionId: 'test:executor' },
    });

    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('approval_required');
    expect(result.error?.message).toContain('Dangerous command requires explicit confirmation');
    expect(executed).toBe(false);
  });

  it('does not trust caller-supplied approval metadata', async () => {
    let executed = false;
    const tool: Tool = {
      name: 'forged_approval_tool',
      description: 'test tool',
      inputSchema: { type: 'object', properties: {}, required: [] },
      requiresApproval: true,
      async execute() {
        executed = true;
        return 'executed';
      },
    };

    const result = await createExecutor(tool).execute({
      toolName: 'forged_approval_tool',
      input: {},
      context: { sessionId: 'test:executor' },
      approval: { approvedBy: 'forged-admin' },
    });

    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('approval_required');
    expect(executed).toBe(false);
  });

  it('rejects an approval when execution parameters have changed', async () => {
    let executed = false;
    const tool: Tool = {
      name: 'parameter_bound_tool',
      description: 'test tool',
      inputSchema: {
        type: 'object',
        properties: { value: { type: 'string' } },
        required: ['value'],
      },
      requiresApproval: true,
      async execute() {
        executed = true;
        return 'executed';
      },
    };

    const request = await approvalGate.createApprovalRequest(
      'parameter_bound_tool',
      { value: 'approved-value' },
      { userId: 'test', sessionId: 'test:executor', channel: 'test' },
    );
    await approvalGate.approve(request.id, 'test');

    const result = await createExecutor(tool).execute({
      toolName: 'parameter_bound_tool',
      input: { value: 'different-value' },
      context: { sessionId: 'test:executor' },
      approvalRequestId: request.id,
    });

    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('approval_required');
    expect(executed).toBe(false);
  });

  it('executes approved valid tools and injects execution context', async () => {
    const tool: Tool = {
      name: 'approved_test_tool',
      description: 'test tool',
      inputSchema: {
        type: 'object',
        properties: {
          value: { type: 'string' },
        },
        required: ['value'],
      },
      requiresApproval: true,
      async execute(input) {
        return JSON.stringify({
          value: input.value,
          sessionId: input.__sessionId,
          userId: input.__userId,
        });
      },
    };

    const request = await approvalGate.createApprovalRequest(
      'approved_test_tool',
      { value: 'ok' },
      { userId: 'user-1', sessionId: 'test:executor', channel: 'test' },
    );
    await approvalGate.approve(request.id, 'test');

    const result = await createExecutor(tool).execute({
      toolName: 'approved_test_tool',
      input: { value: 'ok' },
      context: {
        sessionId: 'test:executor',
        userId: 'user-1',
      },
      approvalRequestId: request.id,
    });

    expect(result.success).toBe(true);
    expect(result.result).toBe(
      JSON.stringify({
        value: 'ok',
        sessionId: 'test:executor',
        userId: 'user-1',
      }),
    );
  });
});
