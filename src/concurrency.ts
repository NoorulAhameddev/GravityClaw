import { createLogger } from "./logger.ts";
import { AGENT_MAX_CONCURRENT } from "./config.ts";

const log = createLogger("concurrency");

const MAX_CONCURRENT = AGENT_MAX_CONCURRENT;

/**
 * Clear all active and pending sessions
 * Used for system reset and emergency shutdown
 */
export function clearSessions(): void {
    const count = activeAgents.size + pendingQueue.length;
    log.info(`Clearing ${count} sessions (${activeAgents.size} active, ${pendingQueue.length} queued)`);
    
    // Reject all pending
    for (const item of pendingQueue) {
        item.reject(new Error("System shutdown or reset requested"));
    }
    pendingQueue.length = 0;
    
    // Active agents can't be easily stopped if they are already running, 
    // but we can clear the map so new ones can start or we can exit.
    activeAgents.clear();
}


interface ActiveAgent {
    sessionId: string;
    startTime: number;
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
}

const activeAgents = new Map<string, ActiveAgent>();
const pendingQueue: Array<{
    sessionId: string;
    fn: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
}> = [];

function processQueue(): void {
    if (pendingQueue.length === 0) return;
    if (activeAgents.size >= MAX_CONCURRENT) return;

    const next = pendingQueue.shift();
    if (!next) return;

    executeAgent(next.sessionId, next.fn).then(next.resolve).catch(next.reject);
}

async function executeAgent(sessionId: string, fn: () => Promise<unknown>): Promise<unknown> {
    const startTime = Date.now();
    const active: ActiveAgent = {
        sessionId,
        startTime,
        resolve: () => {},
        reject: () => {},
    };

    const promise = new Promise<unknown>((resolve, reject) => {
        active.resolve = resolve;
        active.reject = reject;
    });

    activeAgents.set(sessionId, active);

    try {
        const result = await fn();
        active.resolve(result);
        return result;
    } catch (err) {
        active.reject(err);
        throw err;
    } finally {
        activeAgents.delete(sessionId);
        const duration = Date.now() - startTime;
        log.debug(`Agent session ${sessionId} completed in ${duration}ms`);
        processQueue();
    }
}

export async function runWithConcurrencyLimit<T>(
    sessionId: string,
    fn: () => Promise<T>
): Promise<T> {
    if (activeAgents.size >= MAX_CONCURRENT) {
        log.warn(`Max concurrent agents (${MAX_CONCURRENT}) reached, queueing session ${sessionId}`);

        return new Promise<T>((resolve, reject) => {
            pendingQueue.push({
                sessionId,
                fn: fn as () => Promise<unknown>,
                resolve: resolve as (value: unknown) => void,
                reject,
            });
        });
    }

    return executeAgent(sessionId, fn as () => Promise<unknown>) as Promise<T>;
}

export async function runWithLimit<T>(fn: () => Promise<T>): Promise<T> {
    return runWithConcurrencyLimit(`auto-${Date.now()}`, fn);
}

export function getActiveAgentCount(): number {
    return activeAgents.size;
}

export function getQueuedAgentCount(): number {
    return pendingQueue.length;
}

export function getConcurrencyStatus(): { active: number; queued: number; max: number } {
    return {
        active: activeAgents.size,
        queued: pendingQueue.length,
        max: MAX_CONCURRENT,
    };
}
