import type { ChatCompletionTool } from "openai/resources/chat/completions.js";
import type { Tool, ToolRegistry as ToolRegistryType } from "../types/tools.js";

export type { Tool, ToolRegistry } from "../types/tools.js";
import {
    adminTools,
    communicationTools,
    spawnAgentTool,
    aggregateResultsTool,
} from "./core/index.ts";
import {
    voiceTools,
    ttsTools,
    elevenLabsTools,
    voiceSettingsTools,
    wakeWordTools,
    talkModeTools,
} from "./voice/index.ts";
import {
    memoryTools,
    saveFactTool,
    recallFactsTool,
    saveEntityTool,
    saveRelationshipTool,
    queryGraphTool,
    searchMemorySemanticTool,
    searchTools,
} from "./memory/index.ts";
import { datetimeTool, shellTool, searchAttachmentsTool, fileOperationTools, rateLimitingTools } from "./system/index.ts";
import { dashboardTools, mobileTools } from "./ui/index.ts";
import { schedulerTools } from "../scheduler/index.ts";
import { webhookTools } from "../webhooks/index.ts";
import { heartbeatTools } from "../heartbeat/index.ts";
import { skillsManager } from "../skills/index.ts";
import { canvasPushTool } from "../canvas/index.ts";
import {
    exportChatHistoryTool,
    exportMemoryTool,
    exportUsageStatsTool,
    exportGraphTool
} from "./export/index.ts";
import { browserTools } from "./automation/index.ts";
import { mcpTools } from "../mcp/index.ts";
import { calendarTools } from "./calendar/google-calendar.ts";
import { notionTools } from "./productivity/notion.ts";
import { sandboxTool, runCodeAliasTool } from "./sandbox.ts";
import { ToolExecutor } from "./executor.ts";

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
            type: "function" as const,
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
    getRelevantTools(query: string, limit = 8): Tool[] {
        const tools = Array.from(this.tools.values());
        
        // Separate query into action words (verbs) and object words (nouns)
        const actionWords = ["list", "read", "create", "delete", "write", "search", "find", "get", "set", "update", "run", "execute", "start", "stop", "send", "call"];
        const objectWords = ["file", "files", "folder", "directory", "audio", "speech", "text", "memory", "graph", "entity", "fact", "schedule", "task", "calendar", "notion", "browser", "shell", "command", "plugin", "session", "user", "group", "permission"];
        
        const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
        const actions = words.filter(w => actionWords.includes(w));
        const objects = words.filter(w => objectWords.includes(w));
        const q = query.toLowerCase();
        
        // Default fallback tools
        const defaultTools = ["list_files", "read_file", "search_files"];
        
        const scored = tools.map(tool => {
            const name = tool.name.toLowerCase();
            const desc = tool.description.toLowerCase();
            const text = name + " " + desc;
            
            let score = 0;
            let hasActionMatch = false;
            let hasObjectMatch = false;
            
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
            if (name.includes("list") && !hasObjectMatch) {
                score -= 4;
            }

            // (F) Boost core work tools (+5)
            const coreWorkTools = ["run_shell", "spawn_agent", "read_file", "write_file", "search_files"];
            if (coreWorkTools.includes(name)) {
                score += 5;
            }

            // (G) Boost domain-specific tools (+3)
            const domainKeywords = ["file", "search", "read", "write"];
            const queryHasDomainWord = words.some(w => domainKeywords.some(kw => w.includes(kw)));
            const toolHasDomainKeyword = domainKeywords.some(kw => name.includes(kw));
            if (queryHasDomainWord && toolHasDomainKeyword) {
                score += 3;
            }

            // (H) Keep previous penalties for unrelated categories
            const unrelatedCategories = ["wake", "voice", "talk", "audio", "tts", "stt", "elevenlabs"];
            const hasUnrelatedCategory = unrelatedCategories.some(cat => name.includes(cat));
            const queryHasCategoryWord = words.some(w => unrelatedCategories.includes(w));
            
            if (hasUnrelatedCategory && !queryHasCategoryWord) {
                score -= 3;
            }
            
            return { tool, score };
        });
        
        // Filter out low-score tools (minimum relevance threshold)
        const filtered = scored.filter(s => s.score >= 2);
        
        // Fallback: if no tools found, return defaults
        if (filtered.length === 0) {
            return tools
                .filter(t => defaultTools.includes(t.name))
                .slice(0, limit);
        }
        
        return filtered
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(s => s.tool);
    }

    /**
     * Convert a subset of tools to OpenAI function definitions.
     * Useful when only relevant tools should be passed to LLM.
     */
    getOpenAIDefinitionsForTools(tools: Tool[]): ChatCompletionTool[] {
        return tools.map((t) => ({
            type: "function" as const,
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
    registry.register(saveFactTool);
    registry.register(recallFactsTool);
    registry.register(saveEntityTool);
    registry.register(saveRelationshipTool);
    registry.register(queryGraphTool);
    registry.register(searchAttachmentsTool);
    registry.register(searchMemorySemanticTool);

    voiceTools.forEach(tool => registry.register(tool));
    ttsTools.forEach(tool => registry.register(tool));
    elevenLabsTools.forEach(tool => registry.register(tool));
    voiceSettingsTools.forEach(tool => registry.register(tool));
    wakeWordTools.forEach(tool => registry.register(tool));
    talkModeTools.forEach(tool => registry.register(tool));
    fileOperationTools.forEach(tool => registry.register(tool));
    searchTools.forEach(tool => registry.register(tool));
    browserTools.forEach(tool => registry.register(tool));
    communicationTools.forEach(tool => registry.register(tool));
    dashboardTools.forEach(tool => registry.register(tool));
    mobileTools.forEach(tool => registry.register(tool));
    memoryTools.forEach(tool => registry.register(tool));
    adminTools.forEach(tool => registry.register(tool));
    rateLimitingTools.forEach(tool => registry.register(tool));
    schedulerTools.forEach(tool => registry.register(tool));
    webhookTools.forEach(tool => registry.register(tool));
    heartbeatTools.forEach(tool => registry.register(tool));

    // Skills tools are dynamic
    const skillTools = skillsManager.getSkillTools();
    skillTools.forEach(tool => registry.register(tool));

    registry.register(exportChatHistoryTool);
    registry.register(exportMemoryTool);
    registry.register(exportUsageStatsTool);
    registry.register(exportGraphTool);
    registry.register(canvasPushTool);

    registry.register(spawnAgentTool);
    registry.register(aggregateResultsTool);
    mcpTools.forEach(tool => registry.register(tool));
    calendarTools.forEach(tool => registry.register(tool));
    notionTools.forEach(tool => registry.register(tool));
    registry.register(sandboxTool);
    registry.register(runCodeAliasTool);
}
