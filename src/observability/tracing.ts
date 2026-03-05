import { createLogger } from "../logger.ts";
import { getCurrentCorrelationId } from "./correlation.ts";
import { recordHistogram } from "./metrics.ts";

const log = createLogger("tracing");

/**
 * Distributed tracing module for tracking function execution and lifecycle
 */

export interface Span {
    id: string;
    traceId: string;
    parentSpanId?: string | undefined;
    name: string;
    startTime: number;
    endTime?: number | undefined;
    duration?: number | undefined;
    status: "running" | "success" | "error";
    error?: {
        message: string;
        code?: string | undefined;
    } | undefined;
    attributes?: Record<string, unknown> | undefined;
    events?: Array<{
        timestamp: number;
        name: string;
        attributes?: Record<string, unknown> | undefined;
    }> | undefined;
}

const spans = new Map<string, Span>();
const spanStack: string[] = [];

/**
 * Generate unique span ID
 */
function generateSpanId(): string {
    return `span-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Start a new span
 */
export function startSpan(
    name: string,
    attributes?: Record<string, unknown>
): Span {
    const spanId = generateSpanId();
    const traceId = getCurrentCorrelationId() || `trace-${Date.now()}`;
    const parentSpanId = spanStack[spanStack.length - 1];
    
    const span: Span = {
        id: spanId,
        traceId,
        parentSpanId,
        name,
        startTime: Date.now(),
        status: "running",
        attributes,
        events: [],
    };
    
    spans.set(spanId, span);
    spanStack.push(spanId);
    
    log.debug(`Span started: ${name}`, {
        spanId,
        traceId,
        parentSpanId,
    });
    
    return span;
}

/**
 * End current span with success
 */
export function endSpan(span?: Span): Span | undefined {
    const spanId = span?.id || spanStack.pop();
    if (!spanId) return undefined;
    
    const current = spans.get(spanId);
    if (!current) return undefined;
    
    current.endTime = Date.now();
    current.duration = current.endTime - current.startTime;
    current.status = "success";
    
    // Record metrics for this span
    recordHistogram(`span_duration_ms`, current.duration, {
        spanName: current.name,
    });
    
    log.debug(`Span ended: ${current.name}`, {
        spanId,
        duration: current.duration,
    });
    
    return current;
}

/**
 * End span with error
 */
export function endSpanWithError(error: Error, message?: string, span?: Span): Span | undefined {
    const spanId = span?.id || spanStack.pop();
    if (!spanId) return undefined;
    
    const current = spans.get(spanId);
    if (!current) return undefined;
    
    current.endTime = Date.now();
    current.duration = current.endTime - current.startTime;
    current.status = "error";
    current.error = {
        message: error.message,
        code: (error as any).code,
    };
    
    log.error(`Span error: ${current.name}`, error, {
        spanId,
        duration: current.duration,
    });
    
    return current;
}

/**
 * Add event to current span
 */
export function addSpanEvent(name: string, attributes?: Record<string, unknown>): void {
    const spanId = spanStack[spanStack.length - 1];
    if (!spanId) return;
    
    const span = spans.get(spanId);
    if (span && span.events) {
        span.events.push({
            timestamp: Date.now(),
            name,
            attributes,
        });
    }
}

/**
 * Add attributes to current span
 */
export function addSpanAttribute(key: string, value: unknown): void {
    const spanId = spanStack[spanStack.length - 1];
    if (!spanId) return;
    
    const span = spans.get(spanId);
    if (span) {
        if (!span.attributes) span.attributes = {};
        span.attributes[key] = value;
    }
}

/**
 * Decorator for tracing synchronous functions
 */
export function trace<T extends (...args: any[]) => any>(
    name: string
): (target: T) => T {
    return (fn: T) => {
        return ((...args: any[]) => {
            const span = startSpan(name, { args: args.length });
            try {
                const result = fn(...args);
                endSpan(span);
                return result;
            } catch (error) {
                endSpanWithError(error as Error, undefined, span);
                throw error;
            }
        }) as T;
    };
}

/**
 * Decorator for tracing async functions
 */
export function traceAsync<T extends (...args: any[]) => Promise<any>>(
    name: string
): (target: T) => T {
    return (fn: T) => {
        return (async (...args: any[]) => {
            const span = startSpan(name, { args: args.length });
            try {
                const result = await fn(...args);
                endSpan(span);
                return result;
            } catch (error) {
                endSpanWithError(error as Error, undefined, span);
                throw error;
            }
        }) as T;
    };
}

/**
 * Wrap a function with tracing
 */
export function withTracing<T extends (...args: any[]) => any>(
    fn: T,
    name: string
): T {
    return ((...args: any[]) => {
        const span = startSpan(name, { args: args.length });
        try {
            const result = fn(...args);
            endSpan(span);
            return result;
        } catch (error) {
            endSpanWithError(error as Error, undefined, span);
            throw error;
        }
    }) as T;
}

/**
 * Wrap an async function with tracing
 */
export function withTracingAsync<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    name: string
): T {
    return (async (...args: any[]) => {
        const span = startSpan(name, { args: args.length });
        try {
            const result = await fn(...args);
            endSpan(span);
            return result;
        } catch (error) {
            endSpanWithError(error as Error, undefined, span);
            throw error;
        }
    }) as T;
}

/**
 * Get span by ID
 */
export function getSpan(spanId: string): Span | undefined {
    return spans.get(spanId);
}

/**
 * Get current span
 */
export function getCurrentSpan(): Span | undefined {
    const spanId = spanStack[spanStack.length - 1];
    return spanId ? spans.get(spanId) : undefined;
}

/**
 * Get all spans for a trace
 */
export function getTraceSpans(traceId: string): Span[] {
    return Array.from(spans.values()).filter(s => s.traceId === traceId);
}

/**
 * Export spans as JSON
 */
export function exportSpans(traceId?: string): Span[] {
    if (traceId) {
        return getTraceSpans(traceId);
    }
    return Array.from(spans.values());
}

/**
 * Clear old spans (keep only last 1000)
 */
export function cleanupSpans(): void {
    if (spans.size > 1000) {
        const entries = Array.from(spans.entries())
            .sort((a, b) => a[1].startTime - b[1].startTime)
            .slice(0, spans.size - 500);
        
        spans.clear();
        entries.forEach(([id, span]) => spans.set(id, span));
    }
}

/**
 * Measure function execution time
 */
export async function measureAsync<T>(
    fn: () => Promise<T>,
    name: string
): Promise<{ result: T; duration: number }> {
    const span = startSpan(name);
    try {
        const result = await fn();
        const duration = endSpan(span)?.duration || 0;
        return { result, duration };
    } catch (error) {
        endSpanWithError(error as Error, undefined, span);
        throw error;
    }
}

/**
 * Measure synchronous function execution time
 */
export function measureSync<T>(
    fn: () => T,
    name: string
): { result: T; duration: number } {
    const span = startSpan(name);
    try {
        const result = fn();
        const duration = endSpan(span)?.duration || 0;
        return { result, duration };
    } catch (error) {
        endSpanWithError(error as Error, undefined, span);
        throw error;
    }
}

// Cleanup on exit
if (typeof process !== "undefined") {
    process.on("exit", () => {
        cleanupSpans();
    });
}
