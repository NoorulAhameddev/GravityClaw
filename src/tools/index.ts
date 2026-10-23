import type { ChatCompletionTool } from 'openai/resources/chat/completions.js';
import type { Tool, ToolRegistry as ToolRegistryType } from '../types/tools.js';

export type { Tool, ToolRegistry } from '../types/tools.js';
import {
  adminTools,
  communicationTools,
  spawnAgentTool,
  delegateTaskTool,
  aggregateResultsTool,
} from './core/index.ts';
import {
  voiceTools,
  ttsTools,
  elevenLabsTools,
  voiceSettingsTools,
  wakeWordTools,
  talkModeTools,
} from './voice/index.ts';
import {
  memoryTools,
  saveFactTool,
  recallFactsTool,
  saveEntityTool,
  saveRelationshipTool,
  queryGraphTool,
  searchMemorySemanticTool,
  searchTools,
} from './memory/index.ts';
import {
  datetimeTool,
  shellTool,
  executeCodeTool,
  searchAttachmentsTool,
  fileOperationTools,
  rateLimitingTools,
} from './system/index.ts';
import { dashboardTools, uiAdminTools } from './ui/index.ts';
import { backupTools } from './backup/index.ts';
import { securityTools } from './security/index.ts';
import { schedulerTools } from '../scheduler/index.ts';
import { webhookTools } from '../webhooks/index.ts';
import { heartbeatTools } from '../heartbeat/index.ts';
import { skillsManager, skillManagementTools } from '../skills/index.ts';
import { canvasPushTool } from '../canvas/index.ts';
import {
  exportChatHistoryTool,
  exportMemoryTool,
  exportUsageStatsTool,
  exportGraphTool,
} from './export/index.ts';
import { browserTools } from './automation/index.ts';
import { mcpTools } from '../mcp/index.ts';
import { calendarTools } from './calendar/google-calendar.ts';
import { notionTools } from './productivity/notion.ts';
import { sandboxTool } from './sandbox.ts';
import { clearLLMCacheTool } from './cache.ts';
import { fileDiffTool } from './files/index.ts';
import { ToolExecutor } from './executor.ts';

class ToolRegistry implements ToolRegistryType {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAll(): Tool[] {
    return [...this.tools.values()];
  }

  /** Returns tool definitions in OpenAI / OpenRouter format */
  getOpenAIDefinitions(): ChatCompletionTool[] {
    return [...this.tools.values()].map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));
  }

  /** Check if a tool requires approval */
  requiresApproval(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) return false;
    return tool.requiresApproval ?? false;
  }

  /**
   * Get relevant tools based on query text.
   * Separate action (verbs) from objects (nouns) for better relevance.
   * Returns up to `limit` tools sorted by relevance.
   */
  getRelevantTools(query: string, limit = 25): Tool[] {
    const tools = Array.from(this.tools.values());

    if (!query || query.trim().length === 0 || tools.length <= 15) {
      return tools.slice(0, limit);
    }

    const actionWords = [
      'list',
      'read',
      'create',
      'delete',
      'write',
      'search',
      'find',
      'get',
      'set',
      'update',
      'save',
      'store',
      'query',
      'load',
      'spawn',
      'push',
      'run',
      'execute',
      'start',
      'stop',
      'send',
      'call',
      'check',
      'show',
      'open',
      'view',
      'fetch',
      'schedule',
      'diff',
      'clear',
      'export',
    ];
    const objectWords = [
      'file',
      'files',
      'folder',
      'directory',
      'audio',
      'speech',
      'text',
      'memory',
      'graph',
      'entity',
      'entities',
      'relation',
      'relationship',
      'relationships',
      'fact',
      'facts',
      'skill',
      'skills',
      'schedule',
      'task',
      'tasks',
      'calendar',
      'notion',
      'browser',
      'web',
      'page',
      'url',
      'site',
      'shell',
      'command',
      'terminal',
      'script',
      'code',
      'plugin',
      'session',
      'user',
      'group',
      'permission',
      'time',
      'date',
      'datetime',
      'now',
      'today',
      'clock',
      'weather',
      'backup',
      'stats',
      'usage',
      'token',
      'model',
      'swarm',
      'agent',
      'subagent',
      'canvas',
      'widget',
    ];

    const words = query
      .toLowerCase()
      .split(/[\s,.'"`_/-]+/)
      .filter((w) => w.length > 1);
    const actions = words.filter((w) => actionWords.includes(w));
    const objects = words.filter((w) => objectWords.includes(w));
    const q = query.toLowerCase();

    // Comprehensive default baseline tools
    const defaultTools = [
      'get_datetime',
      'run_shell',
      'execute_code',
      'delegate_task',
      'read_file',
      'write_file',
      'list_files',
      'search_files',
      'save_fact',
      'recall_facts',
      'websearch',
    ];

    const scored = tools.map((tool) => {
      const name = tool.name.toLowerCase();
      const desc = tool.description.toLowerCase();
      const text = name + ' ' + desc;

      let score = 0;
      let hasActionMatch = false;
      let hasObjectMatch = false;

      // Direct tool name match - HIGHEST priority (+15)
      if (q.includes(name) || words.includes(name) || words.some((w) => w.length > 3 && (name.includes(w) || w.includes(name)))) {
        score += 15;
      }

      // (A) Object match - HIGH priority (+6)
      for (const obj of objects) {
        if (name.includes(obj) || desc.includes(obj)) {
          hasObjectMatch = true;
          score += 6;
        }
      }

      // (B) Action match - LOW priority (+2)
      for (const act of actions) {
        if (name.includes(act)) {
          hasActionMatch = true;
          score += 2;
        }
      }

      // (C) Exact phrase match (+8)
      if (text.includes(q)) {
        score += 8;
      }

      // (D) Combined match bonus (+5)
      if (hasActionMatch && hasObjectMatch) {
        score += 5;
      }

      // (E) Penalize generic "list" without object
      if (name.includes('list') && !hasObjectMatch) {
        score -= 2;
      }

      // (F) Boost core work tools (+4)
      const coreWorkTools = [
        'run_shell',
        'execute_code',
        'delegate_task',
        'spawn_agent',
        'read_file',
        'write_file',
        'search_files',
        'get_datetime',
      ];
      if (coreWorkTools.includes(name)) {
        score += 4;
      }

      // (G) Boost time/date queries
      if (words.some((w) => ['time', 'date', 'now', 'today', 'clock', 'hour'].includes(w))) {
        if (name.includes('datetime') || name.includes('time') || desc.includes('current time')) {
          score += 10;
        }
      }

      // (H) Keep previous penalties for voice categories unless asked
      const voiceCategories = ['wake', 'elevenlabs'];
      const hasVoiceCategory = voiceCategories.some((cat) => name.includes(cat));
      const queryHasVoiceWord = words.some((w) => voiceCategories.includes(w));

      if (hasVoiceCategory && !queryHasVoiceWord) {
        score -= 3;
      }

      return { tool, score };
    });

    const filtered = scored.filter((s) => s.score >= 2);

    if (filtered.length === 0) {
      const baseline = tools.filter((t) => defaultTools.includes(t.name));
      return baseline.length > 0 ? baseline.slice(0, limit) : tools.slice(0, limit);
    }

    return filtered
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.tool);
  }

  /**
   * Convert a subset of tools to OpenAI function definitions.
   * Useful when only relevant tools should be passed to LLM.
   */
  getOpenAIDefinitionsForTools(tools: Tool[]): ChatCompletionTool[] {
    return tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));
  }
}

export const registry = new ToolRegistry();
export const toolExecutor = new ToolExecutor(registry);

export function registerBuiltInTools(): void {
  registry.register(datetimeTool);
  registry.register(shellTool);
  registry.register(executeCodeTool);
  registry.register(saveFactTool);
  registry.register(recallFactsTool);
  registry.register(saveEntityTool);
  registry.register(saveRelationshipTool);
  registry.register(queryGraphTool);
  registry.register(searchAttachmentsTool);
  registry.register(searchMemorySemanticTool);

  voiceTools.forEach((tool) => registry.register(tool));
  ttsTools.forEach((tool) => registry.register(tool));
  elevenLabsTools.forEach((tool) => registry.register(tool));
  voiceSettingsTools.forEach((tool) => registry.register(tool));
  wakeWordTools.forEach((tool) => registry.register(tool));
  talkModeTools.forEach((tool) => registry.register(tool));
  fileOperationTools.forEach((tool) => registry.register(tool));
  searchTools.forEach((tool) => registry.register(tool));
  browserTools.forEach((tool) => registry.register(tool));
  communicationTools.forEach((tool) => registry.register(tool));
  dashboardTools.forEach((tool) => registry.register(tool));
  uiAdminTools.forEach((tool) => registry.register(tool));
  memoryTools.forEach((tool) => registry.register(tool));
  adminTools.forEach((tool) => registry.register(tool));
  rateLimitingTools.forEach((tool) => registry.register(tool));
  backupTools.forEach((tool) => registry.register(tool));
  securityTools.forEach((tool) => registry.register(tool));
  schedulerTools.forEach((tool) => registry.register(tool));
  webhookTools.forEach((tool) => registry.register(tool));
  heartbeatTools.forEach((tool) => registry.register(tool));

  // Skills tools (management + dynamic)
  skillManagementTools.forEach((tool) => registry.register(tool));
  const skillTools = skillsManager.getSkillTools();
  skillTools.forEach((tool) => registry.register(tool));

  registry.register(exportChatHistoryTool);
  registry.register(exportMemoryTool);
  registry.register(exportUsageStatsTool);
  registry.register(exportGraphTool);
  registry.register(canvasPushTool);

  registry.register(spawnAgentTool);
  registry.register(delegateTaskTool);
  registry.register(aggregateResultsTool);
  mcpTools.forEach((tool) => registry.register(tool));
  calendarTools.forEach((tool) => registry.register(tool));
  notionTools.forEach((tool) => registry.register(tool));
  registry.register(sandboxTool);
  registry.register(clearLLMCacheTool);
  registry.register(fileDiffTool);
}
