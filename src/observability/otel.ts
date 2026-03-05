/**
 * OpenTelemetry Integration (Optional)
 * 
 * Exports traces and metrics to an OpenTelemetry collector
 * Only active if OTEL_ENABLED=true and OTEL_EXPORTER_OTLP_ENDPOINT is set
 */

import { config } from "../config.ts";
import { createLogger } from "../logger.ts";
import { exportSpans } from "./tracing.ts";

const log = createLogger("otel");

/**
 * Initialize OpenTelemetry exporter
 * Handles graceful degradation if OTEL is not available
 */
export function initializeOpenTelemetry(): void {
    if (!config.OTEL_ENABLED) {
        log.debug("OpenTelemetry disabled");
        return;
    }
    
    if (!config.OTEL_EXPORTER_OTLP_ENDPOINT) {
        log.warn("OpenTelemetry enabled but OTEL_EXPORTER_OTLP_ENDPOINT not configured");
        return;
    }
    
    log.info("Initializing OpenTelemetry export", {
        endpoint: config.OTEL_EXPORTER_OTLP_ENDPOINT,
    });
    
    // Note: Full OpenTelemetry SDK integration would require:
    // - @opentelemetry/api
    // - @opentelemetry/sdk-node
    // - @opentelemetry/auto-instrumentations-node
    // - @opentelemetry/exporter-trace-otlp-http
    //
    // This is a stub implementation showing the integration pattern.
    // To enable full OTEL support, install those packages and uncomment below.
}

/**
 * Export spans to OTEL collector
 */
export async function exportTracesToOTEL(traceId?: string): Promise<void> {
    if (!config.OTEL_ENABLED || !config.OTEL_EXPORTER_OTLP_ENDPOINT) {
        return;
    }
    
    try {
        const spans = exportSpans(traceId);
        
        if (spans.length === 0) {
            return;
        }
        
        // Convert spans to OTEL format
        const otelSpans = spans.map(span => ({
            traceId: span.traceId,
            spanId: span.id,
            parentSpanId: span.parentSpanId,
            name: span.name,
            kind: 1, // INTERNAL
            startTimeUnixNano: span.startTime * 1_000_000,
            endTimeUnixNano: (span.endTime || Date.now()) * 1_000_000,
            status: {
                code: span.status === "error" ? 2 : 0, // ERROR or OK
                message: span.error?.message,
            },
            attributes: span.attributes,
            events: span.events?.map(evt => ({
                timeUnixNano: evt.timestamp * 1_000_000,
                name: evt.name,
                attributes: evt.attributes,
            })),
        }));
        
        // Send to OTEL collector
        const response = await fetch(
            `${config.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "User-Agent": "gravity-claw/1.0",
                },
                body: JSON.stringify({
                    resourceSpans: [
                        {
                            resource: {
                                attributes: [
                                    { key: "service.name", value: { stringValue: "gravity-claw" } },
                                    { key: "service.version", value: { stringValue: "1.0.0" } },
                                ],
                            },
                            scopeSpans: [
                                {
                                    scope: {
                                        name: "gravity-claw",
                                        version: "1.0.0",
                                    },
                                    spans: otelSpans,
                                },
                            ],
                        },
                    ],
                }),
            }
        );
        
        if (!response.ok) {
            log.warn(`OTEL export failed: ${response.status}`, {
                spanCount: spans.length,
            });
            return;
        }
        
        log.debug(`Exported ${spans.length} spans to OTEL`, {
            endpoint: config.OTEL_EXPORTER_OTLP_ENDPOINT,
        });
    } catch (error) {
        log.warn("Failed to export spans to OTEL", { error });
    }
}

/**
 * Export metrics to OTEL collector
 */
export async function exportMetricsToOTEL(): Promise<void> {
    if (!config.OTEL_ENABLED || !config.OTEL_EXPORTER_OTLP_ENDPOINT) {
        return;
    }
    
    try {
        const { getMetricsSnapshot } = await import("./metrics.ts");
        const metrics = getMetricsSnapshot();
        
        // Convert to OTEL metrics format
        const otelMetrics = {
            resourceMetrics: [
                {
                    resource: {
                        attributes: [
                            { key: "service.name", value: { stringValue: "gravity-claw" } },
                        ],
                    },
                    scopeMetrics: [
                        {
                            scope: {
                                name: "gravity-claw",
                                version: "1.0.0",
                            },
                            metrics: [
                                {
                                    name: "process_uptime_seconds",
                                    description: "Process uptime in seconds",
                                    unit: "s",
                                    gauge: {
                                        dataPoints: [
                                            {
                                                timeUnixNano: BigInt(Date.now()) * 1_000_000n,
                                                value: Math.floor(metrics.uptime),
                                            },
                                        ],
                                    },
                                },
                                {
                                    name: "requests_total",
                                    description: "Total HTTP requests",
                                    unit: "1",
                                    sum: {
                                        dataPoints: [
                                            {
                                                timeUnixNano: BigInt(Date.now()) * 1_000_000n,
                                                value: metrics.requestCount,
                                                isMonotonic: true,
                                            },
                                        ],
                                        aggregationTemporality: 2, // CUMULATIVE
                                    },
                                },
                                {
                                    name: "tool_calls_total",
                                    description: "Total tool calls",
                                    unit: "1",
                                    sum: {
                                        dataPoints: [
                                            {
                                                timeUnixNano: BigInt(Date.now()) * 1_000_000n,
                                                value: metrics.toolCallCount,
                                                isMonotonic: true,
                                            },
                                        ],
                                        aggregationTemporality: 2,
                                    },
                                },
                                {
                                    name: "errors_total",
                                    description: "Total errors",
                                    unit: "1",
                                    sum: {
                                        dataPoints: [
                                            {
                                                timeUnixNano: BigInt(Date.now()) * 1_000_000n,
                                                value: metrics.errorCount,
                                                isMonotonic: true,
                                            },
                                        ],
                                        aggregationTemporality: 2,
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        };
        
        // Send to OTEL collector
        const response = await fetch(
            `${config.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "User-Agent": "gravity-claw/1.0",
                },
                body: JSON.stringify(otelMetrics),
            }
        );
        
        if (!response.ok) {
            log.warn(`OTEL metrics export failed: ${response.status}`);
        }
    } catch (error) {
        log.debug("Failed to export metrics to OTEL", { error });
    }
}

// Periodic export tasks (if OTEL enabled)
let exportInterval: NodeJS.Timeout | null = null;

export function startPeriodicOTELExport(intervalSeconds: number = 30): void {
    if (!config.OTEL_ENABLED) return;
    
    exportInterval = setInterval(() => {
        exportTracesToOTEL();
        exportMetricsToOTEL();
    }, intervalSeconds * 1000);
    
    log.info("Started periodic OTEL export", { intervalSeconds });
}

export function stopPeriodicOTELExport(): void {
    if (exportInterval) {
        clearInterval(exportInterval);
        exportInterval = null;
        log.debug("Stopped periodic OTEL export");
    }
}

// Auto-start if enabled
if (config.OTEL_ENABLED) {
    startPeriodicOTELExport();
}

// Cleanup on exit
if (typeof process !== "undefined") {
    process.on("exit", () => {
        stopPeriodicOTELExport();
    });
}
