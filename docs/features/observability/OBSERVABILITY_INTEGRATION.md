# Observability Integration Guide

This guide shows how to integrate the observability modules (logging, correlation, metrics, and tracing) throughout Gravity Claw.

## Quick Overview

**Four core modules:**

1. **`src/logger.ts`** - Enhanced structured logging with context support, JSON format option
2. **`src/observability/correlation.ts`** - Request correlation ID generation and propagation
3. **`src/observability/metrics.ts`** - Metric collection (counters, gauges, histograms)
4. **`src/observability/tracing.ts`** - Distributed tracing and span management

**New HTTP Endpoints:**

- `GET /api/health` - Comprehensive health check with metrics
- `GET /metrics` - Prometheus text format metrics
- `GET /api/metrics` - JSON metrics and correlations
- `GET /api/traces/{traceId}` - Trace details for debugging

---

## 1. Agent Loop Integration

**File:** `src/agent.ts`

### Add correlation ID and tracing to runAgent():

```typescript
import { 
    startCorrelationContext, 
    endCorrelationContext,
    addCorrelationProperty 
} from "./observability/correlation.ts";
import { 
    startSpan, 
    endSpan, 
    endSpanWithError,
    addSpanEvent 
} from "./observability/tracing.ts";
import { 
    recordHistogram,
    metrics_ 
} from "./observability/metrics.ts";

export async function runAgent(options: AgentRunOptions): Promise<AgentRunResult> {
    // Start correlation context for this request
    const { id: correlationId } = startCorrelationContext(undefined, {
        sessionId: options.sessionId,
        userId: options.userId,
        platform: options.platform,
    });
    
    // Start span for entire agent run
    const agentSpan = startSpan("agent.run", {
        sessionId: options.sessionId,
        messageLength: options.message.length,
    });
    
    try {
        const { message, sessionId, requestConfirmation, onProgress } = options;
        const maxIterations = config.AGENT_MAX_ITERATIONS;
        const toolDefs = registry.getOpenAIDefinitions();

        log.info(`Agent run start`, {
            correlationId,
            sessionId,
            messageLength: message.length,
        });

        addUserMessage(sessionId, message);

        let iteration = 0;
        let totalToolCalls = 0;
        const collectedText: string[] = [];
        const iterationStartTime = Date.now();

        while (iteration < maxIterations) {
            iteration++;
            
            const iterationSpan = startSpan("agent.iteration", {
                iteration,
                maxIterations,
            });
            
            log.debug(`Iteration ${iteration}/${maxIterations}`, {
                correlationId,
                iteration,
            });

            const response = await callClaude(sessionId, toolDefs);

            // Collect any text from this turn
            if (response.text) {
                collectedText.push(response.text);
                if (onProgress) {
                    await onProgress(response.text);
                }
            }

            addAssistantMessage(sessionId, response.text, response.toolCalls.length > 0 ? response.toolCalls : undefined);

            // No tool calls → we're done
            if (response.toolCalls.length === 0) {
                endSpan(iterationSpan);
                
                const totalDuration = Date.now() - iterationStartTime;
                log.info(`Agent run complete`, {
                    correlationId,
                    sessionId,
                    toolCalls: totalToolCalls,
                    iterations: iteration,
                    duration: totalDuration,
                });
                
                recordHistogram("agent_run_duration_ms", totalDuration);
                endSpan(agentSpan);
                endCorrelationContext();
                
                return {
                    text: collectedText.join("\n").trim() || "(no response)",
                    toolCallCount: totalToolCalls,
                    hitLimit: false,
                };
            }

            // Execute each tool call
            for (const toolCall of response.toolCalls) {
                totalToolCalls++;
                const name = toolCall.function.name;
                
                const toolSpan = startSpan("tool.execute", { toolName: name });
                const toolStartTime = Date.now();
                
                log.info(`Tool call: ${name}`, {
                    correlationId,
                    sessionId,
                    toolName: name,
                    callNumber: totalToolCalls,
                });

                const tool = registry.get(name);

                if (!tool) {
                    log.warn(`Tool not found: ${name}`, {
                        correlationId,
                        toolName: name,
                    });
                    addToolResult(sessionId, toolCall.id, `Error: tool "${name}" not found.`);
                    
                    metrics_.recordToolExecution(name, 0, false, "not_found");
                    endSpanWithError(new Error("Tool not found"), undefined, toolSpan);
                    continue;
                }

                // Parse the JSON args from the model
                let input: Record<string, unknown> = {};
                try {
                    input = JSON.parse(toolCall.function.arguments || "{}") as Record<string, unknown>;
                } catch {
                    log.warn(`Failed to parse tool arguments`, {
                        correlationId,
                        toolName: name,
                    });
                    addToolResult(sessionId, toolCall.id, "Error: could not parse tool arguments as JSON.");
                    
                    metrics_.recordToolExecution(name, 0, false, "parse_error");
                    endSpanWithError(new Error("Parse error"), undefined, toolSpan);
                    continue;
                }

                // Confirmation gate for dangerous shell commands
                if (name === "run_shell" && requestConfirmation) {
                    const command = String(input["command"] ?? "");
                    const { isDangerous } = await import("./tools/system/shell.ts");
                    if (isDangerous(command)) {
                        log.warn(`Dangerous command confirmation required`, {
                            correlationId,
                            toolName: name,
                            command: command.substring(0, 100),
                        });
                        const confirmed = await requestConfirmation(command);
                        if (!confirmed) {
                            addToolResult(sessionId, toolCall.id, "User declined to run this command.");
                            
                            metrics_.recordToolExecution(name, 0, false, "user_declined");
                            endSpan(toolSpan);
                            continue;
                        }
                    }
                }

                try {
                    const result = await tool.execute({
                        ...input,
                        __sessionId: sessionId,
                        __userId: options.userId,
                        __platform: options.platform,
                        __groupId: options.groupId,
                        __isGroup: options.isGroup,
                        __correlationId: correlationId,
                    });
                    
                    const toolDuration = Date.now() - toolStartTime;
                    log.debug(`Tool result: ${name}`, {
                        correlationId,
                        toolName: name,
                        duration: toolDuration,
                        resultLength: result.length,
                    });
                    
                    metrics_.recordToolExecution(name, toolDuration, true);
                    addToolResult(sessionId, toolCall.id, result);
                    endSpan(toolSpan);
                } catch (err) {
                    const toolDuration = Date.now() - toolStartTime;
                    const msg = err instanceof Error ? err.message : "unknown error";
                    
                    log.error(`Tool error: ${name}`, err, {
                        correlationId,
                        toolName: name,
                        duration: toolDuration,
                    });
                    
                    metrics_.recordToolExecution(name, toolDuration, false, msg);
                    addToolResult(sessionId, toolCall.id, `Error executing tool: ${msg}`);
                    endSpanWithError(err as Error, undefined, toolSpan);
                }
            }
            
            endSpan(iterationSpan);
        }

        // Safety limit reached
        log.warn(`Agent hit max iterations`, {
            correlationId,
            sessionId,
            maxIterations,
            duration: Date.now() - iterationStartTime,
        });
        
        recordHistogram("agent_run_duration_ms", Date.now() - iterationStartTime);
        endSpan(agentSpan);
        endCorrelationContext();
        
        return {
            text:
                `⚠️ I reached the max tool-call limit (${maxIterations} iterations). ` +
                `Here's what I had so far:\n\n${collectedText.join("\n").trim()}`,
            toolCallCount: totalToolCalls,
            hitLimit: true,
        };
    } catch (error) {
        log.error(`Agent run failed`, error, { correlationId });
        endSpanWithError(error as Error, undefined, agentSpan);
        endCorrelationContext();
        throw error;
    }
}
```

---

## 2. WebSocket Events Integration

**File:** `src/channels/router.ts` or `src/server.ts`

### Track WebSocket connections:

```typescript
import { 
    generateCorrelationId, 
    startCorrelationContext,
    endCorrelationContext 
} from "./observability/correlation.ts";
import { startSpan, endSpan, endSpanWithError } from "./observability/tracing.ts";
import { metrics_ } from "./observability/metrics.ts";

// On WebSocket connection
wss.on("connection", (ws: any, req: any) => {
    const clientId = ws._socket.remoteAddress;
    const correlationId = generateCorrelationId();
    
    startCorrelationContext(correlationId, {
        clientId,
        type: "websocket",
    });
    
    log.info(`WebSocket connected`, {
        correlationId,
        clientId,
        totalClients: (wss as any).clients?.size || 0,
    });
    
    // Update gauge
    metrics_.setWebSocketClients((wss as any).clients?.size || 0);
    
    // Track message processing
    ws.on("message", async (data: any) => {
        const messageSpan = startSpan("ws.message", { clientId });
        const startTime = Date.now();
        
        try {
            const message = JSON.parse(data.toString());
            
            // Propagate correlation ID from message if present
            const msgCorrelationId = message.correlationId || correlationId;
            
            log.debug(`WebSocket message received`, {
                correlationId: msgCorrelationId,
                clientId,
                messageType: message.type,
            });
            
            // Process message...
            
            const latency = Date.now() - startTime;
            metrics_.recordMessageProcessing(latency, true, "websocket");
            endSpan(messageSpan);
        } catch (error) {
            const latency = Date.now() - startTime;
            log.error(`WebSocket message error`, error, { clientId });
            metrics_.recordMessageProcessing(latency, false, "websocket");
            endSpanWithError(error as Error, undefined, messageSpan);
        }
    });
    
    // On disconnect
    ws.on("close", () => {
        log.info(`WebSocket disconnected`, {
            correlationId,
            clientId,
            remainingClients: (wss as any).clients?.size || 0,
        });
        
        metrics_.setWebSocketClients((wss as any).clients?.size || 0);
        endCorrelationContext();
    });
    
    // Error handling
    ws.on("error", (error: any) => {
        log.error(`WebSocket error`, error, { clientId });
    });
});
```

---

## 3. Database Operations Integration

**File:** Any database query location (e.g., `src/db.ts`, `src/llm/orchestrator.ts`)

### Track database operations:

```typescript
import { startSpan, endSpan, endSpanWithError } from "./observability/tracing.ts";
import { metrics_ } from "./observability/metrics.ts";

function executeQuery<T>(
    query: string,
    params: any[] = [],
): T {
    const span = startSpan("db.query", {
        query: query.substring(0, 100),
        paramCount: params.length,
    });
    const startTime = Date.now();
    
    try {
        const stmt = db.prepare(query);
        const result = stmt.get(...params) as T;
        
        const latency = Date.now() - startTime;
        log.debug(`Database query successful`, {
            latency,
            query: query.substring(0, 50),
        });
        
        metrics_.recordDatabaseOperation("select", latency, true);
        endSpan(span);
        
        return result;
    } catch (error) {
        const latency = Date.now() - startTime;
        log.error(`Database query failed`, error, {
            query: query.substring(0, 50),
            latency,
        });
        
        metrics_.recordDatabaseOperation("select", latency, false);
        endSpanWithError(error as Error, undefined, span);
        throw error;
    }
}

// Or for batch operations:
export function recordConversationTurn(
    sessionId: string,
    role: "user" | "assistant",
    content: string,
    metadata?: Record<string, unknown>
): void {
    const span = startSpan("db.insert_message", {
        sessionId,
        role,
    });
    const startTime = Date.now();
    
    try {
        const stmt = db.prepare(`
            INSERT INTO conversation_history (session_id, role, content, metadata, created_at)
            VALUES (?, ?, ?, ?, datetime('now'))
        `);
        
        stmt.run(sessionId, role, content, metadata ? JSON.stringify(metadata) : null);
        
        const latency = Date.now() - startTime;
        metrics_.recordDatabaseOperation("insert", latency, true);
        endSpan(span);
    } catch (error) {
        const latency = Date.now() - startTime;
        log.error(`Failed to insert message`, error, {
            sessionId,
            latency,
        });
        
        metrics_.recordDatabaseOperation("insert", latency, false);
        endSpanWithError(error as Error, undefined, span);
        throw error;
    }
}
```

---

## 4. Memory System Integration

**File:** `src/memory/` operations

### Track memory operations:

```typescript
import { 
    startSpan, 
    endSpan, 
    endSpanWithError, 
    addSpanEvent 
} from "../observability/tracing.ts";
import { metrics_, recordHistogram } from "../observability/metrics.ts";
import { getCurrentCorrelationId } from "../observability/correlation.ts";

// In memory search function
async function searchMemory(
    sessionId: string,
    query: string,
    limit: number = 5
): Promise<MemoryItem[]> {
    const correlationId = getCurrentCorrelationId();
    const span = startSpan("memory.search", {
        sessionId,
        query: query.substring(0, 50),
        limit,
    });
    const startTime = Date.now();
    
    try {
        // Perform search...
        const results: MemoryItem[] = [];
        
        const latency = Date.now() - startTime;
        log.debug(`Memory search complete`, {
            correlationId,
            sessionId,
            query: query.substring(0, 30),
            resultCount: results.length,
            latency,
        });
        
        recordHistogram("memory_search_latency_ms", latency);
        addSpanEvent("search_completed", { resultCount: results.length });
        endSpan(span);
        
        return results;
    } catch (error) {
        const latency = Date.now() - startTime;
        log.error(`Memory search failed`, error, {
            correlationId,
            sessionId,
            latency,
        });
        
        recordHistogram("memory_search_latency_ms", latency);
        endSpanWithError(error as Error, undefined, span);
        throw error;
    }
}

// Update memory stats for metrics
export function updateMemoryStats(sessionId: string): void {
    try {
        const facts = db.prepare(
            "SELECT COUNT(*) as count FROM memory WHERE session_id = ? AND type = 'fact'"
        ).get(sessionId) as { count: number };
        
        const entities = db.prepare(
            "SELECT COUNT(*) as count FROM memory WHERE session_id = ? AND type = 'entity'"
        ).get(sessionId) as { count: number };
        
        metrics_.setMemoryStats(facts.count, entities.count);
    } catch (error) {
        log.warn(`Failed to update memory stats`, error, { sessionId });
    }
}
```

---

## 5. HTTP Request Middleware Integration

**File:** `src/server.ts`

### Add request logging middleware:

```typescript
import { 
    startCorrelationContext, 
    endCorrelationContext,
    extractCorrelationFromMessage 
} from "./observability/correlation.ts";
import { startSpan, endSpan, endSpanWithError } from "./observability/tracing.ts";
import { metrics_ } from "./observability/metrics.ts";

// Add middleware for request tracking
app.use((req: any, res: any, next: any) => {
    // Extract or generate correlation ID
    const correlationId = extractCorrelationFromMessage({ 
        [config.CORRELATION_ID_HEADER || "X-Correlation-ID"]: req.headers["x-correlation-id"] 
    }) || generateCorrelationId();
    
    startCorrelationContext(correlationId, {
        method: req.method,
        path: req.path,
        ip: req.ip,
    });
    
    // Add to request for downstream use
    (req as any).correlationId = correlationId;
    
    const span = startSpan("http.request", {
        method: req.method,
        path: req.path,
    });
    const startTime = Date.now();
    
    // Intercept response
    const originalSend = res.send;
    res.send = function(data: any) {
        const latency = Date.now() - startTime;
        const statusCode = res.statusCode || 500;
        
        log.info(`HTTP request`, {
            correlationId,
            method: req.method,
            path: req.path,
            statusCode,
            latency,
        });
        
        metrics_.recordRequest(req.path, statusCode, latency);
        
        if (statusCode >= 400) {
            endSpanWithError(new Error(`HTTP ${statusCode}`), undefined, span);
        } else {
            endSpan(span);
        }
        
        endCorrelationContext();
        
        return originalSend.call(this, data);
    };
    
    next();
});
```

---

## 6. Channel Integration (Telegram, WhatsApp, etc.)

**File:** `src/channels/router.ts`

### Track channel operations:

```typescript
import { 
    startCorrelationContext, 
    endCorrelationContext 
} from "../observability/correlation.ts";
import { startSpan, endSpan, endSpanWithError } from "../observability/tracing.ts";
import { metrics_ } from "../observability/metrics.ts";

export async function handleChannelMessage(
    platform: string,
    message: ChannelMessage
): Promise<void> {
    const correlationId = message.correlationId || generateCorrelationId();
    const { id: ctxId } = startCorrelationContext(correlationId, {
        platform,
        userId: message.userId,
        messageId: message.id,
    });
    
    const span = startSpan("channel.message", {
        platform,
        userId: message.userId,
    });
    const startTime = Date.now();
    
    try {
        log.info(`Channel message received`, {
            correlationId,
            platform,
            userId: message.userId,
            text: message.text?.substring(0, 50),
        });
        
        // Process message through agent
        const result = await runAgent({
            message: message.text,
            sessionId: message.userId,
            userId: message.userId,
            platform,
        });
        
        // Send response back
        await message.channel.sendMessage(message.userId, result.text, {
            correlationId,
        });
        
        const latency = Date.now() - startTime;
        log.info(`Channel message processed`, {
            correlationId,
            platform,
            latency,
            toolCalls: result.toolCallCount,
        });
        
        metrics_.recordMessageProcessing(latency, true, platform);
        endSpan(span);
    } catch (error) {
        const latency = Date.now() - startTime;
        log.error(`Channel message failed`, error, {
            correlationId,
            platform,
            latency,
        });
        
        metrics_.recordMessageProcessing(latency, false, platform);
        endSpanWithError(error as Error, undefined, span);
        
        // Send error message back
        await message.channel.sendMessage(
            message.userId,
            `Sorry, I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}`,
            { correlationId }
        );
    } finally {
        endCorrelationContext();
    }
}
```

---

## 7. Configuration & Environment Variables

### Add to `.env` or `.env.example`:

```bash
# Logging
LOG_LEVEL=info                          # debug, info, warn, error
LOG_FORMAT=pretty                       # pretty or json (pretty for dev, json for prod)
ENABLE_CALLER_INFO=false                # Include source file/line in logs

# Metrics
ENABLE_METRICS=true                     # Enable metric collection
ENABLE_METRICS_PERSISTENCE=false        # Persist metrics to SQLite
METRICS_RETENTION_HOURS=24              # How long to keep metrics

# Correlation & Tracing
CORRELATION_ID_HEADER=X-Correlation-ID # HTTP header for correlation IDs
ENABLE_TRACING=true                     # Enable distributed tracing

# OpenTelemetry (Optional)
OTEL_ENABLED=false                      # Enable OTEL export
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318  # OTEL collector endpoint
```

---

## 8. Health & Metrics Endpoints

### Available endpoints:

```bash
# Health check (comprehensive)
curl http://localhost:3000/api/health

# Prometheus metrics
curl http://localhost:3000/metrics

# JSON metrics
curl http://localhost:3000/api/metrics

# Specific trace
curl http://localhost:3000/api/traces/corr-1234567890-abc123

# WebSocket info
curl http://localhost:3000/api/ws-info
```

---

## 9. Agent Access to Metrics Tool

### Available in agent:

```typescript
// Get system metrics
const metrics = await agent.useTool("get_metrics", {
    metric_type: "summary"  // or "tools", "messages", "database", "memory"
});

// Example response:
{
    "type": "metrics_summary",
    "uptime_seconds": 3600,
    "total_requests": 245,
    "total_tool_calls": 1203,
    "total_errors": 12,
    "avg_tool_latency_ms": 145,
    "avg_message_latency_ms": 234,
    "tool_success_rate_percent": 98.9
}
```

---

## 10. JSON Logging Format

When `LOG_FORMAT=json`, logs are exported as:

```json
{
    "timestamp": "2026-03-04T10:30:45.123Z",
    "level": "info",
    "prefix": "agent",
    "message": "Agent run start",
    "context": {
        "correlationId": "corr-1234567890-abc123",
        "sessionId": "user-123",
        "messageLength": 256
    }
}
```

This makes logs easily parseable for centralized logging systems (CloudWatch, Datadog, etc.).

---

## 11. Performance Tips

1. **Correlation IDs**: Always propagate through async operations for traceability
2. **Sampling**: For high-volume systems, sample metrics collection (10-20% of requests)
3. **Retention**: Adjust `METRICS_RETENTION_HOURS` based on storage constraints
4. **JSON Format**: Use in production, pretty format in development
5. **Database**: Use `ENABLE_METRICS_PERSISTENCE=true` only if needed for long-term analysis

---

## 12. Example: Integration Checklist

- [ ] Enhanced `src/logger.ts` ✅
- [ ] Created `src/observability/correlation.ts` ✅
- [ ] Created `src/observability/metrics.ts` ✅
- [ ] Created `src/observability/tracing.ts` ✅
- [ ] Updated `src/config.ts` with observability settings ✅
- [ ] Updated `src/server.ts` with health & metrics endpoints ✅
- [ ] Created `src/tools/observability/metrics.ts` tool ✅
- [ ] Integrated logging into `src/agent.ts`
- [ ] Integrated logging into `src/channels/router.ts`
- [ ] Integrated logging into database operations
- [ ] Integrated logging into memory operations
- [ ] Added correlation ID middleware to HTTP requests
- [ ] Updated `.env` with new environment variables
- [ ] (Optional) Set up OTEL export
- [ ] (Optional) Add dashboard metrics display

---

## Next Steps

1. Start with the agent loop integration - it's the most impactful
2. Add WebSocket and HTTP middleware for request tracking
3. Integrate database operation tracking
4. Set up centralized log aggregation if desired
5. Monitor the `/api/health` and `/metrics` endpoints

All modules are production-ready and can be integrated incrementally!
