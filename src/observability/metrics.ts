import { config } from "../config.ts";
import { createLogger } from "../logger.ts";
import { db } from "../db.ts";

const log = createLogger("metrics");

/**
 * Metrics module for tracking key system metrics
 * Stores in-memory with optional SQLite persistence
 */

export interface MetricPoint {
    name: string;
    value: number;
    timestamp: number;
    labels?: Record<string, string> | undefined;
}

export interface HistogramBucket {
    le: number; // less than or equal
    count: number;
}

export interface Metrics {
    counters: Map<string, number>;
    gauges: Map<string, number>;
    histograms: Map<string, MetricPoint[]>;
    lastUpdated: number;
}

const metrics: Metrics = {
    counters: new Map(),
    gauges: new Map(),
    histograms: new Map(),
    lastUpdated: Date.now(),
};

const startTime = Date.now();

// Metrics schema initialization is handled by src/db/migrations/schema.ts

/**
 * Increment a counter metric
 */
export function incrementCounter(name: string, increment: number = 1, labels?: Record<string, string>): void {
    const key = labels ? `${name}:${JSON.stringify(labels)}` : name;
    const current = metrics.counters.get(key) || 0;
    metrics.counters.set(key, current + increment);
    
    if (config.ENABLE_METRICS_PERSISTENCE) {
        persistMetric(name, "counter", current + increment, labels);
    }
}

/**
 * Set a gauge metric (absolute value, not cumulative)
 */
export function setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = labels ? `${name}:${JSON.stringify(labels)}` : name;
    metrics.gauges.set(key, value);
    metrics.lastUpdated = Date.now();
    
    if (config.ENABLE_METRICS_PERSISTENCE) {
        persistMetric(name, "gauge", value, labels);
    }
}

/**
 * Record a histogram value (latency, duration, etc.)
 */
export function recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const key = labels ? `${name}:${JSON.stringify(labels)}` : name;
    const histogram = metrics.histograms.get(key) || [];
    histogram.push({
        name,
        value,
        timestamp: Date.now(),
        labels,
    });
    
    // Keep only last config.METRICS_RETENTION_HOURS worth of data
    const retention = config.METRICS_RETENTION_HOURS * 60 * 60 * 1000;
    const cutoff = Date.now() - retention;
    const filtered = histogram.filter(p => p.timestamp > cutoff);
    
    metrics.histograms.set(key, filtered);
    
    if (config.ENABLE_METRICS_PERSISTENCE) {
        persistMetric(name, "histogram", value, labels);
    }
}

/**
 * Get percentile from histogram data
 */
export function getPercentile(name: string, percentile: number = 50, labels?: Record<string, string>): number | null {
    const key = labels ? `${name}:${JSON.stringify(labels)}` : name;
    const data = metrics.histograms.get(key) || [];
    
    if (data.length === 0) return null;
    
    const sorted = data.map(p => p.value).sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] !== undefined ? sorted[index] : (sorted[sorted.length - 1] ?? 0);
}

/**
 * Get average from histogram data
 */
export function getAverage(name: string, labels?: Record<string, string>): number | null {
    const key = labels ? `${name}:${JSON.stringify(labels)}` : name;
    const data = metrics.histograms.get(key) || [];
    
    if (data.length === 0) return null;
    
    const sum = data.reduce((acc, p) => acc + p.value, 0);
    return sum / data.length;
}

/**
 * Get counter value
 */
export function getCounter(name: string, labels?: Record<string, string>): number {
    const key = labels ? `${name}:${JSON.stringify(labels)}` : name;
    return metrics.counters.get(key) || 0;
}

/**
 * Get gauge value
 */
export function getGauge(name: string, labels?: Record<string, string>): number {
    const key = labels ? `${name}:${JSON.stringify(labels)}` : name;
    return metrics.gauges.get(key) || 0;
}

/**
 * Persist metric to SQLite
 */
function persistMetric(name: string, type: string, value: number, labels?: Record<string, string>): void {
    try {
        const stmt = db.prepare(`
            INSERT INTO metrics (name, type, value, labels, timestamp)
            VALUES (?, ?, ?, ?, ?)
        `);
        stmt.run(
            name,
            type,
            value,
            labels ? JSON.stringify(labels) : null,
            Date.now()
        );
    } catch (err) {
        log.debug("Failed to persist metric", { error: err });
    }
}

/**
 * Create histogram buckets for Prometheus format
 */
export function createHistogramBuckets(name: string, labels?: Record<string, string>): HistogramBucket[] {
    const buckets = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
    const key = labels ? `${name}:${JSON.stringify(labels)}` : name;
    const data = metrics.histograms.get(key) || [];
    
    return buckets.map(le => ({
        le,
        count: data.filter(p => p.value <= le).length,
    }));
}

/**
 * Export metrics in Prometheus text format
 */
export function exportPrometheusFormat(): string {
    const lines: string[] = [];
    
    // Counters
    metrics.counters.forEach((value, key) => {
        const [name, labels] = parseMetricKey(key);
        lines.push(`${name}_total{${labels}} ${value}`);
    });
    
    // Gauges
    metrics.gauges.forEach((value, key) => {
        const [name, labels] = parseMetricKey(key);
        lines.push(`${name}{${labels}} ${value}`);
    });
    
    // Histograms (simplified: just sum and count)
    metrics.histograms.forEach((data, key) => {
        const [name, labels] = parseMetricKey(key);
        const sum = data.reduce((acc, p) => acc + p.value, 0);
        lines.push(`${name}_sum{${labels}} ${sum}`);
        lines.push(`${name}_count{${labels}} ${data.length}`);
        
        // Add percentiles
        [50, 95, 99].forEach(p => {
            const percentile = getPercentile(name, p);
            if (percentile !== null) {
                lines.push(`${name}_p${p}{${labels}} ${percentile}`);
            }
        });
    });
    
    // System metrics
    const uptime = (Date.now() - startTime) / 1000;
    lines.push(`# HELP process_uptime_seconds Uptime in seconds`);
    lines.push(`# TYPE process_uptime_seconds gauge`);
    lines.push(`process_uptime_seconds ${uptime}`);
    
    return lines.join("\n");
}

/**
 * Parse metric key to extract name and labels
 */
function parseMetricKey(key: string): [string, string] {
    const parts = key.split(":");
    const name = parts[0]!;
    
    if (parts.length < 2) {
        return [name, ""];
    }
    
    try {
        const labels = JSON.parse(parts.slice(1).join(":"));
        const labelStr = Object.entries(labels)
            .map(([k, v]) => `${k}="${v}"`)
            .join(",");
        return [name, labelStr];
    } catch {
        return [name, ""];
    }
}

/**
 * Get metrics snapshot for health endpoint
 */
export function getMetricsSnapshot(): {
    uptime: number;
    requestCount: number;
    toolCallCount: number;
    errorCount: number;
    avgToolLatency: number | null;
    avgMessageLatency: number | null;
    toolSuccessRate: number;
} {
    const uptime = (Date.now() - startTime) / 1000;
    const requestCount = getCounter("requests_total");
    const toolCallCount = getCounter("tool_calls_total");
    const errorCount = getCounter("errors_total");
    const avgToolLatency = getAverage("tool_latency_ms");
    const avgMessageLatency = getAverage("message_latency_ms");
    
    const toolSuccess = getCounter("tool_calls_success");
    const toolFailure = getCounter("tool_calls_failure");
    const toolSuccessRate = toolSuccess + toolFailure > 0 
        ? (toolSuccess / (toolSuccess + toolFailure)) * 100 
        : 0;
    
    return {
        uptime,
        requestCount,
        toolCallCount,
        errorCount,
        avgToolLatency,
        avgMessageLatency,
        toolSuccessRate,
    };
}

/**
 * Reset all metrics (useful for testing)
 */
export function resetMetrics(): void {
    metrics.counters.clear();
    metrics.gauges.clear();
    metrics.histograms.clear();
    metrics.lastUpdated = Date.now();
    log.debug("Metrics reset");
}

/**
 * Common metric recording helpers
 */
export const metrics_ = {
    /**
     * Record tool execution
     */
    recordToolExecution(toolName: string, latency: number, success: boolean, error?: string): void {
        const labels = { tool: toolName };
        recordHistogram("tool_latency_ms", latency, labels);
        incrementCounter("tool_calls_total");
        
        if (success) {
            incrementCounter("tool_calls_success", 1, labels);
        } else {
            incrementCounter("tool_calls_failure", 1, labels);
            if (error) {
                incrementCounter("tool_errors_total", 1, { tool: toolName, error });
            }
        }
    },
    
    /**
     * Record message processing
     */
    recordMessageProcessing(latency: number, success: boolean, platform?: string): void {
        const labels = platform ? { platform } : {};
        recordHistogram("message_latency_ms", latency, labels);
        incrementCounter("messages_total", 1, labels);
        
        if (!success) {
            incrementCounter("message_errors_total", 1, labels);
        }
    },
    
    /**
     * Track WebSocket connections
     */
    setWebSocketClients(count: number): void {
        setGauge("ws_clients", count);
    },
    
    /**
     * Track memory system stats
     */
    setMemoryStats(facts: number, entities: number): void {
        setGauge("memory_facts", facts);
        setGauge("memory_entities", entities);
    },
    
    /**
     * Track database operations
     */
    recordDatabaseOperation(operation: string, latency: number, success: boolean): void {
        const labels = { operation };
        recordHistogram("db_latency_ms", latency, labels);
        
        if (!success) {
            incrementCounter("db_errors_total", 1, labels);
        }
    },
    
    /**
     * Track API request
     */
    recordRequest(path: string, statusCode: number, latency: number): void {
        const labels = { path, status: String(statusCode) };
        recordHistogram("http_request_duration_ms", latency, labels);
        incrementCounter("http_requests_total", 1, labels);
    },
};

// Initialize on load
