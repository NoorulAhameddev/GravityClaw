# Observability Quick Reference

Fast lookup for common observability tasks in Gravity Claw.

## Log Levels

| Level | When to Use | Example |
|-------|-----------|---------|
| `debug` | Detailed trace info | Variable values, loop iterations |
| `info` | Key operations | "Agent started", "Tool executed" |
| `warn` | Attention needed | Failed attempt, unusual condition |
| `error` | Error occurred | Exception, operation failed |

## Logging

### Basic logging
```typescript
import { createLogger } from "./logger.ts";

const log = createLogger("moduleName");

log.info("User logged in");
log.warn("Slow operation", { duration: 5000 });
log.error("Failed to connect", error);
```

### Logging with context
```typescript
log.info("Processing started", {
    userId: "user-123",
    correlationId: "corr-xyz",
    duration: 150,
    sessionId: "sess-abc"
});
```

## Correlation IDs

### Start context
```typescript
import { startCorrelationContext, endCorrelationContext } from "./observability/correlation.ts";

const { id } = startCorrelationContext();
// ... do work ...
endCorrelationContext();
```

### Get current ID
```typescript
import { getCurrentCorrelationId } from "./observability/correlation.ts";

const id = getCurrentCorrelationId();
log.info("Processing", { correlationId: id });
```

### Add metadata
```typescript
import { addCorrelationProperty } from "./observability/correlation.ts";

addCorrelationProperty("userId", "user-123");
addCorrelationProperty("sessionId", "sess-abc");
```

## Metrics

### Counter (cumulative)
```typescript
import { incrementCounter } from "./observability/metrics.ts";

incrementCounter("requests_total");
incrementCounter("errors_total", 1, { errorType: "timeout" });
```

### Gauge (absolute value)
```typescript
import { setGauge } from "./observability/metrics.ts";

setGauge("ws_clients", 25);
setGauge("memory_facts", 1250);
```

### Histogram (distribution)
```typescript
import { recordHistogram } from "./observability/metrics.ts";

recordHistogram("tool_latency_ms", 145);
recordHistogram("message_latency_ms", 234, { platform: "telegram" });
```

### Helper methods
```typescript
import { metrics_ } from "./observability/metrics.ts";

metrics_.recordToolExecution("search", latency, success, errorMsg?);
metrics_.recordMessageProcessing(latency, success, platform);
metrics_.recordDatabaseOperation("insert", latency, success);
metrics_.setWebSocketClients(25);
metrics_.setMemoryStats(facts, entities);
```

## Tracing

### Manual spans
```typescript
import { startSpan, endSpan, endSpanWithError } from "./observability/tracing.ts";

const span = startSpan("operation_name", { key: "value" });
try {
    // do work
    endSpan(span);
} catch (error) {
    endSpanWithError(error, undefined, span);
}
```

### Measure function
```typescript
import { measureAsync } from "./observability/tracing.ts";

const { result, duration } = await measureAsync(
    () => fetchData(),
    "fetch_operation"
);
```

### Add events/attributes
```typescript
import { addSpanEvent, addSpanAttribute } from "./observability/tracing.ts";

addSpanEvent("database_query_executed");
addSpanAttribute("userId", "user-123");
```

## Common Patterns

### Async function with correlation
```typescript
async function myFunction(userId: string) {
    const correlationId = getCurrentCorrelationId();
    const span = startSpan("my_function", { userId });
    const startTime = Date.now();
    
    try {
        log.info("Starting operation", { correlationId, userId });
        
        // do work
        const result = await doWork();
        
        const latency = Date.now() - startTime;
        log.info("Operation complete", {
            correlationId,
            userId,
            latency,
            resultLength: result.length
        });
        
        recordHistogram("operation_latency_ms", latency);
        endSpan(span);
        return result;
    } catch (error) {
        const latency = Date.now() - startTime;
        log.error("Operation failed", error, {
            correlationId,
            userId,
            latency
        });
        endSpanWithError(error, undefined, span);
        increment("operation_errors_total");
        throw error;
    }
}
```

### Database operation
```typescript
const span = startSpan("db.query", { query: "SELECT ..." });
const startTime = Date.now();

try {
    const result = db.query(...);
    metrics_.recordDatabaseOperation("select", Date.now() - startTime, true);
    endSpan(span);
    return result;
} catch (error) {
    metrics_.recordDatabaseOperation("select", Date.now() - startTime, false);
    endSpanWithError(error, undefined, span);
    throw error;
}
```

### Tool execution
```typescript
const span = startSpan("tool.execute", { toolName });
const startTime = Date.now();

try {
    const result = await tool.execute(input);
    metrics_.recordToolExecution(toolName, Date.now() - startTime, true);
    endSpan(span);
    return result;
} catch (error) {
    metrics_.recordToolExecution(toolName, Date.now() - startTime, false, error.message);
    endSpanWithError(error, undefined, span);
    throw error;
}
```

## Configuration

```bash
# Environment variables (.env)
LOG_LEVEL=info                              # debug|info|warn|error
LOG_FORMAT=pretty                           # pretty|json
ENABLE_CALLER_INFO=false                    # Include file:line
ENABLE_METRICS=true                         # Collect metrics
ENABLE_METRICS_PERSISTENCE=false            # Persist to SQLite
METRICS_RETENTION_HOURS=24                  # Data retention
CORRELATION_ID_HEADER=X-Correlation-ID     # HTTP header
ENABLE_TRACING=true                         # Collect spans
OTEL_ENABLED=false                          # OpenTelemetry export
OTEL_EXPORTER_OTLP_ENDPOINT=http://...      # OTEL collector
```

## Endpoints

```bash
# Health check
curl http://localhost:3000/api/health

# Prometheus metrics
curl http://localhost:3000/metrics

# JSON metrics
curl http://localhost:3000/api/metrics

# Specific trace
curl http://localhost:3000/api/traces/{traceId}

# WebSocket info
curl http://localhost:3000/api/ws-info
```

## Response Format Examples

### Health endpoint
```json
{
    "status": "ok",
    "uptime": 3600.5,
    "server": { "wsClients": 5 },
    "database": { "status": "ok", "factsCount": 1250 },
    "memory": { "heapUsed": 125, "heapTotal": 256 },
    "metrics": {
        "uptime": 3600,
        "requestCount": 245,
        "toolCallCount": 1203,
        "avgToolLatencyMs": 145,
        "toolSuccessRate": 98.9
    }
}
```

### Metrics endpoint
```
requests_total{path="/api/agent"} 245
tool_latency_sum{tool="search"} 45620
tool_latency_p95{tool="search"} 234
ws_clients{} 5
```

### Traces endpoint
```json
{
    "traceId": "corr-1234567890-abc",
    "spanCount": 12,
    "duration": 1543,
    "spans": [
        {
            "id": "span-123",
            "name": "agent.run",
            "duration": 1500,
            "status": "success"
        }
    ]
}
```

## Debugging Tips

### Check correlation ID
```typescript
const id = getCurrentCorrelationId();
log.info("Current correlation", { id });
```

### View current span
```typescript
import { getCurrentSpan } from "./observability/tracing.ts";

const span = getCurrentSpan();
console.log(span?.name, span?.duration);
```

### Get metrics snapshot
```typescript
import { getMetricsSnapshot } from "./observability/metrics.ts";

const metrics = getMetricsSnapshot();
console.log("Tool success rate:", metrics.toolSuccessRate);
```

### View active correlations
```typescript
import { getActiveCorrelations } from "./observability/correlation.ts";

const active = getActiveCorrelations();
console.log("Active contexts:", active.length);
```

## Performance Checklist

- [ ] Use JSON format in production (faster parsing)
- [ ] Disable ENABLE_CALLER_INFO in high-load scenarios
- [ ] Set appropriate METRICS_RETENTION_HOURS
- [ ] Only enable OTEL export when needed
- [ ] Monitor `/api/health` regularly
- [ ] Check metrics endpoint for outliers
- [ ] Use correlation IDs for debugging
- [ ] Clean up spans regularly (auto at 1000)

## Files Reference

| File | Purpose |
|------|---------|
| `src/logger.ts` | Logging |
| `src/observability/correlation.ts` | Correlation IDs |
| `src/observability/metrics.ts` | Metrics |
| `src/observability/tracing.ts` | Distributed tracing |
| `src/observability/otel.ts` | OpenTelemetry export |
| `docs/OBSERVABILITY.md` | Main documentation |
| `docs/OBSERVABILITY_INTEGRATION.md` | Integration guide |
| `docs/OBSERVABILITY_EXAMPLES.md` | Code examples |

## Resources

- [Main Observability Docs](./OBSERVABILITY.md)
- [Integration Guide](./OBSERVABILITY_INTEGRATION.md)
- [Code Examples](./OBSERVABILITY_EXAMPLES.md)
- [OpenTelemetry Docs](https://opentelemetry.io/)
- [Prometheus Format](https://prometheus.io/docs/instrumenting/exposition_formats/)

---

**Quick tip:** Always start with correlation context and span creation. Everything else follows naturally!
