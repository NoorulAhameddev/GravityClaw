import type { TaskQueue, QueuedTaskPayload } from "../types.ts";
import type { BackgroundTask } from "../types.ts";
import * as storage from "../storage.ts";
import { createLogger } from "../../logger.ts";

const log = createLogger("queue:sqlite");

export class SqliteTaskQueue implements TaskQueue {
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

    startWorker(workerFn: (task: BackgroundTask) => Promise<void>, concurrency = 5): void {
        this.workerFn = workerFn;
        this.running = true;
        this.runLoop(concurrency);
        log.info(`Queue worker started with concurrency ${concurrency}`);
    }

    stopWorker(): void {
        this.running = false;
        log.info("Queue worker stopped");
    }

    isWorkerRunning(): boolean {
        return this.running;
    }

    private async runLoop(concurrency: number): Promise<void> {
        let activeTasks = 0;
        
        while (this.running) {
            if (activeTasks >= concurrency) {
                await new Promise((r) => setTimeout(r, 100));
                continue;
            }

            let claimedTask: BackgroundTask | null = null;
            
            try {
                claimedTask = await this.claimNext();
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                log.error("Worker loop claim error", msg);
            }

            if (claimedTask && this.workerFn) {
                activeTasks++;
                const task = claimedTask;
                
                // Run task in background without blocking the polling loop
                Promise.resolve().then(async () => {
                    try {
                        await this.workerFn!(task);
                        // Task completed successfully - workerFn is responsible for calling markSucceeded
                    } catch (workerErr) {
                        const errMsg = workerErr instanceof Error ? workerErr.message : String(workerErr);
                        log.error(`Worker function failed for task ${task.id}: ${errMsg}`);
                        storage.failTask(task.id, `Worker error: ${errMsg}`);
                        log.warn(`Task ${task.id} marked as failed due to worker exception`);
                    } finally {
                        activeTasks--;
                    }
                });
            } else {
                // If no task was claimed or an error occurred, wait before polling again
                await new Promise((r) => setTimeout(r, 250));
            }
        }
    }
}
