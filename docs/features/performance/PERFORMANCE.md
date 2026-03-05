# Gravity Claw Performance Guide

## Overview

This document provides comprehensive performance metrics, optimization techniques, scaling guidelines, and monitoring recommendations for Gravity Claw.

## Baseline Performance Metrics

### Load Test Baseline (50 concurrent clients, 100 messages/client)

**Target Metrics:**
- Connected clients: 50+
- Response latency P95: < 200ms
- Success rate: > 99%
- Messages per second: 50+
- Memory usage: < 300MB

**Typical Results:**
```json
{
  "messagesPerSecond": 148.5,
  "latency": {
    "p50": 25.3,
    "p95": 145.2,
    "p99": 287.5
  },
  "memory": {
    "heapUsedMB": 185.3,
    "peakHeapMB": 256.7
  },
  "successRate": 99.8
}
```

### Stress Test Baseline

**Breaking Point:** ~200-250 concurrent clients
**Max Sustainable Load:** 150+ concurrent clients
**Memory at max load:** ~400-450MB

## Optimization Techniques Implemented

### 1. Database Optimizations

#### Indexes Created
```sql
-- Frequently queried columns
CREATE INDEX idx_memory_timestamp ON memory(timestamp);
CREATE INDEX idx_memory_session_timestamp ON memory(session_id, timestamp);
CREATE INDEX idx_usage_session_timestamp ON usage(session_id, timestamp);
CREATE INDEX idx_workflows_session_status ON workflows(session_id, status);
CREATE INDEX idx_workflow_tasks_status ON workflow_tasks(workflow_id, status);
```

#### Pragmas Applied
- **journal_mode = WAL** - Better concurrency for concurrent reads
- **synchronous = NORMAL** - Balance between safety and performance
- **temp_store = MEMORY** - Use RAM for temporary tables
- **mmap_size = 30MB** - Memory-mapped I/O for faster access
- **foreign_keys = ON** - Data integrity with minimal overhead

#### Caching Strategy
- **Session Settings Cache**: In-memory LRU cache (60s TTL)
- **Session Info Cache**: Per-session metadata caching
- **Tool Result Cache**: 5-minute cache for tool outputs
- Automatic cleanup of expired entries every 5 minutes

#### Batch Operations
- Use `batchInsertMessages()` for multiple inserts
- Transactions for multi-step operations
- Compiled prepared statements for reuse

### 2. WebSocket Optimizations

#### Connection Management
- **Max connections**: 1000 per instance
- **Heartbeat interval**: 30 seconds
- **Dead connection timeout**: 60 seconds
- Automatic cleanup of idle connections

#### Ping-Pong Keep-Alive
```javascript
// Server sends ping every 30s
// Client responds with pong
// Dead connections are terminated
setInterval(() => {
  wss.clients.forEach((client) => {
    if (!client.isAlive) return client.terminate();
    client.isAlive = false;
    client.ping();
  });
}, 30000);
```

#### Buffer Management
- Message size warnings (>100KB)
- Client metrics tracking
- Connection queue monitoring

### 3. Memory Optimization

#### Monitoring
- Real-time memory tracking (1-minute intervals)
- Memory trend analysis
- Leak detection algorithm
- Peak heap tracking

#### Limits
```javascript
const MAX_HEAP_SIZE_MB = 512;
const MEMORY_WARN_THRESHOLD = 0.8; // 80% of max
```

#### GC Management
- Automatic GC hints every 5 minutes
- Forced cleanup when threshold exceeded
- Support for `--expose-gc` flag for V8 profiling

#### Cache Size Management
- Session settings cache: < 1000 entries
- Session info cache: < 5000 entries
- Tool result cache: limited by TTL (5 minutes)

### 4. Tool Execution Optimization

#### Caching
- Per-tool result caching with configurable TTL
- Argument-based cache keys
- Automatic cleanup of stale entries

#### Metrics Tracking
```javascript
{
  executionCount: number,
  totalTime: number,
  minTime: number,
  maxTime: number,
  avgTime: number,
  errorRate: number
}
```

#### Slow Tool Detection
- Warnings logged for executions > 100ms
- Historical comparison with averages
- Trend analysis

### 5. Agent Loop Optimization

#### Iteration Tracking
- Per-iteration latency measurement
- Tool call counting
- Message length tracking
- Session-based metrics

#### Regex Optimization
- Pattern compilation caching
- Precompiled common patterns (URL, email, IP, session ID)
- Reuse across iterations

#### Latency Monitoring
- P50, P95, P99 measurement
- Trend detection
- Anomaly identification

## Scaling Recommendations

### Single Instance Scaling

| Load | Clients | Memory | CPU | Notes |
|------|---------|--------|-----|-------|
| Light | 10-50 | 200MB | <20% | Development, testing |
| Medium | 50-150 | 300-350MB | 20-50% | Small production |
| Heavy | 150-200 | 400-450MB | 50-80% | Medium production |
| Maximum | 200-250 | 200-500MB | >80% | Approaching breaking point |

### Multi-Instance Scaling

**Load Balancer Setup**
```
Client Connections
    ↓
Load Balancer (nginx, HAProxy)
    ↓
Instance 1  Instance 2  Instance 3
(250 conn)  (250 conn)  (250 conn)
```

**Recommended Configuration**
- 3-5 instances for production
- Each instance: 2 CPU cores, 1GB RAM minimum
- Load balanced with sticky sessions for WebSocket
- Shared database with connection pooling

### Database Scaling

**For 1000+ clients:**
1. Enable connection pooling (pgbouncer for PostgreSQL)
2. Add read replicas for analytics queries
3. Archive old data periodically
4. Run VACUUM weekly

**For 10,000+ clients:**
1. Implement data sharding by session_id
2. Separate database for analytics
3. Message queue for async writes
4. Distributed caching (Redis)

## Network Requirements

### Bandwidth Estimates

| Metric | Per Client | 100 Clients | 500 Clients |
|--------|-----------|------------|------------|
| Message Size (avg) | 500 bytes | 50KB/sec | 250KB/sec |
| Connection Overhead | 1KB | 100KB | 500KB |
| Control Messages | 100 bytes/min | 10KB/min | 50KB/min |
| **Total Sustained** | - | **60KB/sec** | **300KB/sec** |
| **Peak (BPS)** | - | **500Kbps** | **2.5Mbps** |

**Recommendation**: Provision 5x peak bandwidth for headroom

## Monitoring Guidelines

### Key Metrics to Monitor

#### Real-time (Updated every minute)
- Connected WebSocket clients
- Messages per second
- Active sessions
- CPU usage %
- Memory usage (heap, peak)

#### Per-minute Aggregates
- Average message latency
- Tool execution times (slowest tools)
- Error rates
- Database query times
- Connection churn (new/closed)

#### Hourly Analysis
- Memory trend (increasing/decreasing/stable)
- Peak resource usage
- Tool performance degradation
- Session lifetime patterns

### Dashboard Widgets

**1. Real-time Status**
```
┌─────────────────────────────────────┐
│ Connected Clients: 156/250 (62%)    │
│ Uptime: 48h 23m 15s                 │
│ Requests/sec: 248.5                 │
│ Active Sessions: 42                 │
└─────────────────────────────────────┘
```

**2. Performance Metrics**
```
┌──────────────────────────────────────────────┐
│ Latency (p50/p95/p99): 25ms/145ms/287ms      │
│ Error Rate: 0.2%                             │
│ Avg Response: 125ms                          │
│ Peak Memory: 256MB / 512MB (50%)             │
└──────────────────────────────────────────────┘
```

**3. Tool Performance**
```
Slowest Tools:
  1. executionAgent     152.3ms avg
  2. queryDatabase      48.2ms avg
  3. compileFacts       35.7ms avg
```

**4. Memory Trend**
```
Memory (MB) │ ╭─────╮
    256     │ │     ╰─────
    200     │ │
    150     │ ╭───────────
    100     ├─┘
```

### Alerting Thresholds

```javascript
{
  critical: {
    cpuUsage: 85,                    // %
    memoryUsage: 90,                 // %
    errorRate: 5,                    // %
    latencyP99: 1000,                // ms
  },
  warning: {
    cpuUsage: 70,                    // %
    memoryUsage: 75,                 // %
    errorRate: 2,                    // %
    latencyP99: 500,                 // ms
    memoryLeak: true,                // trending upward
    connectionPoolFull: 0.9,          // > 90%
  }
}
```

## Performance Testing

### Running Load Tests

**Basic load test (50 clients, 100 messages each)**
```bash
npm run bench:load
```

**Custom parameters**
```bash
npx tsx scripts/load-test.ts --clients 100 --messages 50 --duration 120 --url ws://localhost:3000
```

**Results saved to** `logs/load-test-*.json`

### Running Stress Tests

**Find breaking point**
```bash
npm run bench:stress
```

**Custom parameters**
```bash
npx tsx scripts/stress-test.ts --initial 10 --increment 20 --max-clients 500
```

### Running Tool Benchmarks

**Benchmark all tools**
```bash
npm run bench:tools
```

**Output includes:** min/max/avg/stddev for each tool execution

### Performance Regression Testing

Integrated into CI/CD:
```bash
npm run test:performance
```

**Fails if:**
- Latency regression > 10%
- Memory usage increase > 20MB
- Tool execution degradation > 5%

## Known Limitations

### Current Limits (Single Instance)

| Limit | Value | Notes |
|-------|-------|-------|
| Concurrent connections | 250-500 | Can be increased to 1000+ with tuning |
| Messages per second | 500-1000 | Depends on message complexity |
| Database size | 10GB | Recommended max before archival |
| Session lifetime | Unlimited | Memory usage grows with history |
| Tool batch size | 100 | Configured in AGENT_MAX_ITERATIONS |

### Known Issues

1. **Large message handling**: Messages > 100KB may cause latency spikes
2. **Memory pressure**: GC pauses when heap > 80% capacity
3. **Database locks**: Heavy writes can block reads under extreme load
4. **WebSocket frame size**: Default 64KB limit for binary frames

### Recommendations for Limits

**If you need to increase limits:**

1. **More concurrent connections:**
   - Run multiple instances (load balanced)
   - Or increase to 1000: `MAX_CONNECTIONS_PER_INSTANCE = 1000`

2. **Higher throughput:**
   - Implement message batching
   - Use connection pooling for database
   - Add caching layer (Redis)

3. **Larger database:**
   - Implement data archival/sharding
   - Use separate analytics database
   - Optimize queries

## Performance Profiling

### Enable CPU Profiling

```bash
node --cpu-prof scripts/load-test.ts --clients 100 --duration 60
# Generates .cpuprofile file - open in Chrome DevTools
```

### Memory Profiling

```bash
node --expose-gc scripts/load-test.ts --clients 50
# Generates memory snapshots automatically
```

### Heap Snapshots

Import in Chrome DevTools > Memory > Load Profile

## Optimization Checklist

For initial deployment:
- [ ] Run load test to establish baseline
- [ ] Run stress test to find breaking point
- [ ] Run tool benchmarks
- [ ] Review slowest tools/iterations
- [ ] Enable monitoring dashboard
- [ ] Set up alerting thresholds
- [ ] Document specific setup details
- [ ] Create runbooks for common issues

For ongoing optimization:
- [ ] Monitor trends weekly
- [ ] Compare with baseline monthly
- [ ] Review error patterns
- [ ] Analyze slow traces
- [ ] Update scaling recommendations

## Advanced Optimization

### Database Query Analysis

```bash
# Enable query logging
SQLITE_LOG_LEVEL=DEBUG node src/index.ts 2>&1 | grep "QUERY"

# Analyze slow queries
npm run db:analyze-queries
```

### Flame Graphs

```bash
npm install -g 0x
0x scripts/load-test.ts --clients 50
# View at: file:///.../stacks.html
```

### Memory Leak Detection

```bash
# Run with --expose-gc
node --expose-gc src/index.ts

# Get memory stats
curl http://localhost:3000/api/metrics/memory
```

## Troubleshooting Performance

### High Latency

1. Check tool execution times: `/api/metrics/tools`
2. Monitor database query times
3. Check for memory pressure (GC pauses)
4. Review network latency

### High Memory Usage

1. Get memory stats: `/api/metrics/memory`
2. Check for memory leaks: `/api/metrics/memory-leak-check`
3. Clear old sessions: `cleanupOldData()`
4. Adjust cache TTLs

### Connection Issues

1. Check WebSocket metrics: `/api/metrics/websocket`
2. Review connection cleanup logs
3. Verify heartbeat interval
4. Check resource limits

## For More Information

- [Running Tests](../README.md#testing)
- [Architecture Overview](../docs/CANVAS.md)
- [Database Schema](../src/db.ts)
- [Configuration Reference](../src/config.ts)
