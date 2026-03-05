# Observability Implementation Checklist

Step-by-step guide to integrate the observability system into Gravity Claw.

## Phase 1: Setup & Configuration

- [ ] Review `docs/OBSERVABILITY.md` for overview
- [ ] Review `docs/OBSERVABILITY_QUICK_REFERENCE.md` for patterns
- [ ] Add environment variables to `.env`:
  ```bash
  LOG_LEVEL=debug
  LOG_FORMAT=pretty
  ENABLE_CALLER_INFO=false
  ENABLE_METRICS=true
  ENABLE_METRICS_PERSISTENCE=false
  METRICS_RETENTION_HOURS=24
  CORRELATION_ID_HEADER=X-Correlation-ID
  ENABLE_TRACING=true
  OTEL_ENABLED=false
  ```
- [ ] Verify new modules are in place:
  - `src/logger.ts` ✓
  - `src/observability/correlation.ts` ✓
  - `src/observability/metrics.ts` ✓
  - `src/observability/tracing.ts` ✓
  - `src/observability/otel.ts` ✓
  - `src/observability/index.ts` ✓
- [ ] Verify tools are in place:
  - `src/tools/observability/metrics.ts` ✓
  - `src/tools/observability/index.ts` ✓
- [ ] Verify HTTP endpoints added to `src/server.ts`:
  - `GET /api/health`
  - `GET /metrics`
  - `GET /api/metrics`
  - `GET /api/traces/{traceId}`

## Phase 2: Agent Loop Integration

**File:** `src/agent.ts`

- [ ] Add imports:
  ```typescript
  import { 
      startCorrelationContext, 
      endCorrelationContext,
      addCorrelationProperty 
  } from "./observability/correlation.ts";
  import { startSpan, endSpan, endSpanWithError, addSpanEvent } from "./observability/tracing.ts";
  import { recordHistogram, metrics_ } from "./observability/metrics.ts";
  ```

- [ ] In `runAgent()`:
  - [ ] Start correlation context at beginning
  - [ ] Add correlation metadata (sessionId, userId, platform)
  - [ ] Start main span for agent run
  - [ ] Log agent start with context
  - [ ] Track iteration timing and metrics
  - [ ] Wrap tool execution with spans
  - [ ] Record tool metrics (execution, latency, success/failure)
  - [ ] Log tool execution with context
  - [ ] Record agent completion time
  - [ ] End correlation context in finally block

**Reference:** Lines 30-150 in `docs/OBSERVABILITY_INTEGRATION.md`

## Phase 3: HTTP Request Middleware

**File:** `src/server.ts`

- [ ] Add request tracking middleware:
  - [ ] Extract/generate correlation ID from headers
  - [ ] Start correlation context
  - [ ] Start HTTP request span
  - [ ] Log request details
  - [ ] Intercept response sending
  - [ ] Record metrics (latency, status code)
  - [ ] End span and correlation context

**Reference:** Lines 250-300 in `docs/OBSERVABILITY_INTEGRATION.md`

## Phase 4: WebSocket Integration

**File:** `src/server.ts` or `src/channels/router.ts`

- [ ] On connection:
  - [ ] Generate correlation ID
  - [ ] Start correlation context
  - [ ] Log connection event
  - [ ] Update WebSocket client gauge

- [ ] On message:
  - [ ] Start message processing span
  - [ ] Extract correlation ID from message
  - [ ] Log message received
  - [ ] Process message
  - [ ] Record message metrics (latency, success/failure)
  - [ ] End span

- [ ] On disconnect:
  - [ ] Log disconnection
  - [ ] Update WebSocket client gauge
  - [ ] End correlation context

**Reference:** Lines 155-210 in `docs/OBSERVABILITY_INTEGRATION.md`

## Phase 5: Database Operations

**File:** `src/db.ts` or wherever queries run

- [ ] For each database operation:
  - [ ] Start span with operation type
  - [ ] Record start time
  - [ ] Execute query
  - [ ] Calculate latency
  - [ ] Record metrics using `metrics_.recordDatabaseOperation()`
  - [ ] End span with status
  - [ ] Handle errors with `endSpanWithError()`

**Reference:** Lines 215-260 in `docs/OBSERVABILITY_INTEGRATION.md`

## Phase 6: Memory System

**File:** `src/memory/` modules

- [ ] For memory search operations:
  - [ ] Start span with query info
  - [ ] Record latency
  - [ ] Track result count in metrics
  - [ ] Log with correlation ID

- [ ] For memory updates:
  - [ ] Update stats using `metrics_.setMemoryStats()`
  - [ ] Track fact/entity counts

**Reference:** Lines 265-310 in `docs/OBSERVABILITY_INTEGRATION.md`

## Phase 7: Channel Operations

**File:** `src/channels/router.ts`

- [ ] For incoming messages:
  - [ ] Start correlation context
  - [ ] Track platform-specific metrics
  - [ ] Log message received
  - [ ] Add channel metadata

- [ ] For outgoing messages:
  - [ ] Add correlation ID to response
  - [ ] Track send latency

**Reference:** Lines 355-410 in `docs/OBSERVABILITY_INTEGRATION.md`

## Phase 8: Tool Registration

**File:** `src/tools/index.ts`

- [ ] Register metrics tool:
  ```typescript
  import { MetricsTool } from "./observability/metrics.ts";
  
  registry.set(MetricsTool.name, MetricsTool);
  ```

## Phase 9: Testing & Verification

- [ ] Start the application:
  ```bash
  npm run dev
  ```

- [ ] Test health endpoint:
  ```bash
  curl http://localhost:3000/api/health
  ```
  - [ ] Returns 200 status
  - [ ] Contains uptime, metrics, database status
  - [ ] Response time < 100ms

- [ ] Test metrics endpoint:
  ```bash
  curl http://localhost:3000/metrics
  ```
  - [ ] Returns Prometheus format
  - [ ] Contains tool_calls_total, ws_clients, etc.

- [ ] Test JSON metrics:
  ```bash
  curl http://localhost:3000/api/metrics
  ```
  - [ ] Returns structured JSON
  - [ ] Contains active correlations

- [ ] Process test message through agent:
  - [ ] Check logs for correlation IDs
  - [ ] Verify metrics dashboard updated
  - [ ] Check `/api/health` shows updated counts

- [ ] Test correlation propagation:
  - [ ] Send message with custom correlation ID header
  - [ ] Verify same ID in logs
  - [ ] Check in `/api/traces/{id}`

- [ ] Test error handling:
  - [ ] Trigger an error
  - [ ] Verify logged with correlation ID
  - [ ] Check error count in metrics
  - [ ] Check trace shows error status

## Phase 10: Monitoring & Alerting (Optional)

- [ ] Set up Prometheus scraping:
  - [ ] Point to `http://localhost:3000/metrics`
  - [ ] Configure scrape interval (30-60s)
  - [ ] Add Gravity Claw job to prometheus.yml

- [ ] Set up Grafana dashboard:
  - [ ] Add Prometheus data source
  - [ ] Create dashboard panels:
    - [ ] Uptime (process_uptime_seconds)
    - [ ] Request rate (requests_total)
    - [ ] Tool success rate (tool_calls_success / tool_calls_total * 100)
    - [ ] Avg latency (tool_latency_ms)
    - [ ] WebSocket clients (ws_clients)
    - [ ] Error rate (errors_total)

- [ ] Set up alerting rules (optional):
  - [ ] Error rate > 5%
  - [ ] Avg latency > 500ms
  - [ ] WebSocket clients = 0
  - [ ] Database errors > 0

## Phase 11: OpenTelemetry Integration (Optional)

- [ ] Install OpenTelemetry packages:
  ```bash
  npm install @opentelemetry/api @opentelemetry/sdk-node \
    @opentelemetry/auto-instrumentations-node \
    @opentelemetry/exporter-trace-otlp-http
  ```

- [ ] Update `.env`:
  ```bash
  OTEL_ENABLED=true
  OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
  ```

- [ ] Uncomment OTEL initialization in `src/observability/otel.ts`

- [ ] Set up OTEL collector (docker or local)

- [ ] Verify traces in Jaeger/Zipkin UI

## Phase 12: Documentation & Training

- [ ] Share with team:
  - [ ] `docs/OBSERVABILITY.md` - Overview
  - [ ] `docs/OBSERVABILITY_QUICK_REFERENCE.md` - Lookups
  - [ ] `docs/OBSERVABILITY_INTEGRATION.md` - Integration details
  - [ ] `docs/OBSERVABILITY_EXAMPLES.md` - Code examples

- [ ] Document custom metrics if added

- [ ] Update team runbooks with:
  - [ ] How to access correlation IDs
  - [ ] How to debug using traces
  - [ ] Common metric queries
  - [ ] Alert escalation procedures

## Phase 13: Performance Tuning

- [ ] Monitor production metrics:
  - [ ] Check memory usage of observability
  - [ ] Review log volume
  - [ ] Check metric retention

- [ ] Adjust settings if needed:
  - [ ] Reduce `METRICS_RETENTION_HOURS` if memory high
  - [ ] Disable `ENABLE_CALLER_INFO` if CPU high
  - [ ] Increase log level if too verbose

- [ ] Profile with production-like load:
  - [ ] Simulate high concurrency
  - [ ] Check span cleanup
  - [ ] Monitor correlation context cleanup

## Phase 14: Ongoing Maintenance

- [ ] Weekly:
  - [ ] Check `/api/health` endpoint
  - [ ] Review error rate in metrics
  - [ ] Look for performance anomalies

- [ ] Monthly:
  - [ ] Review trace data retention
  - [ ] Check database size if persistence enabled
  - [ ] Update documentation if changed

- [ ] Quarterly:
  - [ ] Analyze trends in metrics
  - [ ] Identify optimization opportunities
  - [ ] Plan improvements

## Troubleshooting

### Missing correlation IDs in logs
- [ ] Verify `startCorrelationContext()` called at request entry
- [ ] Check correlation context is not ended prematurely
- [ ] Ensure async operations propagate context correctly

### Traces not appearing
- [ ] Check `ENABLE_TRACING=true`
- [ ] Verify spans are being created
- [ ] Check `/api/metrics` for active correlations
- [ ] Traces older than configured retention are cleaned up

### High memory usage
- [ ] Reduce `METRICS_RETENTION_HOURS`
- [ ] Disable metrics persistence
- [ ] Disable `ENABLE_CALLER_INFO`
- [ ] Check for memory leaks in spans

### Prometheus scraping fails
- [ ] Verify `/metrics` endpoint returns data
- [ ] Check Content-Type header is text/plain
- [ ] Review Prometheus target configuration
- [ ] Check network connectivity

### OTEL export errors
- [ ] Verify `OTEL_EXPORTER_OTLP_ENDPOINT` is correct
- [ ] Check OTEL collector is running
- [ ] Review error logs for details
- [ ] Disable OTEL if not needed: `OTEL_ENABLED=false`

## Success Criteria

- [ ] All logging includes correlation IDs
- [ ] Health endpoint responds in < 100ms
- [ ] Metrics endpoint provides Prometheus data
- [ ] Traces visible for key operations
- [ ] No performance degradation from observability

## Notes

- **Start simple**: Begin with agent loop, add complexity gradually
- **Test incrementally**: Verify each component works before moving on
- **Monitor early**: Get baseline metrics before full deployment
- **Keep logs**: Retain logs for debugging in early phases
- **Ask questions**: Refer to documentation when unclear

---

**Estimated Time:** 2-4 hours for full integration
**Complexity:** Medium (mostly configuration and imports)
**Risk:** Low (all changes are additive, no core logic changes)

**Good luck! 🚀**
