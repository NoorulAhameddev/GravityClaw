/**
 * Telemetry Middleware
 * 
 * Express middleware for API request tracing
 */

import { type Request, type Response, type NextFunction } from "express";
import { trace, SpanKind as OTelSpanKind, propagation, defaultTextMapGetter, context } from "@opentelemetry/api";
import { recordApiRequest, recordApiError, recordApiLatency } from "./metrics.js";

const tracer = trace.getTracer("gravyclaw", "0.1.0");

export function createTelemetryMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
        const startTime = Date.now();
        const route = req.route?.path || req.path || "unknown";
        const method = req.method;
        
        // Extract trace context from incoming request (traceparent header)
        const extractedContext = propagation.extract(context.active(), req.headers as any, defaultTextMapGetter);
        
        // Start span with extracted context
        const span = tracer.startSpan(`api.request.${method.toLowerCase()}`, {
            kind: OTelSpanKind.SERVER,
            attributes: {
                "http.method": method,
                "http.url": req.url,
                "http.route": route,
                "http.scheme": "http",
                "http.host": req.headers.host || "",
                "user_agent.original": req.headers["user-agent"] || "",
                "session_id": req.headers["x-session-id"] as string || "",
                "user_id": req.headers["x-user-id"] as string || "",
            },
        }, extractedContext);
        
        // Record API request metric
        recordApiRequest(route, method);
        
        // Wrap response to record metrics and end span
        const originalSend = res.send.bind(res);
        res.send = function(body: unknown) {
            const latency = Date.now() - startTime;
            
            // Record latency metric
            recordApiLatency(route, method, latency);
            
            span.setAttribute("http.status_code", res.statusCode);
            
            if (res.statusCode >= 400) {
                const errorType = res.statusCode >= 500 ? `http_${res.statusCode}` : `http_${res.statusCode}`;
                recordApiError(route, method, errorType);
                span.setStatus({
                    code: 1,
                    message: `HTTP ${res.statusCode}`,
                });
            } else {
                span.setStatus({ code: 0 });
            }
            
            span.end();
            return originalSend(body);
        };
        
        // End span on response finish
        res.on("finish", () => {
            span.end();
        });
        
        next();
    };
}