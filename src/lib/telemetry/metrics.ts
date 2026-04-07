/**
 * Telemetry Metrics
 * 
 * OpenTelemetry Meter for collecting:
 * - api_requests_total (counter)
 * - api_errors_total (counter)
 * - api_latency (histogram)
 * - agent_runs_total
 * - agent_failures_total
 * - tool_calls_total
 * - tool_failures_total
 * - llm_calls_total
 * - llm_latency
 * - worker_jobs_total
 * - worker_failures_total
 */

import { metrics } from "@opentelemetry/api";
import { createLogger } from "../../logger.js";

const log = createLogger("metrics");

const meter = metrics.getMeter("gravyclaw", "0.1.0");

const counters = new Map<string, ReturnType<typeof meter.createCounter>>();
const histograms = new Map<string, ReturnType<typeof meter.createHistogram>>();

export function getOrCreateCounter(name: string, description?: string, unit?: string): ReturnType<typeof meter.createCounter> {
    if (counters.has(name)) {
        return counters.get(name)!;
    }
    
    const counter = meter.createCounter(name, {
        description: description ?? name,
        unit: unit ?? "1",
    });
    
    counters.set(name, counter);
    return counter;
}

export function getOrCreateHistogram(
    name: string,
    description?: string,
    unit?: string
): ReturnType<typeof meter.createHistogram> {
    if (histograms.has(name)) {
        return histograms.get(name)!;
    }
    
    const histogram = meter.createHistogram(name, {
        description: description ?? name,
        unit: unit ?? "ms",
    });
    
    histograms.set(name, histogram);
    return histogram;
}

export const apiRequestsCounter = getOrCreateCounter(
    "api_requests_total",
    "Total API requests",
    "1"
);

export const apiErrorsCounter = getOrCreateCounter(
    "api_errors_total",
    "Total API errors",
    "1"
);

export const apiLatencyHistogram = getOrCreateHistogram(
    "api_latency",
    "API request latency in milliseconds",
    "ms"
);

export const agentRunsCounter = getOrCreateCounter(
    "agent_runs_total",
    "Total agent runs",
    "1"
);

export const agentFailuresCounter = getOrCreateCounter(
    "agent_failures_total",
    "Total agent failures",
    "1"
);

export const toolCallsCounter = getOrCreateCounter(
    "tool_calls_total",
    "Total tool calls",
    "1"
);

export const toolFailuresCounter = getOrCreateCounter(
    "tool_failures_total",
    "Total tool failures",
    "1"
);

export const llmCallsCounter = getOrCreateCounter(
    "llm_calls_total",
    "Total LLM API calls",
    "1"
);

export const llmLatencyHistogram = getOrCreateHistogram(
    "llm_latency",
    "LLM API call latency",
    "ms"
);

export const workerJobsCounter = getOrCreateCounter(
    "worker_jobs_total",
    "Total worker jobs processed",
    "1"
);

export const workerFailuresCounter = getOrCreateCounter(
    "worker_failures_total",
    "Total worker job failures",
    "1"
);

export function recordApiRequest(route: string, method: string): void {
    apiRequestsCounter.add(1, { route, method });
}

export function recordApiError(route: string, method: string, errorType: string): void {
    apiErrorsCounter.add(1, { route, method, error_type: errorType });
}

export function recordApiLatency(route: string, method: string, latencyMs: number): void {
    apiLatencyHistogram.record(latencyMs, { route, method });
}

export function recordAgentRun(success: boolean, taskType?: string): void {
    agentRunsCounter.add(1, { task_type: taskType ?? "default" });
    if (!success) {
        agentFailuresCounter.add(1, { task_type: taskType ?? "default" });
    }
}

export function recordToolCall(toolName: string, success: boolean): void {
    toolCallsCounter.add(1, { tool_name: toolName });
    if (!success) {
        toolFailuresCounter.add(1, { tool_name: toolName });
    }
}

export function recordLlmCall(
    provider: string,
    model: string,
    latencyMs: number,
    tokens?: { prompt?: number; completion?: number }
): void {
    llmCallsCounter.add(1, { provider, model });
    llmLatencyHistogram.record(latencyMs, { provider, model });
    
    if (tokens) {
        meter.createCounter("llm_tokens_total", { description: "Total LLM tokens" }).add(
            (tokens.prompt ?? 0) + (tokens.completion ?? 0),
            { provider, model, token_type: "total" }
        );
    }
}

export function recordWorkerJob(queueName: string, jobName: string, success: boolean, delayMs?: number): void {
    workerJobsCounter.add(1, { queue_name: queueName, job_name: jobName });
    if (!success) {
        workerFailuresCounter.add(1, { queue_name: queueName, job_name: jobName });
    }
    if (delayMs !== undefined) {
        meter.createHistogram("worker_job_delay", { description: "Worker job queue delay" }).record(delayMs, {
            queue_name: queueName,
            job_name: jobName,
        });
    }
}

export { meter };