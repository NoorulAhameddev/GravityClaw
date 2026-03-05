---
name: Observability System
tags: logging, metrics, tracing, correlation, observability
---

# Gravity Claw Observability System

Comprehensive observability stack for Gravity Claw with structured logging, request correlation, metrics collection, and distributed tracing.

## Features

### 📊 Structured Logging
- **JSON & Pretty Formats**: Choose format based on environment
- **Context Support**: Include request IDs, session IDs, user IDs, and custom context
- **Source Information**: Optional file/line tracking for debugging
- **Log Levels**: debug, info, warn, error with configurable filtering

### 🔗 Request Correlation
- **Automatic ID Generation**: `corr-{timestamp}-{random}` format
- **Cross-Service Propagation**: Through HTTP headers, WebSocket messages, tool calls
- **ActiveContext Stack**: Track nested contexts across async operations
- **Custom Properties**: Add metadata to correlation contexts

### 📈 Metrics Collection
- **Counters**: Cumulative metrics (requests, errors, tool calls)
- **Gauges**: Absolute values (WebSocket clients, memory stats)
- **Histograms**: Distribution metrics (latencies, durations)
- **Percentiles**: Auto-compute p50, p95, p99 from histogram data
- **Prometheus Export**: Text format for monitoring systems

### 🔍 Distributed Tracing
- **Span Management**: Start, end, track execution spans
- **Tree Structure**: Parent-child span relationships
- **Event Logging**: Add events within spans
- **Automatic Metrics**: Duration and status tracking
- **Decorators**: Easy function wrapping for tracing

## Architecture

```
┌─────────────────────────────────────────────────────┐
│         Application Layer (Agent, Tools, etc.)      │
├─────────────────────────────────────────────────────┤
│  Logging         Correlation         Metrics        │
│  logger.ts       correlation.ts      metrics.ts     │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │              Tracing (tracing.ts)              │ │
│  │        (wraps all operations above)            │ │
│  └────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────┤
│       Observability Endpoints & Exports             │
│  /api/health       Comprehensive health check      │
│  /metrics          Prometheus text format          │
│  /api/metrics      JSON metrics snapshot           │
│  /api/traces       Distributed trace details       │
└─────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Basic Logging with Context

```typescript
import { createLogger } from "./logger.ts";

const log = createLogger("mymodule");

log.info("User authenticated", {
    correlationId: "corr-1234567890-abc",
    userId: "user-123",
    duration: 150
});

log.error("Failed to process request", error, {
    correlationId: "corr-1234567890-abc",
    retries: 3
});
```

### 2. Correlation Context

```typescript
import {
    startCorrelationContext,
    endCorrelationContext,
    getCurrentCorrelationId,
    addCorrelationProperty
} from "./observability/correlation.ts";

// Start context
const { id } = startCorrelationContext();

// Add metadata
addCorrelationProperty("sessionId", "sess-123");
addCorrelationProperty("source", "telegram");

// Get ID anywhere in async chain
const currentId = getCurrentCorrelationId();

// End context
endCorrelationContext();
```

### 3. Metrics Recording

```typescript
import {
    incrementCounter,
    setGauge,
    recordHistogram,
    metrics_
} from "./observability/metrics.ts";

// Counter
incrementCounter("requests_total", 1);
incrementCounter("errors_total", 1, { errorType: "timeout" });

// Gauge
setGauge("ws_clients", 25);

// Histogram
recordHistogram("tool_latency_ms", 145, { tool: "search" });

// Helper methods
metrics_.recordToolExecution("search", 145, true);
metrics_.recordMessageProcessing(234, true, "telegram");
metrics_.recordDatabaseOperation("select", 89, true);
```

### 4. Distributed Tracing

```typescript
import {
    startSpan,
    endSpan,
    endSpanWithError,
    addSpanEvent,
    addSpanAttribute,
    measureAsync
} from "./observability/tracing.ts";

// Manual span management
const span = startSpan("database.query", { query: "SELECT ..." });
try {
    const result = await db.query("...");
    addSpanEvent("query_completed", { rows: result.length });
    endSpan(span);
} catch (error) {
    endSpanWithError(error);
}

// Measure function
const { result, duration } = await measureAsync(
    () => fetchUserData(userId),
    "fetch_user"
);

// Decorator (syntax sugar)
@traceAsync("expensive_operation")
async function expensiveOp() {
    // Automatically traced and timed
}
```

## Configuration

### Environment Variables

```bash
# Logging
LOG_LEVEL=info                          # debug|info|warn|error
LOG_FORMAT=pretty                       # pretty|json
ENABLE_CALLER_INFO=false                # Include file:line in logs

# Metrics
ENABLE_METRICS=true                     # Enable collection
ENABLE_METRICS_PERSISTENCE=false        # Persist to SQLite
METRICS_RETENTION_HOURS=24              # Data retention

# Correlation & Tracing
CORRELATION_ID_HEADER=X-Correlation-ID # HTTP header name
ENABLE_TRACING=true                     # Enable span tracking

# OpenTelemetry (Optional)
OTEL_ENABLED=false                      # Export to OTEL collector
OTEL_EXPORTER_OTLP_ENDPOINT=...         # Collector endpoint
```

## HTTP Endpoints

### GET /api/health

Comprehensive health check with metrics and resource usage.

```bash
curl http://localhost:3000/api/health
```

**Response:**
```json
{
    "status": "ok",
    "timestamp": "2026-03-04T10:30:45.123Z",
    "uptime": 3600.5,
    "responseTime": 8,
    "server": {
        "listening": true,
        "port": 3000,
        "wsClients": 5
    },
    "database": {
        "status": "ok",
        "factsCount": 1250
    },
    "memory": {
        "heapUsed": 125,
        "heapTotal": 256,
        "rss": 380
    },
    "metrics": {
        "uptime": 3600,
        "requestCount": 245,
        "toolCallCount": 1203,
        "errorCount": 12,
        "avgToolLatencyMs": 145,
        "avgMessageLatencyMs": 234,
        "toolSuccessRate": 98.9
    }
}
```

### GET /metrics

Prometheus text format metrics for scraping.

```bash
curl http://localhost:3000/metrics
```

**Response:**
```
requests_total{path="/api/agent"} 245
tool_calls_total{} 1203
tool_latency_sum{tool="search"} 45620
tool_latency_count{tool="search"} 314
tool_latency_p50{tool="search"} 142
tool_latency_p95{tool="search"} 234
tool_latency_p99{tool="search"} 456
ws_clients{} 5
process_uptime_seconds 3600.5
```

### GET /api/metrics

JSON-formatted metrics snapshot.

```bash
curl http://localhost:3000/api/metrics
```

**Response:**
```json
{
    "timestamp": "2026-03-04T10:30:45.123Z",
    "metrics": {
        "uptime": 3600,
        "requestCount": 245,
        "toolCallCount": 1203,
        "errorCount": 12,
        "avgToolLatencyMs": 145,
        "avgMessageLatencyMs": 234,
        "toolSuccessRate": 98.9
    },
    "correlations": {
        "active": 5,
        "details": [ ... ]
    }
}
```

### GET /api/traces/{traceId}

Get detailed trace information for debugging.

```bash
curl http://localhost:3000/api/traces/corr-1234567890-abc123
```

**Response:**
```json
{
    "traceId": "corr-1234567890-abc123",
    "spanCount": 12,
    "duration": 1543,
    "spans": [
        {
            "id": "span-1234567890-abc",
            "traceId": "corr-1234567890-abc123",
            "name": "agent.run",
            "startTime": 1704283845123,
            "endTime": 1704283846666,
            "duration": 1543,
            "status": "success",
            "attributes": { ... },
            "events": [ ... ]
        },
        ...
    ]
}
```

## Use Cases

### 1. Debugging Production Issues
- Correlation IDs link logs across services
- Traces show exact operation sequence and timing
- Metrics reveal performance patterns

### 2. Performance Optimization
- Histograms identify latency bottlenecks
- Percentiles show tail performance
- Tool-specific metrics reveal slow operations

### 3. Cost Tracking
- Tool call metrics → cost per tool
- Message volume tracking
- API usage patterns

### 4. Health Monitoring
- Database connectivity checks
- Memory usage tracking
- WebSocket client count
- Error rate calculation

### 5. Compliance & Auditing
- Complete request lifecycle tracking
- User action attribution
- Tool execution audit trail

## Integration Points

### Agent Loop (`src/agent.ts`)
- Correlation context wrapping
- Iteration and tool span tracking
- Tool execution metrics
- Duration recording

### Channels (`src/channels/router.ts`)
- Platform-specific message processing
- Correlation propagation
- Channel-specific metrics

### Database (`src/db.ts`)
- Query latency tracking
- Error recording
- Operation counters

### Memory System (`src/memory/`)
- Search operation timing
- Entity/fact counting
- Graph operations

### WebSocket Server (`src/server.ts`)
- Connection tracking
- Message processing metrics
- Client count gauges

## Best Practices

1. **Always Start Context Early**
   ```typescript
   startCorrelationContext(); // At request entry point
   ```

2. **Wrap Async Operations**
   ```typescript
   const { result, duration } = await measureAsync(() => fetchData(), "operation");
   ```

3. **Log Errors with Context**
   ```typescript
   log.error("Operation failed", error, { userId, sessionId, duration });
   ```

4. **Add Metadata to Metrics**
   ```typescript
   recordHistogram("latency_ms", duration, { tool: "search", model: "gpt4" });
   ```

5. **Use Appropriate Levels**
   - **debug**: Detailed trace information for development
   - **info**: Key operational events
   - **warn**: Warning conditions that should be investigated
   - **error**: Error conditions requiring immediate attention

6. **Periodic Cleanup**
   - Span cleanup happens automatically (max 1000 in memory)
   - Correlation contexts auto-cleanup (max 1000)
   - Metrics retention configurable

## Performance Considerations

- Logging is synchronous (minimal overhead)
- Metrics recording is O(1)
- Tracing has minimal overhead but grows memory with logs
- JSON format slightly slower than pretty (use pretty in high-load scenarios)
- Caller info tracking adds stack inspection cost
- Database persistence is async non-blocking

## Troubleshooting

### High Memory Usage
- Reduce `METRICS_RETENTION_HOURS`
- Disable `ENABLE_METRICS_PERSISTENCE` if not needed
- Disable `ENABLE_CALLER_INFO` in production

### Missing Correlation IDs
- Ensure `startCorrelationContext()` called at request entry
- Verify headers/message properties include correlation ID
- Check `CORRELATION_ID_HEADER` configuration

### Trace Not Found
- Traces are kept in memory only
- May be cleaned up if > 1000 concurrent
- Check with `/api/metrics` to see active traces

### High Log Volume
- Adjust `LOG_LEVEL` to reduce output
- Use sampling in production environments
- Consider log aggregation service

## Files Reference

| File | Purpose |
|------|---------|
| `src/logger.ts` | Enhanced structured logging |
| `src/observability/correlation.ts` | Request correlation IDs |
| `src/observability/metrics.ts` | Metrics collection & export |
| `src/observability/tracing.ts` | Distributed tracing |
| `src/observability/index.ts` | Module exports |
| `src/tools/observability/metrics.ts` | Metrics tool for agents |
| `docs/OBSERVABILITY_INTEGRATION.md` | Integration guide with examples |
| `src/server.ts` | Health & metrics endpoints |
| `src/config.ts` | Configuration schema |

## Next Steps

1. **Review** [OBSERVABILITY_INTEGRATION.md](./OBSERVABILITY_INTEGRATION.md) for detailed examples
2. **Integrate** observability into key components (agent, channels, db)
3. **Configure** environment variables in `.env`
4. **Monitor** using `/api/health` and `/metrics` endpoints
5. **Export** traces/metrics to APM system (optional)

---

**Ready to add observability!** 🚀
