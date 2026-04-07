import type { TaskQueue, QueuedTaskPayload } from "../types.ts";
import type { BackgroundTask } from "../types.ts";
import * as storage from "../storage.ts";
import { createLogger } from "../../logger.ts";

const log = createLogger("queue:in-process");

export class InProcessTaskQueue implements TaskQueue {
    private running = false;
    private workerFn?: (task: BackgroundTask) => Promise<void>;

    async enqueueToolTask(payload: QueuedTaskPayload): Promise<BackgroundTask> {
        const now = new Date().toISOString();
        return storage.createTask({
            sessionId: payload.sessionId,
            runId: payload.runId,
            source: payload.source,
            toolName: payload.toolName,
            input: payload.input,
            userId: payload.userId,
            platform: payload.platform,
            groupId: payload.groupId,
            isGroup: payload.isGroup ?? false,
            attempt: 0,
            maxRetries: payload.maxRetries,
            status: "queued",
            workflowId: payload.workflowId,
            workflowTaskId: payload.workflowTaskId,
            availableAt: now,
        });
    }

    async enqueueAgentTask(payload: {
        sessionId: string;
        runId: string;
        message: string;
        source: "agent" | "mesh" | "scheduler";
    }): Promise<BackgroundTask> {
        const now = new Date().toISOString();
        return storage.createTask({
            sessionId: payload.sessionId,
            runId: payload.runId,
            source: payload.source,
            toolName: "__run_agent",
            input: { message: payload.message },
            userId: undefined,
            platform: undefined,
            groupId: undefined,
            isGroup: false,
            attempt: 0,
            maxRetries: 0,
            status: "queued",
            workflowId: undefined,
            workflowTaskId: undefined,
            availableAt: now,
        });
    }

    async claimNext(sessionId?: string): Promise<BackgroundTask | null> {
        return storage.claimTask(sessionId);
    }

    async markSucceeded(taskId: string, result: unknown): Promise<void> {
        storage.completeTask(taskId, result);
        log.info(`Task ${taskId} completed successfully`);
    }

    async markFailed(taskId: string, error: string): Promise<void> {
        storage.failTask(taskId, error);
        log.error(`Task ${taskId} failed: ${error}`);
    }

    async retry(taskId: string, delayMs: number): Promise<void> {
        const task = storage.getTaskById(taskId);
        if (!task) return;

        if (task.attempt >= task.maxRetries) {
            await this.markFailed(taskId, "Max retries exceeded");
            return;
        }

        const availableAt = new Date(Date.now() + delayMs).toISOString();
        storage.incrementAttempt(taskId);
        storage.rescheduleTask(taskId, availableAt);
        log.info(`Task ${taskId} will retry in ${delayMs}ms (attempt ${task.attempt + 1})`);
    }

    async reschedule(taskId: string, delayMs: number): Promise<void> {
        const availableAt = new Date(Date.now() + delayMs).toISOString();
        storage.rescheduleTask(taskId, availableAt);
        log.info(`Task ${taskId} rescheduled for ${availableAt}`);
    }

    async getTask(taskId: string): Promise<BackgroundTask | null> {
        return storage.getTaskById(taskId);
    }

    async getPendingTasks(sessionId?: string): Promise<BackgroundTask[]> {
        return storage.getPendingTasks(sessionId);
    }

    async updateStatus(taskId: string, status: BackgroundTask["status"]): Promise<void> {
        storage.updateTaskStatus(taskId, status);
    }

    startWorker(workerFn: (task: BackgroundTask) => Promise<void>, _concurrency = 5): void {
        this.workerFn = workerFn;
        this.running = true;
        this.runLoop();
        log.info("Queue worker started");
    }

    stopWorker(): void {
        this.running = false;
        log.info("Queue worker stopped");
    }

    private async runLoop(): Promise<void> {
        while (this.running) {
            try {
                const task = await this.claimNext();
                if (task && this.workerFn) {
                    await this.workerFn(task);
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                log.error("Worker loop error", msg);
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}
