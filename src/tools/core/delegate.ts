/**
 * Hermes-Grade Delegate Tool — Subagent Delegation Architecture
 * Modeled directly on Hermes Agent (delegate_tool.py)
 * 
 * Allows the primary agent to dispatch specialized child subagents for focused
 * tasks (research, coding, review, summarization), returning synthesized results
 * directly to the parent context.
 */

import type { Tool } from './index.ts';
import { AgentSwarm } from '../../agents/swarm.ts';
import { createLogger } from '../../logger.ts';

const log = createLogger('delegate-tool');

export const delegateTaskTool: Tool = {
  name: 'delegate_task',
  description:
    'Dispatch a child subagent to perform an isolated, specialized task (e.g. research, code writing, review, or summarization). Returns the subagent\'s completed output and session ID.',
  inputSchema: {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description: 'Specific goal or assignment for the subagent to complete.',
      },
      role: {
        type: 'string',
        enum: ['researcher', 'coder', 'reviewer', 'summarizer'],
        description: 'Specialized agent role (default: researcher).',
      },
      context: {
        type: 'string',
        description: 'Optional background context or constraints for the subagent.',
      },
    },
    required: ['task'],
  },
  requiresApproval: true,
  async execute(input: Record<string, unknown>): Promise<string> {
    const task = String(input.task || '').trim();
    const role = String(input.role || 'researcher').toLowerCase().trim();
    const extraContext = input.context ? String(input.context) : '';
    const parentSessionId = String(input.parentSessionId || input.__sessionId || `session_${Date.now()}`);
    const depth = typeof input.__depth === 'number' ? input.__depth : (typeof input.depth === 'number' ? input.depth : 0);

    if (!task) {
      return JSON.stringify({
        success: false,
        error: 'task is required for delegation',
      });
    }

    if (depth >= 2) {
      return JSON.stringify({
        success: false,
        error: 'Maximum subagent recursion depth reached (max depth: 2)',
      });
    }

    const validRoles = ['researcher', 'coder', 'reviewer', 'summarizer'];
    const assignedRole = validRoles.includes(role) ? (role as 'researcher' | 'coder' | 'reviewer' | 'summarizer') : 'researcher';

    const fullTaskPrompt = extraContext
      ? `Task: ${task}\n\nContext & Constraints:\n${extraContext}`
      : task;

    try {
      log.info(`Delegating task to [${assignedRole}] subagent for parent [${parentSessionId}]`);
      const swarm = new AgentSwarm(parentSessionId, {
        numAgents: 1,
        roles: [assignedRole],
        maxConcurrency: 1,
      });

      const childResult = await swarm.spawnAgent(assignedRole, fullTaskPrompt);

      return JSON.stringify({
        success: true,
        role: assignedRole,
        childSessionId: childResult.sessionId,
        status: childResult.status,
        result: childResult.content,
      });
    } catch (err) {
      log.error(`Delegation to [${assignedRole}] failed:`, err);
      return JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
};
