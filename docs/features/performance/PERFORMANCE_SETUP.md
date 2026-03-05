# Performance Testing Setup & Guide

## Quick Start

### Running Load Tests

```bash
# Basic load test (50 clients, 100 messages each, 60 seconds)
npm run bench:load

# Custom parameters
npx tsx scripts/load-test.ts --clients 100 --messages 50 --duration 120 --url ws://localhost:3000
```

### Running Stress Tests

```bash
# Find breaking point (10→300 clients, +10 per iteration)
npm run bench:stress

# Custom parameters
npx tsx scripts/stress-test.ts --initial 20 --increment 15 --max-clients 500 --url ws://localhost:3000
```

### Running Tool Benchmarks

```bash
# Benchmark individual tools
npm run bench:tools

# All tests at once
npm run bench:all
```

### Performance Regression Testing

```bash
# Fails if latency/memory/tool execution degrades > 10%
npm run test:performance
```

## Performance Metrics Endpoints

After starting the server, access performance metrics via HTTP:

### Overall Performance
```bash
GET /api/metrics/performance
```

Response includes:
- Memory stats (heap used, peak, trend)
- Tool metrics (slowest, most executed)
- Iteration statistics

### Memory Metrics
```bash
GET /api/metrics/memory
GET /api/metrics/memory-trend
```

### Tool Metrics
```bash
GET /api/metrics/tools
```

Response includes:
- Slowest tools (avg execution time)
- Most executed tools
- Error rates per tool
- Cache statistics

### Iteration Metrics
```bash
GET /api/metrics/iterations
```

### Database Metrics
```bash
GET /api/metrics/database
```

### Comprehensive Snapshot
```bash
GET /api/metrics/all
```

### Health Check
```bash
GET /api/metrics/health
```

Returns: `ok`, `degraded`, or `critical` status

## Performance Optimizations Enabled

### Database
- ✅ Indexes on frequently queried columns
- ✅ Session settings cache (in-memory, 60s TTL)
- ✅ Batch insert optimization
- ✅ Query result caching
- ✅ Automatic cache cleanup

### WebSocket
- ✅ Connection pooling (max 1000)
- ✅ Heartbeat/ping-pong (30s interval)
- ✅ Dead connection cleanup (60s timeout)
- ✅ Client metrics tracking
- ✅ Message size warnings

### Memory
- ✅ Real-time monitoring (1-minute intervals)
- ✅ Leak detection algorithm
- ✅ GC hints every 5 minutes
- ✅ Peak heap tracking
- ✅ Automatic cleanup on threshold

### Tools
- ✅ Execution time tracking
- ✅ Result caching (5-minute TTL)
- ✅ Slow execution warnings (>100ms)
- ✅ Error rate tracking
- ✅ Trend analysis

### Agent Loop
- ✅ Iteration latency measurement
- ✅ Tool call counting
- ✅ Regex pattern compilation caching
- ✅ Common pattern precompilation
- ✅ P50/P95/P99 latency tracking

## Baseline Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Connected Clients | 50+ | Single instance |
| Messages/sec | 50+ | Sustained throughput |
| Latency P95 | < 200ms | Response time |
| Latency P99 | < 500ms | Tail latency |
| Memory (heap) | < 300MB | At 50 clients |
| Tool Execution | < 50ms avg | Per tool |
| Error Rate | < 1% | Success rate > 99% |

## Monitoring Checklist

### Daily
- [ ] Check `/api/metrics/health` - should be `ok`
- [ ] Monitor memory trend - should be stable
- [ ] Review error logs for patterns

### Weekly
- [ ] Run performance regression tests
- [ ] Compare with baseline metrics
- [ ] Review slowest tools/iterations
- [ ] Check memory leak detection

### Monthly
- [ ] Run full load test suite
- [ ] Update scaling recommendations
- [ ] Archive old
 metrics
- [ ] Plan optimizations based on trends

## Troubleshooting

### High Memory Usage
```bash
# Check memory stats
curl http://localhost:3000/api/metrics/memory

# Check for leaks
curl http://localhost:3000/api/metrics/memory | grep leakDetection

# Force cleanup
# Memory auto-cleans on 80% threshold, but you can:
# 1. Restart the server
# 2. Or call forceCleanup() from tools
```

### High Latency
```bash
# Check tool metrics
curl http://localhost:3000/api/metrics/tools

# Check iteration stats
curl http://localhost:3000/api/metrics/iterations

# Check slowest tools
curl http://localhost:3000/api/metrics/tools | grep slowestTools
```

### Connection Issues
```bash
# Check WebSocket metrics
curl http://localhost:3000/api/ws-info

# Check connection count
curl http://localhost:3000/api/metrics/all | grep WebSocket
```

## Environment Variables for Testing

```bash
# Run with GC exposed (for memory profiling)
node --expose-gc src/index.ts

# Run with CPU profiling
node --cpu-prof src/index.ts

# Run with heap snapshots
node --heap-prof src/index.ts
```

## Load Test Results Interpretation

### Success Criteria
- ✅ All clients connected successfully
- ✅ Success rate > 99%
- ✅ Latency P95 < 200ms
- ✅ No connection timeouts
- ✅ Memory stable (not growing)

### Warning Signs
- ⚠️ Success rate 95-99% - investigate delays
- ⚠️ Latency P99 > 500ms - check resource limits
- ⚠️ Memory increasing during test - potential leak
- ⚠️ Connection failures - check server capacity

### Critical Issues
- ❌ Success rate < 95% - server overloaded
- ❌ Latency P99 > 1000ms - severe bottleneck
- ❌ Out of memory error - insufficient resources
- ❌ Connection timeouts - networking issue

## Example Performance Report

```json
{
  "timestamp": "2024-03-04T14:30:00Z",
  "config": {
    "clients": 50,
    "messages": 100,
    "duration": 60
  },
  "results": {
    "totalConnected": 50,
    "successRate": 99.8,
    "messagesPerSecond": 148.5,
    "latency": {
      "p50": 25.3,
      "p95": 145.2,
      "p99": 287.5
    },
    "memory": {
      "heapUsedMB": 185.3,
      "peakHeapMB": 256.7
    }
  },
  "status": "PASSED ✅"
}
```

## Advanced Performance Profiling

### CPU Flame Graph
```bash
npm install -g 0x
0x scripts/load-test.ts --clients 50
# Open: file:///.../stacks.html
```

### Memory Heap Snapshot
```bash
# Generate snapshot
node --heap-prof scripts/load-test.ts

# Open in Chrome DevTools > Memory > Load
```

### Database Query Analysis
```bash
SQLITE_LOG_LEVEL=DEBUG node src/index.ts 2>&1 | grep "QUERY"
```

## For More Information

- [PERFORMANCE.md](./PERFORMANCE.md) - Detailed performance guide
- [Load Test Script](../scripts/load-test.ts) - WebSocket load testing
- [Stress Test Script](../scripts/stress-test.ts) - Breaking point analysis
- [Tool Benchmark Script](../scripts/bench-tools.ts) - Tool execution profiling
- [Performance Tests](../src/__tests__/performance.test.ts) - CI/CD regression tests

## Support

For performance issues:
1. Check `/api/metrics/health` endpoint
2. Review [PERFORMANCE.md](./PERFORMANCE.md) troubleshooting section
3. Run appropriate benchmark script
4. Compare results with baseline metrics
5. Check application logs for errors
