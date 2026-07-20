import { config } from "../config.ts";
import { createLogger } from "../logger.ts";
import { SqliteTaskQueue } from "./backends/sqlite.ts";
import type { TaskQueue, QueuedTaskPayload, BackgroundTask } from "./types.ts";
import { injectTraceContext } from "../lib/telemetry/tracer.js";

const log = createLogger("queue");

let queueInstance: TaskQueue | null = null;

export function getTaskQueue(): TaskQueue {
    if (!queueInstance) {
        if (config.QUEUE_ENABLED && config.REDIS_URL) {
            log.warn("⚠️ BullMQ backend not yet implemented — REDIS_URL is configured but Redis-backed queue is unavailable. Falling back to SQLite queue.");
        }
        log.info(`Using SQLite queue backend (QUEUE_ENABLED=${config.QUEUE_ENABLED})`);
        queueInstance = new SqliteTaskQueue();
    }
    return queueInstance;
}

export async function enqueueToolTask(payload: QueuedTaskPayload): Promise<BackgroundTask> {
    const queue = getTaskQueue();
    return queue.enqueueToolTask(payload);
}

export async function enqueueToolTaskWithTrace(payload: QueuedTaskPayload): Promise<BackgroundTask> {
    return enqueueToolTask({
        ...payload,
        _trace: injectTraceContext(),
    });
}

export async function enqueueAgentTask(payload: {
    sessionId: string;
    runId: string;
    message: string;
    source: "agent" | "mesh" | "scheduler";
}): Promise<BackgroundTask> {
    const queue = getTaskQueue();
    return queue.enqueueAgentTask(payload);
}

export async function claimNextTask(sessionId?: string): Promise<BackgroundTask | null> {
    const queue = getTaskQueue();
    return queue.claimNext(sessionId);
}

export async function completeTask(taskId: string, result: unknown): Promise<void> {
    const queue = getTaskQueue();
    return queue.markSucceeded(taskId, result);
}

export async function failTask(taskId: string, error: string): Promise<void> {
    const queue = getTaskQueue();
    return queue.markFailed(taskId, error);
}

export async function retryTask(taskId: string, delayMs: number): Promise<void> {
    const queue = getTaskQueue();
    return queue.retry(taskId, delayMs);
}

export async function rescheduleTask(taskId: string, delayMs: number): Promise<void> {
    const queue = getTaskQueue();
    return queue.reschedule(taskId, delayMs);
}

export async function getTask(taskId: string): Promise<BackgroundTask | null> {
    const queue = getTaskQueue();
    return queue.getTask(taskId);
}

export async function getPendingTasks(sessionId?: string): Promise<BackgroundTask[]> {
    const queue = getTaskQueue();
    return queue.getPendingTasks(sessionId);
}

export function shouldQueueTool(
    toolName: string,
    hasQueueMetadata: boolean
): boolean {
    if (!config.QUEUE_ENABLED) {
        return false;
    }

    return hasQueueMetadata;
}

export function computeBackoff(attempt: number, baseDelay = 1000): number {
    return Math.min(baseDelay * Math.pow(2, attempt), 60000);
}

export function isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return (
            message.includes("timeout") ||
            message.includes("rate limit") ||
            message.includes("network") ||
            message.includes("ECONNREFUSED") ||
            message.includes("ETIMEDOUT")
        );
    }
    return false;
}

export function isQueueWorkerRunning(): boolean {
    const queue = getTaskQueue();
    if (queue.isWorkerRunning) {
        return queue.isWorkerRunning();
    }
    return config.QUEUE_ENABLED;
}

export type { TaskQueue, QueuedTaskPayload, BackgroundTask };
