/**
 * Metrics Tool
 * Allows agents to retrieve current system metrics
 */

import { createLogger } from "../../logger.ts";
import { getMetricsSnapshot, getGauge, getCounter, getAverage } from "../../observability/metrics.ts";

const log = createLogger("metrics-tool");

export const MetricsTool = {
    name: "get_metrics",
    description: "Get current system metrics including uptime, tool performance, and resource usage",
    inputSchema: {
        type: "object",
        properties: {
            metric_type: {
                type: "string",
                enum: ["summary", "tools", "messages", "database", "memory"],
                description: "Type of metrics to retrieve",
            },
        },
        required: [],
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        const metricType = (input.metric_type as string) || "summary";
        
        try {
            let result: Record<string, unknown>;
            
            switch (metricType) {
                case "summary": {
                    const snapshot = getMetricsSnapshot();
                    result = {
                        type: "metrics_summary",
                        uptime_seconds: Math.round(snapshot.uptime),
                        total_requests: snapshot.requestCount,
                        total_tool_calls: snapshot.toolCallCount,
                        total_errors: snapshot.errorCount,
                        avg_tool_latency_ms: snapshot.avgToolLatency ? Math.round(snapshot.avgToolLatency) : null,
                        avg_message_latency_ms: snapshot.avgMessageLatency ? Math.round(snapshot.avgMessageLatency) : null,
                        tool_success_rate_percent: Math.round(snapshot.toolSuccessRate * 100) / 100,
                    };
                    break;
                }
                
                case "tools": {
                    result = {
                        type: "tool_metrics",
                        total_calls: getCounter("tool_calls_total"),
                        successful_calls: getCounter("tool_calls_success"),
                        failed_calls: getCounter("tool_calls_failure"),
                        avg_latency_ms: getAverage("tool_latency_ms"),
                    };
                    break;
                }
                
                case "messages": {
                    result = {
                        type: "message_metrics",
                        total_messages: getCounter("messages_total"),
                        failed_messages: getCounter("message_errors_total"),
                        avg_latency_ms: getAverage("message_latency_ms"),
                    };
                    break;
                }
                
                case "database": {
                    result = {
                        type: "database_metrics",
                        total_operations: getCounter("db_latency_ms"),
                        db_errors: getCounter("db_errors_total"),
                        avg_operation_latency_ms: getAverage("db_latency_ms"),
                    };
                    break;
                }
                
                case "memory": {
                    const memUsage = process.memoryUsage();
                    result = {
                        type: "memory_metrics",
                        heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
                        heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
                        rss_mb: Math.round(memUsage.rss / 1024 / 1024),
                        external_mb: Math.round(memUsage.external / 1024 / 1024),
                        memory_facts: Math.round(getGauge("memory_facts")),
                        memory_entities: Math.round(getGauge("memory_entities")),
                    };
                    break;
                }
                
                default:
                    result = { error: "Unknown metric type" };
            }
            
            log.debug(`Metrics retrieved: ${metricType}`);
            return JSON.stringify(result);
        } catch (error) {
            log.error("Failed to retrieve metrics", error);
            return JSON.stringify({
                error: "Failed to retrieve metrics",
                details: error instanceof Error ? error.message : String(error),
            });
        }
    },
};
