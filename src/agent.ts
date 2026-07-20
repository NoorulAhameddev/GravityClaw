import { config } from "./config.ts";
import { registry } from "./tools/index.ts";
import { ToolExecutor } from "./tools/executor.ts";
import { Orchestrator } from "./pipeline/orchestrator.ts";
import { clearSecretsCache } from "./secrets-runtime.ts";

export interface AgentDependencies {
    config: typeof config;
    toolRegistry: typeof registry;
    toolExecutor?: ToolExecutor;
    db: any;
}

export interface AgentRunOptions {
    message: string;
    sessionId: string;
    requestId?: string | undefined;
    requestConfirmation?: ((command: string) => Promise<boolean>) | undefined;
    onProgress?: ((text: string) => Promise<void>) | undefined;
    userId?: string | undefined;
    platform?: string | undefined;
    groupId?: string | undefined;
    isGroup?: boolean | undefined;
    depth?: number;
    maxIterations?: number;
    parentToolCallCount?: number;
    maxTotalToolCalls?: number;
    dependencies: AgentDependencies;
}

export interface AgentRunResult {
    text: string;
    toolCallCount: number;
    hitLimit: boolean;
    toolCalls: Array<{ name: string; input: Record<string, unknown>; result?: unknown; success: boolean }>;
}

export async function runAgent(options: AgentRunOptions): Promise<AgentRunResult> {
    if (!options.dependencies) throw new Error("Agent dependencies not provided");
    
    const orchestrator = new Orchestrator();
    const executor = options.dependencies.toolExecutor ?? new ToolExecutor(options.dependencies.toolRegistry);
    
    try {
        return await orchestrator.run({
            sessionId: options.sessionId,
            userId: options.userId,
            platform: options.platform,
            groupId: options.groupId,
            isGroup: options.isGroup,
            config: options.dependencies.config,
            db: options.dependencies.db,
            registry: options.dependencies.toolRegistry,
            executor,
            metrics: {},
            logger: {},
            depth: options.depth ?? 0,
            maxIterations: options.maxIterations ?? options.dependencies.config.AGENT_MAX_ITERATIONS,
            parentToolCallCount: options.parentToolCallCount ?? 0,
            maxTotalToolCalls: options.maxTotalToolCalls ?? options.dependencies.config.AGENT_MAX_TOOLS_TOTAL,
            requestId: options.requestId,
            requestConfirmation: options.requestConfirmation,
            onProgress: options.onProgress
        }, options.message);
    } finally {
        clearSecretsCache();
    }
}

export function isMeaningfulProgress(result: string): boolean {
    if (!result) return false;
    const normalized = result.toLowerCase();
    if (normalized.includes("no error") || normalized.includes("no errors") || normalized.includes("not failed")) return true;
    if (normalized.startsWith("error:") || normalized.startsWith("failed:")) return false;
    if (normalized.length < 5) return false;
    return true;
}
