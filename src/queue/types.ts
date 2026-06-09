export type TaskStatus = "queued" | "processing" | "completed" | "failed" | "pending_approval";
export type TaskSource = "agent" | "mesh" | "scheduler";

export interface QueuedTaskPayload {
    taskId: string;
    sessionId: string;
    runId: string;
    toolName: string;
    input: Record<string, unknown>;
    source: TaskSource;
    maxRetries: number;
    userId: string | undefined;
    platform: string | undefined;
    groupId: string | undefined;
    isGroup: boolean;
    workflowId: string | undefined;
    workflowTaskId: string | undefined;
    _trace?: Record<string, string>;
    /** Unique key for idempotency - prevents duplicate job execution */
    idempotencyKey?: string;
}

export interface BackgroundTask {
    id: string;
    sessionId: string;
    runId: string;
    source: TaskSource;
    toolName: string;
    input: Record<string, unknown>;
    userId: string | undefined;
    platform: string | undefined;
    groupId: string | undefined;
    isGroup: boolean;
    attempt: number;
    maxRetries: number;
    status: TaskStatus;
    resultJson: string | undefined;
    error: string | undefined;
    workflowId: string | undefined;
    workflowTaskId: string | undefined;
    availableAt: string;
    createdAt: string;
    updatedAt: string;
}

export interface QueueOptions {
    concurrency?: number;
    maxRetries?: number;
    retryDelay?: number;
}

export interface TaskQueue {
    enqueueToolTask(payload: QueuedTaskPayload): Promise<BackgroundTask>;
    enqueueAgentTask(payload: {
        sessionId: string;
        runId: string;
        message: string;
        source: TaskSource;
    }): Promise<BackgroundTask>;
    claimNext(sessionId?: string): Promise<BackgroundTask | null>;
    markSucceeded(taskId: string, result: unknown): Promise<void>;
    markFailed(taskId: string, error: string): Promise<void>;
    retry(taskId: string, delayMs: number): Promise<void>;
    reschedule(taskId: string, delayMs: number): Promise<void>;
    getTask(taskId: string): Promise<BackgroundTask | null>;
    getPendingTasks(sessionId?: string): Promise<BackgroundTask[]>;
    updateStatus(taskId: string, status: TaskStatus): Promise<void>;
    startWorker?(workerFn: (task: BackgroundTask) => Promise<void>, concurrency?: number): void;
    stopWorker?(): void;
    isWorkerRunning?(): boolean;
}
