/**
 * Structured Logger with Trace Context
 * 
 * JSON format logging with:
 * - timestamp
 * - level
 * - message
 * - context
 * - trace_id
 * - span_id
 */

import { context, trace, type SpanContext } from "@opentelemetry/api";
import { createLogger as createBaseLogger, type Logger } from "../../logger.js";

const tracer = trace.getTracer("gravyclaw");

export interface LogContext {
    [key: string]: string | number | boolean | undefined;
}

export interface StructuredLogEntry {
    timestamp: string;
    level: string;
    message: string;
    trace_id?: string;
    span_id?: string;
    context?: LogContext;
}

export class StructuredLogger {
    private logger: Logger;
    private service: string;

    constructor(service: string) {
        this.service = service;
        this.logger = createBaseLogger(service);
    }

    private getTraceContext(): { traceId?: string; spanId?: string } {
        const span = trace.getSpan(context.active());
        
        if (!span) {
            return {};
        }
        
        const spanContext = span.spanContext();
        
        return {
            traceId: spanContext.traceId,
            spanId: spanContext.spanId,
        };
    }

    private formatMessage(level: string, message: string, ctx?: LogContext): string {
        const entry: StructuredLogEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            ...this.getTraceContext(),
            ...(ctx ? { context: ctx } : {}),
        };
        
        return JSON.stringify(entry);
    }

    debug(message: string, ctx?: LogContext): void {
        this.logger.debug(this.formatMessage("DEBUG", message, ctx));
    }

    info(message: string, ctx?: LogContext): void {
        this.logger.info(this.formatMessage("INFO", message, ctx));
    }

    warn(message: string, ctx?: LogContext): void {
        this.logger.warn(this.formatMessage("WARN", message, ctx));
    }

    error(message: string, ctx?: LogContext): void {
        this.logger.error(this.formatMessage("ERROR", message, ctx));
    }

    errorWithStack(message: string, error: Error, ctx?: LogContext): void {
        this.logger.error(
            this.formatMessage("ERROR", message, {
                ...ctx,
                error_message: error.message,
                error_stack: error.stack,
                error_name: error.name,
            })
        );
    }
}

export function createStructuredLogger(service: string): StructuredLogger {
    return new StructuredLogger(service);
}

export const telemetryLogger = createStructuredLogger("telemetry");

export function logWithTrace(span: ReturnType<typeof tracer.startSpan>, level: string, message: string, ctx?: LogContext): void {
    const logger = createBaseLogger("telemetry");
    const entry: StructuredLogEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        trace_id: span.spanContext().traceId,
        span_id: span.spanContext().spanId,
    };
    
    if (ctx) {
        entry.context = ctx;
    }
    
    switch (level) {
        case "DEBUG":
            logger.debug(JSON.stringify(entry));
            break;
        case "INFO":
            logger.info(JSON.stringify(entry));
            break;
        case "WARN":
            logger.warn(JSON.stringify(entry));
            break;
        case "ERROR":
            logger.error(JSON.stringify(entry));
            break;
        default:
            logger.info(JSON.stringify(entry));
    }
}