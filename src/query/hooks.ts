export interface QueryContext {
    sessionId: string;
    messages: Array<{ role: string; content: string }>;
    systemPrompt: string;
    toolUseContext: Record<string, unknown>;
    querySource: string;
}

export interface QueryHook {
    name: string;
    preQuery?: (context: QueryContext) => Promise<void> | void;
    postQuery?: (
        context: QueryContext,
        response: { text: string; toolCalls: Array<{ name: string }> },
    ) => Promise<void> | void;
    onToolResult?: (
        context: QueryContext,
        toolName: string,
        result: string,
    ) => Promise<void> | void;
    stop?: (
        context: QueryContext,
    ) => AsyncGenerator<{ message?: string; preventContinuation?: boolean }, void>;
}

const hooks: QueryHook[] = [];

export function registerQueryHook(hook: QueryHook): void {
    hooks.push(hook);
}

export function getQueryHooks(): QueryHook[] {
    return [...hooks];
}

export async function executePreQueryHooks(context: QueryContext): Promise<void> {
    for (const hook of hooks) {
        if (hook.preQuery) {
            await hook.preQuery(context);
        }
    }
}

export async function executePostQueryHooks(
    context: QueryContext,
    response: { text: string; toolCalls: Array<{ name: string }> },
): Promise<void> {
    for (const hook of hooks) {
        if (hook.postQuery) {
            await hook.postQuery(context, response);
        }
    }
}

export async function executeToolResultHooks(
    context: QueryContext,
    toolName: string,
    result: string,
): Promise<void> {
    for (const hook of hooks) {
        if (hook.onToolResult) {
            await hook.onToolResult(context, toolName, result);
        }
    }
}

export async function* executeStopHooks(
    context: QueryContext,
): AsyncGenerator<{ message?: string; preventContinuation?: boolean }, void> {
    for (const hook of hooks) {
        if (hook.stop) {
            yield* hook.stop(context);
        }
    }
}