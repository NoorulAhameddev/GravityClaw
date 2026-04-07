/**
 * Telemetry Tracer Helpers
 * 
 * Manual span creation for:
 * - API Layer (api.request)
 * - Agent Execution (agent.run)
 * - Tool Execution (tool.execute)
 * - LLM Calls (llm.call)
 * - Worker Jobs (worker.job)
 */

import {
    trace,
    SpanKind,
    SpanStatusCode,
    context,
    type SpanStatus,
    type ContextAPI,
    type Context,
} from "@opentelemetry/api";
import { createLogger } from "../../logger.js";

const log = createLogger("tracer");

const tracer = trace.getTracer("gravyclaw", "0.1.0");

export interface SpanAttributes {
    [key: string]: string | number | boolean | undefined;
}

export interface TraceContext {
    traceId?: string;
    spanId?: string;
    sessionId?: string;
    userId?: string;
    taskType?: string;
    toolName?: string;
    provider?: string;
    model?: string;
}

export function createSpan(
    name: string,
    attributes: SpanAttributes = {},
    kind: SpanKind = SpanKind.INTERNAL,
    ctx?: TraceContext
) {
    const span = tracer.startSpan(name, {
        kind,
        attributes: {
            service: "gravyclaw",
            ...attributes,
            ...(ctx?.sessionId && { session_id: ctx.sessionId }),
            ...(ctx?.userId && { user_id: ctx.userId }),
            ...(ctx?.taskType && { task_type: ctx.taskType }),
            ...(ctx?.toolName && { tool_name: ctx.toolName }),
            ...(ctx?.provider && { provider: ctx.provider }),
            ...(ctx?.model && { model: ctx.model }),
        },
    });
    return span;
}

export function withSpan<T>(
    name: string,
    fn: (span: typeof tracer) => T,
    attributes: SpanAttributes = {},
    kind: SpanKind = SpanKind.INTERNAL
): T {
    return tracer.startActiveSpan(name, { kind, attributes }, (span) => {
        try {
            const result = fn(tracer);
            span.setStatus({ code: SpanStatusCode.OK });
            return result;
        } catch (error) {
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error instanceof Error ? error.message : String(error),
            });
            span.recordException(error as Error);
            throw error;
        } finally {
            span.end();
        }
    });
}

export async function withSpanAsync<T>(
    name: string,
    fn: (span: ReturnType<typeof tracer.startSpan>) => Promise<T>,
    attributes: SpanAttributes = {},
    kind: SpanKind = SpanKind.INTERNAL
): Promise<T> {
    return tracer.startActiveSpan(name, { kind, attributes }, async (span) => {
        try {
            const result = await fn(span);
            span.setStatus({ code: SpanStatusCode.OK });
            return result;
        } catch (error) {
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error instanceof Error ? error.message : String(error),
            });
            span.recordException(error as Error);
            throw error;
        } finally {
            span.end();
        }
    });
}

export function endSpanSuccess(span: ReturnType<typeof tracer.startSpan>, attributes?: SpanAttributes): void {
    if (attributes) {
        span.setAttributes(attributes);
    }
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
}

export function endSpanError(
    span: ReturnType<typeof tracer.startSpan>,
    error: Error,
    attributes?: SpanAttributes
): void {
    if (attributes) {
        span.setAttributes(attributes);
    }
    span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
    });
    span.recordException(error);
    span.end();
}

export function setSpanAttribute(span: ReturnType<typeof tracer.startSpan>, key: string, value: string | number | boolean): void {
    span.setAttribute(key, value);
}

export function addSpanEvent(span: ReturnType<typeof tracer.startSpan>, name: string, attributes?: SpanAttributes): void {
    span.addEvent(name, attributes);
}

export function injectTraceContext(): Record<string, string> {
    const span = tracer.startSpan("context-propagation");
    
    return {
        traceparent: `00-${span.spanContext().traceId}-${span.spanContext().spanId}-01`,
    };
}

export function extractTraceContext(headers: Record<string, string>): Context | undefined {
    const traceparent = headers.traceparent || headers["x-traceparent"];
    if (!traceparent) return undefined;
    
    try {
        const parts = traceparent.split("-");
        if (parts.length < 3) return undefined;
        
        const traceId = parts[1];
        const spanId = parts[2];
        
        const span = {
            spanContext: () => ({ traceId, spanId, traceFlags: 1 }),
            isRemote: true,
        } as unknown as { spanContext: () => { traceId: string; spanId: string; traceFlags: number }; isRemote: boolean };
        
        return trace.setSpan(context.active(), span as any);
    } catch {
        return undefined;
    }
}

export { tracer, SpanKind, SpanStatusCode };