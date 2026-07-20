import { createLogger } from "../logger.ts";
import { getTaskQueue, isRetryableError, computeBackoff } from "./index.ts";
import { runAgent } from "../agent.ts";
import { telemetryLogger } from "../lib/telemetry/logger.js";
import { withSpanAsync } from "../lib/telemetry/tracer.js";
import { recordWorkerJob } from "../lib/telemetry/metrics.js";
import { context } from "@opentelemetry/api";
import type { BackgroundTask } from "./types.ts";
import type { AgentDependencies } from "../agent.ts";

const log = createLogger("queue:worker");

export function startBackgroundWorker(dependencies: AgentDependencies) {
    const queue = getTaskQueue();
    if (!queue.startWorker) {
        log.warn("Queue backend does not support startWorker");
        return;
    }

    queue.startWorker(async (task: BackgroundTask) => {
        return await context.with(context.active(), async () => {
            return await withSpanAsync("worker.job", async (span) => {
                span.setAttribute("job.id", task.id);
                span.setAttribute("job.tool", task.toolName);

                try {
                    telemetryLogger.info("worker started", { job_id: task.id, tool: task.toolName });
                    log.info(`Processing queued task: ${task.id} - ${task.toolName}`);
                    
                    let result: unknown;
                    
                    if (task.toolName === "__run_agent") {
                        const message = String(task.input["message"] ?? "");
                        if (!message.trim()) {
                            throw new Error("Queued agent task missing message");
                        }
                        result = await runAgent({
                            message,
                            sessionId: task.sessionId,
                            userId: task.userId,
                            platform: task.platform,
                            groupId: task.groupId,
                            isGroup: task.isGroup,
                            dependencies,
                        });
                    } else {
                        if (!dependencies.toolExecutor) {
                            throw new Error("Tool executor missing in dependencies");
                        }
                        const execution = await dependencies.toolExecutor.execute({
                            toolName: task.toolName,
                            input: task.input,
                            context: {
                                sessionId: task.sessionId,
                                userId: task.userId,
                                platform: task.platform,
                                groupId: task.groupId,
                                isGroup: task.isGroup,
                                source: "queue",
                            },
                        });
                        
                        if (!execution.success) {
                            throw new Error(`${execution.error?.type ?? "execution"}: ${execution.error?.message ?? "Tool execution failed"}`);
                        }
                        result = execution.result;
                    }
                    
                    await queue.markSucceeded(task.id, result);
                    span.setAttribute("job.success", true);
                    recordWorkerJob("default", task.toolName, true);
                } catch (err) {
                    span.setAttribute("job.success", false);
                    span.recordException(err as Error);
                    const message = err instanceof Error ? err.message : String(err);
                    if (task.attempt < task.maxRetries && isRetryableError(err)) {
                        const delay = computeBackoff(task.attempt);
                        await queue.retry(task.id, delay);
                        telemetryLogger.warn("worker retry scheduled", { job_id: task.id, delay_ms: delay, error: message });
                    } else {
                        await queue.markFailed(task.id, message);
                        telemetryLogger.error("worker failed", { job_id: task.id, error: message });
                    }
                    recordWorkerJob("default", task.toolName, false);
                    throw err; // Re-throw so backend knows it failed
                }
            });
        });
    });
}
