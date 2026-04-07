/**
 * Telemetry Module Index
 * 
 * Exports:
 * - initializeTelemetry, shutdownTelemetry, isTelemetryEnabled
 * - tracer helpers
 * - metrics helpers
 * - structured logger
 * - middleware/wrappers for API, Agent, Tool, LLM, Worker
 */

export * from "./telemetry.js";
export * from "./tracer.js";
export * from "./metrics.js";
export * from "./logger.js";
export * from "./middleware.js";

import {
    withSpan,
    withSpanAsync,
    createSpan,
    endSpanSuccess,
    endSpanError,
    setSpanAttribute,
    addSpanEvent,
    SpanKind,
    tracer,
} from "./tracer.js";

import {
    recordApiRequest,
    recordApiError,
    recordApiLatency,
    recordAgentRun,
    recordToolCall,
    recordLlmCall,
    recordWorkerJob,
    meter,
} from "./metrics.js";

export {
    tracer,
    withSpan,
    withSpanAsync,
    createSpan,
    endSpanSuccess,
    endSpanError,
    setSpanAttribute,
    addSpanEvent,
    SpanKind,
    recordApiRequest,
    recordApiError,
    recordApiLatency,
    recordAgentRun,
    recordToolCall,
    recordLlmCall,
    recordWorkerJob,
    meter,
};

export type { TraceContext, SpanAttributes } from "./tracer.js";

import type { Span } from "@opentelemetry/api";

export function traceApi(
    route: string,
    method: string
): <T>(fn: () => T) => T {
    return <T>(fn: () => T) => {
        return withSpan(
            "api.request",
            () => fn(),
            { route, method },
            SpanKind.SERVER
        );
    };
}

export function traceAgent(
    taskType: string,
    sessionId?: string
): <T>(fn: () => T) => T {
    return <T>(fn: () => T) => {
        return withSpan(
            "agent.run",
            () => fn(),
            { task_type: taskType, session_id: sessionId ?? "" },
            SpanKind.INTERNAL
        );
    };
}

export function traceTool(
    toolName: string
): <T>(fn: () => T) => T {
    return <T>(fn: () => T) => {
        return withSpan(
            "tool.execute",
            () => fn(),
            { tool_name: toolName },
            SpanKind.INTERNAL
        );
    };
}

export function traceLLM(
    provider: string,
    model: string
): <T>(fn: () => T) => T {
    return <T>(fn: () => T) => {
        return withSpan(
            "llm.call",
            () => fn(),
            { provider, model },
            SpanKind.CLIENT
        );
    };
}

export function traceWorker(
    queueName: string,
    jobName: string
): <T>(fn: () => T) => T {
    return <T>(fn: () => T) => {
        return withSpan(
            "worker.job",
            () => fn(),
            { queue_name: queueName, job_name: jobName },
            SpanKind.CONSUMER
        );
    };
}