# Phase 3: Scale & Polish (Weeks 6-8)

> **Goal:** Fix all performance bottlenecks, add streaming, remove Telegram hard dependency, build CLI onboarding. Elevate Performance score from 2/10 → 7/10, PM-Fit score from 7/10 → 9/10.
> **Duration:** 3 weeks (parallel tracks)
> **Owner:** Backend Lead + Fullstack Developer + ML Engineer
> **Dependencies:** Phase 1 + 2 complete (vulnerabilities fixed, tests passing, CI/CD stable)
> **Exit Criteria:** All P2-MEDIUM issues addressed. P95 latency < 3s. Streaming operational. CLI standalone.

---

## Track A: Performance (Week 6)

### 3.1 Replace O(n) LRU cache with O(1) [PERF-001]
**Effort:** 2 days | **File:** `src/lib/cache.ts`

**Problem:** Current LRU uses `Array.splice()` — O(n) on every insert for large caches.

```typescript
// BEFORE — O(n) splice
class LRUCache<T> {
    private items: Array<{ key: string; value: T }> = [];
    
    get(key: string): T | undefined {
        const idx = this.items.findIndex(i => i.key === key); // O(n)
        if (idx === -1) return undefined;
        const [item] = this.items.splice(idx, 1); // O(n)
        this.items.push(item); // O(1) amortized... but only after O(n) splice
        return item.value;
    }
    
    set(key: string, value: T): void {
        const idx = this.items.findIndex(i => i.key === key);
        if (idx >= 0) this.items.splice(idx, 1);
        this.items.push({ key, value });
        if (this.items.length > this.maxSize) this.items.shift(); // O(n)
    }
}
```

**Fix — Use Map (ES6) which preserves insertion order:**
```typescript
// AFTER — O(1) LRU using Map
class LRUCache<T> {
    private map = new Map<string, T>();
    
    constructor(private maxSize: number) {}
    
    get(key: string): T | undefined {
        if (!this.map.has(key)) return undefined;
        const value = this.map.get(key)!;
        // Delete and re-insert to mark as recently used
        this.map.delete(key);
        this.map.set(key, value);
        return value;
    }
    
    set(key: string, value: T): void {
        // Delete first if exists to update position
        this.map.delete(key);
        this.map.set(key, value);
        // Evict least recently used (first inserted)
        if (this.map.size > this.maxSize) {
            const lruKey = this.map.keys().next().value;
            if (lruKey !== undefined) this.map.delete(lruKey);
        }
    }
    
    has(key: string): boolean {
        return this.map.has(key);
    }
    
    delete(key: string): boolean {
        return this.map.delete(key);
    }
    
    clear(): void {
        this.map.clear();
    }
    
    get size(): number {
        return this.map.size;
    }
}
```

**Verification:** Benchmark with 10,000 operations — should be 100-1000x faster.

---

### 3.2 Replace sequential tool execution with parallel [PERF-002]
**Effort:** 3 days | **File:** `src/tools/executor.ts`

**Problem:** Parallel-eligible tool calls execute sequentially.

**Fix:**
```typescript
async executeParallel(toolCalls: ToolCall[], context: ToolContext): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    const confirmed: string[] = [];
    
    // Phase 1: Categorize tool calls
    const { sequential, parallel } = this.categorizeToolCalls(toolCalls);
    
    // Phase 2: Execute batch-confirmations up front
    const needsConfirmation = [...sequential, ...parallel].filter(
        tc => this.requiresConfirmation(tc.name)
    );
    if (needsConfirmation.length > 0) {
        const approved = await this.requestBatchConfirmation(needsConfirmation, context);
        confirmed.push(...approved);
    }
    
    // Phase 3: Execute parallel batch
    const parallelResults = await Promise.allSettled(
        parallel.map(tc => this.executeSingle(tc, context))
    );
    
    // Phase 4: Execute sequential (includes dependencies)
    for (const tc of sequential) {
        const result = await this.executeSingle(tc, context);
        results.push(result);
    }
    
    return this.mergeResults(parallelResults, results);
}

private categorizeToolCalls(toolCalls: ToolCall[]): {
    sequential: ToolCall[];
    parallel: ToolCall[];
} {
    const sequential: ToolCall[] = [];
    const parallel: ToolCall[] = [];
    
    for (const tc of toolCalls) {
        const def = this.registry.get(tc.name);
        if (!def || def.requiresSequential || def.hasSideEffects) {
            sequential.push(tc);
        } else {
            parallel.push(tc);
        }
    }
    
    return { sequential, parallel };
}
```

**Performance targets:**
- 5 parallel tool calls: 5x speedup (1 round-trip vs 5)
- Batch confirmation: saves 4 confirmation prompts
- Cancellation: first error cancels remaining parallel calls

---

### 3.3 Add LLM response cache eviction [PERF-003]
**Effort:** 2 days | **File:** `src/llm/cache.ts`

**Problem:** Unbounded LLM response cache — memory leak under sustained load.

**Fix — Add TTL + LRU eviction:**
```typescript
interface CacheEntry {
    response: string;
    cachedAt: number;
    accessCount: number;
    tokenCount: number;
}

class LLMResponseCache {
    private cache = new Map<string, CacheEntry>();
    private maxEntries: number;
    private ttlMs: number;
    private maxMemoryBytes: number;
    private currentMemoryBytes: number = 0;
    
    constructor(config: {
        maxEntries?: number;
        ttlMs?: number;
        maxMemoryMb?: number;
    } = {}) {
        this.maxEntries = config.maxEntries || 1000;
        this.ttlMs = config.ttlMs || 3600_000; // 1 hour
        this.maxMemoryBytes = (config.maxMemoryMb || 100) * 1024 * 1024;
    }
    
    get(key: string): string | undefined {
        const entry = this.cache.get(key);
        if (!entry) return undefined;
        if (Date.now() - entry.cachedAt > this.ttlMs) {
            this.cache.delete(key);
            this.currentMemoryBytes -= entry.tokenCount * 4; // rough estimate
            return undefined;
        }
        entry.accessCount++;
        // Move to end (most recently used)
        this.cache.delete(key);
        this.cache.set(key, entry);
        return entry.response;
    }
    
    set(key: string, response: string, tokenCount: number): void {
        // Evict if at capacity
        while (this.cache.size >= this.maxEntries || 
               this.currentMemoryBytes + tokenCount * 4 > this.maxMemoryBytes) {
            this.evictLru();
        }
        
        this.cache.set(key, {
            response,
            cachedAt: Date.now(),
            accessCount: 0,
            tokenCount,
        });
        this.currentMemoryBytes += tokenCount * 4;
    }
    
    private evictLru(): void {
        const lruKey = this.cache.keys().next().value;
        if (lruKey !== undefined) {
            const entry = this.cache.get(lruKey)!;
            this.currentMemoryBytes -= entry.tokenCount * 4;
            this.cache.delete(lruKey);
        }
    }
}
```

---

### 3.4 Fix SHA-1 blocking event loop [PERF-004]
**Effort:** 1 day | **File:** `src/lib/utils.ts`

**Problem:** Synchronous SHA-1 blocks event loop during secret derivation (heavy usage).

**Fix — Use async crypto:**
```typescript
// Before (synchronous, blocks event loop)
function hashSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
}

// After (async, non-blocking)
async function hashSecret(secret: string, iterations: number = 100000): Promise<string> {
    return new Promise((resolve, reject) => {
        const key = crypto.subtle ? undefined : secret;
        
        if (typeof crypto.subtle?.pbkdf2 === 'function') {
            // Browser/Node 20+ native async
            const encoder = new TextEncoder();
            crypto.subtle.importKey(
                'raw', encoder.encode(secret), 'PBKDF2', false, ['deriveBits']
            ).then(key =>
                crypto.subtle.deriveBits(
                    { name: 'PBKDF2', salt: encoder.encode('gravityclaw'), iterations, hash: 'SHA-256' },
                    key, 256
                )
            ).then(buffer => {
                const hash = Array.from(new Uint8Array(buffer))
                    .map(b => b.toString(16).padStart(2, '0')).join('');
                resolve(hash);
            }).catch(reject);
        } else {
            // Fallback: use worker_threads to offload
            const { Worker } = require('worker_threads');
            // ... Worker-based SHA
            resolve(createHash('sha256').update(secret).digest('hex')); // temp
        }
    });
}
```

---

### 3.5 Replace fuzzy logic search with BM25 [PERF-005]
**Effort:** 3 days | **File:** `src/memory/search.ts`

**Problem:** O(n) fuzzy matching on every memory query — degrades as memory grows.

**Fix — BM25 scoring + trigram index:**
```typescript
interface TermFrequency {
    [term: string]: number;
}

class BM25Search {
    private documents: Map<number, { text: string; terms: Map<string, number> }> = new Map();
    private documentFrequency: Map<string, number> = new Map();
    private k1: number = 1.5;
    private b: number = 0.75;
    private avgDocLength: number = 0;
    private totalDocs: number = 0;
    
    index(id: number, text: string): void {
        const terms = this.tokenize(text);
        const termCount = terms.size;
        
        // Update avg doc length
        this.avgDocLength = (
            (this.avgDocLength * this.totalDocs) + termCount
        ) / (this.totalDocs + 1);
        this.totalDocs++;
        
        // Update document frequency for each term
        for (const term of terms.keys()) {
            this.documentFrequency.set(
                term, 
                (this.documentFrequency.get(term) || 0) + 1
            );
        }
        
        this.documents.set(id, { text, terms });
    }
    
    search(query: string, topK: number = 10): Array<{ id: number; score: number; text: string }> {
        const queryTerms = this.tokenize(query);
        const scores: Array<{ id: number; score: number }> = [];
        
        for (const [docId, doc] of this.documents) {
            let score = 0;
            const docLength = doc.terms.size;
            
            for (const queryTerm of queryTerms.keys()) {
                const tf = doc.terms.get(queryTerm) || 0;
                if (tf === 0) continue;
                
                const df = this.documentFrequency.get(queryTerm) || 0;
                const idf = Math.log(
                    (this.totalDocs - df + 0.5) / (df + 0.5) + 1
                );
                
                const numerator = tf * (this.k1 + 1);
                const denominator = tf + this.k1 * (
                    1 - this.b + this.b * (docLength / this.avgDocLength)
                );
                
                score += idf * (numerator / denominator);
            }
            
            if (score > 0) {
                scores.push({ id: docId, score });
            }
        }
        
        // Sort by score descending
        scores.sort((a, b) => b.score - a.score);
        
        return scores.slice(0, topK).map(s => ({
            id: s.id,
            score: s.score,
            text: this.documents.get(s.id)!.text,
        }));
    }
    
    private tokenize(text: string): Map<string, number> {
        const terms = new Map<string, number>();
        const normalized = text.toLowerCase().replace(/[^\w\s]/g, ' ');
        for (const word of normalized.split(/\s+/)) {
            if (word.length < 2) continue;
            terms.set(word, (terms.get(word) || 0) + 1);
        }
        return terms;
    }
}
```

**Verification:** Memory search should be sub-10ms for 10,000 entries (vs current ~500ms for 1,000).

---

## Track B: Product Polish (Week 7)

### 3.6 Implement streaming support [PM-003]
**Effort:** 5 days | **Files:** `src/llm/streaming.ts`, `src/routes/chat.ts`

**Problem:** No streaming support — users wait for full response.

```typescript
// src/llm/streaming.ts
export interface StreamChunk {
    type: "text" | "tool_call" | "error" | "done";
    content?: string;
    toolCall?: ToolCall;
    error?: string;
}

export async function* streamResponse(
    messages: Message[],
    config: ChatConfig,
    options: StreamOptions = {}
): AsyncGenerator<StreamChunk> {
    const provider = getProvider(config.provider);
    
    try {
        for await (const chunk of provider.stream(messages, config)) {
            if (chunk.type === "text") {
                yield { type: "text", content: chunk.content };
            }
        }
        yield { type: "done" };
    } catch (error) {
        yield { type: "error", error: String(error) };
    }
}
```

**Server-sent events endpoint:**
```typescript
// src/routes/chat.ts
router.post("/chat/stream", authMiddleware, asyncHandler(async (req, res) => {
    const { messages, config } = req.body;
    
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
    });
    
    try {
        for await (const chunk of streamResponse(messages, config)) {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
    } catch (error) {
        res.write(`data: ${JSON.stringify({ type: "error", error: String(error) })}\n\n`);
    } finally {
        res.write("data: [DONE]\n\n");
        res.end();
    }
}));
```

---

### 3.7 Remove Telegram hard dependency [PM-004]
**Effort:** 3 days | **File:** `src/config.ts`, `src/index.ts`

**Problem:** .env.example has 349 lines, Telegram is required even for CLI-only use.

**Fix:**

1. Make all Telegram config optional:
```typescript
export const config = {
    telegram: {
        botToken: env.TELEGRAM_BOT_TOKEN, // Can be undefined
        allowedUserId: env.TELEGRAM_ALLOWED_USER_ID,
        enabled: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_ALLOWED_USER_ID),
    },
    // ...
};

// In initialization:
if (config.telegram.enabled) {
    await startTelegramBot();
    logger.info("Telegram bot started");
} else {
    logger.info("Telegram bot disabled (no TELEGRAM_BOT_TOKEN)");
}
```

2. Create minimal `.env.example`:
```bash
# === REQUIRED ===
API_KEY=your-api-key-min-32-chars!!!!!!!
LLM_PROVIDER=anthropic

# === AI PROVIDER (pick one) ===
ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
# OPENROUTER_API_KEY=sk-or-...

# === OPTIONAL ===
# TELEGRAM_BOT_TOKEN=... (for Telegram integration only)
# DATABASE_URL=postgres://... (defaults to SQLite)
```

---

### 3.8 Build CLI onboarding wizard [PM-002]
**Effort:** 4 days | **File:** `src/cli/init.ts`

```typescript
import * as p from "@clack/prompts";
import { highlight } from "cli-highlight";

export async function initWizard() {
    console.log(bold("🔧 GravityClaw Setup Wizard\n"));
    console.log("This will guide you through first-time setup.\n");
    
    const project = await p.group({
        name: () => p.text({
            message: "Project name",
            defaultValue: "my-agent",
        }),
        provider: () => p.select({
            message: "Default LLM provider",
            options: [
                { value: "anthropic", label: "Anthropic Claude", hint: "recommended" },
                { value: "openai", label: "OpenAI GPT-4" },
                { value: "openrouter", label: "OpenRouter (multi-provider)" },
            ],
        }),
        apiKey: () => p.password({
            message: "API key for selected provider",
            validate: (v) => v.length < 32 ? "Key must be 32+ characters" : undefined,
        }),
        features: () => p.multiselect({
            message: "Enable features",
            options: [
                { value: "telegram", label: "Telegram bot", hint: "requires TELEGRAM_BOT_TOKEN" },
                { value: "postgres", label: "PostgreSQL database", hint: "requires DATABASE_URL" },
                { value: "memory", label: "Persistent memory/search" },
                { value: "webhooks", label: "Webhook support" },
            ],
        }),
    }, {
        onCancel: () => {
            p.cancel("Setup cancelled");
            process.exit(0);
        },
    });
    
    // Generate .env file
    const envContent = generateEnvFile(project);
    writeFileSync(".env", envContent);
    
    console.log(`\n${green("✓")} Created .env\n`);
    console.log("Next steps:");
    console.log("  npm run dev    # Start development server");
}
```

---

### 3.9 Add React Router with lazy loading [FE-003]
**Effort:** 2 days | **File:** `dashboard/src/App.tsx`

```typescript
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Layout } from "./components/Layout";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { ErrorBoundary } from "./components/ErrorBoundary";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Sessions = lazy(() => import("./pages/Sessions"));
const Settings = lazy(() => import("./pages/Settings"));
const Analytics = lazy(() => import("./pages/Analytics"));

const router = createBrowserRouter([
    {
        path: "/",
        element: <Layout />,
        errorElement: <ErrorBoundary />,
        children: [
            { index: true, element: <Dashboard /> },
            { path: "sessions", element: <Sessions /> },
            { path: "settings", element: <Settings /> },
            { path: "analytics", element: <Analytics /> },
        ],
    },
]);

export function App() {
    return (
        <Suspense fallback={<LoadingSpinner />}>
            <RouterProvider router={router} />
        </Suspense>
    );
}
```

---

### 3.10 Add WCAG ARIA attributes [FE-006]
**Effort:** 2 days | **Files:** Dashboard component files

**Checklist per component:**
- [ ] All interactive elements have `aria-label` or `aria-labelledby`
- [ ] Form inputs have associated `<label>` elements or `aria-label`
- [ ] Dynamic content uses `aria-live` regions
- [ ] Navigation uses `aria-current="page"`
- [ ] Modals use `role="dialog"` + `aria-modal="true"`
- [ ] Error messages use `role="alert"`
- [ ] Tab panels use `role="tablist"`, `role="tab"`, `role="tabpanel"`

**Example implementation:**
```typescript
<button 
    onClick={handleSend}
    aria-label="Send message"
    disabled={isLoading}
>
    {isLoading ? (
        <span aria-hidden="true" class="spinner" />
    ) : (
        <SendIcon aria-hidden="true" />
    )}
    <span class="sr-only">Send</span>
</button>

<aside role="complementary" aria-label="Session sidebar">
    {/* sidebar content */}
</aside>

<div role="region" aria-live="polite" aria-label="Chat messages">
    {messages.map(msg => (
        <div role="log" aria-label={`Message from ${msg.role}`}>
            {msg.content}
        </div>
    ))}
</div>
```

---

## Track C: Monitoring & Reliability (Week 8)

### 3.11 Add structured logging throughout [DEV-013]
**Effort:** 2 days

**Implement pino or winston:**
```typescript
import pino from "pino";

export const logger = pino({
    level: process.env.LOG_LEVEL || "info",
    transport: process.env.NODE_ENV === "development"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
    serializers: {
        req: (req) => ({
            method: req.method,
            url: req.url,
            sessionId: req.headers["x-session-id"],
        }),
        err: pino.stdSerializers.err,
    },
    redact: {
        paths: ["req.headers.authorization", "req.headers['x-api-key']", "body.apiKey"],
        censor: "[REDACTED]",
    },
});
```

**Usage pattern:**
```typescript
// Before
console.log(`Agent response: ${response.slice(0, 100)}...`);

// After
logger.info({ sessionId, responseLength: response.length }, "Agent response generated");
```

---

### 3.12 Add Prometheus metrics endpoint [DEV-005]
**Effort:** 2 days

```typescript
import prometheus from "prom-client";

// Create registry
const register = new prometheus.Registry();
prometheus.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new prometheus.Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "route", "status"],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    registers: [register],
});

const llmTokenUsage = new prometheus.Counter({
    name: "llm_tokens_total",
    help: "Total LLM tokens used",
    labelNames: ["provider", "model", "type"],
    registers: [register],
});

const activeConnections = new prometheus.Gauge({
    name: "active_connections",
    help: "Number of active WebSocket connections",
    registers: [register],
});

// Track request duration middleware
app.use((req, res, next) => {
    const end = httpRequestDuration.startTimer();
    res.on("finish", () => {
        end({ method: req.method, route: req.route?.path || "unknown", status: res.statusCode });
    });
    next();
});

// Metrics endpoint
app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", register.contentType);
    res.send(await register.metrics());
});
```

---

### 3.13 Add admin dashboard backend APIs [PM-006]
**Effort:** 3 days | **Files:** `src/routes/admin.ts`

```typescript
// Admin dashboard APIs
router.get("/admin/sessions/count", adminAuth, asyncHandler(async (req, res) => {
    const { period = "24h" } = req.query;
    const count = await db.get("SELECT COUNT(*) as count FROM sessions WHERE created_at > datetime('now', ?)", [
        `-${period}`,
    ]);
    res.json({ count: count.count, period });
}));

router.get("/admin/usage/summary", adminAuth, asyncHandler(async (req, res) => {
    const summary = await db.all(`
        SELECT 
            COUNT(*) as total_requests,
            SUM(tokens_in) as total_tokens_in,
            SUM(tokens_out) as total_tokens_out,
            SUM(CAST(cost_cents AS INTEGER)) as total_cost_cents
        FROM usage 
        WHERE created_at > datetime('now', '-24 hours')
    `);
    res.json(summary[0]);
}));

router.get("/admin/system/health", adminAuth, asyncHandler(async (req, res) => {
    const [dbOk, llmOk, memUsage] = await Promise.all([
        checkDbConnectivity(),
        checkLlmConnectivity(),
        getMemoryUsage(),
    ]);
    
    res.json({
        status: dbOk && llmOk ? "healthy" : "degraded",
        database: dbOk ? "connected" : "error",
        llm: llmOk ? "available" : "unavailable",
        memory: memUsage,
        uptime: process.uptime(),
    });
}));
```

---

### 3.14 Mobile gateway integration (if kept) [BACK-010]
**Effort:** 3 days

If mobile gateway was kept (from Phase 1.14), integrate with main auth and telemetry:
```typescript
// In mobile gateway, use same middleware
import { authMiddleware } from "../middleware/auth.ts";
import { telemetryMiddleware } from "../lib/telemetry/middleware.ts";

class MobileGateway {
    getExpressApp() {
        const app = Router();
        app.use(authMiddleware); // Use shared auth
        app.use(telemetryMiddleware); // Use shared telemetry
        // ... routes
        return app;
    }
}
```

---

## Phase 3 Exit Checklist

- [ ] PERF-001: O(1) LRU cache (Map-based)
- [ ] PERF-002: Parallel tool execution
- [ ] PERF-003: LLM response cache eviction (TTL + LRU)
- [ ] PERF-004: Async SHA-1 (non-blocking)
- [ ] PERF-005: BM25 memory search
- [ ] PM-003: Streaming support (SSE)
- [ ] PM-004: Telegram dependency optional
- [ ] PM-002: CLI init wizard
- [ ] FE-003: React Router with lazy loading
- [ ] FE-006: WCAG ARIA attributes
- [ ] DEV-013: Structured logging (pino)
- [ ] DEV-005: Prometheus metrics endpoint
- [ ] PM-006: Admin dashboard APIs
- [ ] BACK-010: Mobile gateway integrated (or deleted)
- [ ] Performance score: 2/10 → 7/10
- [ ] PM-Fit score: 7/10 → 9/10
- [ ] P95 latency < 3s under load

**Verification Run:**
```bash
# Load test (10 concurrent users, 100 requests)
npx autocannon -c 10 -d 30 http://localhost:3000/api/v1/chat

# Cache benchmark
node -e "
    const cache = new LRUCache(10000);
    console.time('set');
    for (let i = 0; i < 10000; i++) cache.set('key' + i, i);
    console.timeEnd('set'); // Should be < 5ms
    console.time('get');
    for (let i = 0; i < 10000; i++) cache.get('key' + i);
    console.timeEnd('get'); // Should be < 3ms
"

# Streaming test
curl -N http://localhost:3000/api/v1/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}],"config":{"provider":"openai"}}'

# Prometheus metrics
curl http://localhost:3000/metrics | head -20

# Memory search benchmark
node -e "
    const search = new BM25Search();
    for (let i = 0; i < 10000; i++) search.index(i, 'document text ' + i);
    console.time('search');
    const results = search.search('document text');
    console.timeEnd('search'); // Should be < 10ms
"
```
