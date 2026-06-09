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

    isWorkerRunning(): boolean {
        return this.running;
    }

    private async runLoop(): Promise<void> {
        while (this.running) {
            let claimedTask: BackgroundTask | null = null;
            
            try {
                claimedTask = await this.claimNext();
                
                if (claimedTask && this.workerFn) {
                    try {
                        await this.workerFn(claimedTask);
                        // Task completed successfully - workerFn is responsible for calling markSucceeded
                    } catch (workerErr) {
                        // Worker function threw - task is still in "processing" state
                        // Must mark it as failed to prevent orphan state
                        const errMsg = workerErr instanceof Error ? workerErr.message : String(workerErr);
                        log.error(`Worker function failed for task ${claimedTask.id}: ${errMsg}`);
                        
                        // Mark task as failed - this is critical for data integrity
                        // Without this, task would stay in "processing" forever
                        storage.failTask(claimedTask.id, `Worker error: ${errMsg}`);
                        
                        log.warn(`Task ${claimedTask.id} marked as failed due to worker exception`);
                    }
                }
            } catch (err) {
                // Claim or other storage operation failed
                const msg = err instanceof Error ? err.message : String(err);
                log.error("Worker loop error", msg);
                
                // If we had claimed a task but failed, ensure it's not orphaned
                if (claimedTask) {
                    try {
                        storage.failTask(claimedTask.id, `Worker loop error: ${msg}`);
                    } catch {
                        // Storage might be down - can't do much here
                    }
                }
            }

            await new Promise((r) => setTimeout(r, 250));
        }
    }
}
