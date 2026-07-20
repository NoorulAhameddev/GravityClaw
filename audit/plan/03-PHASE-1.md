# Phase 1: Production Hardening (Weeks 2-3)

> **Goal:** Make the system production-deployable in single-tenant mode. Fix all HIGH-severity issues, add CI/CD, consolidate architecture.
> **Duration:** 2 weeks (parallel tracks)
> **Owner:** Backend Lead + DevOps Lead
> **Dependencies:** Phase 0 complete
> **Exit Criteria:** All security issues < CVSS 7.0. CI/CD passing. Server.ts decomposed. Single migration system. Monitoring operational.

---

## Track A: Security Hardening (Week 2)

### 1.1 Fix JWT implementation to be RFC-compliant [SEC-013]
**Effort:** 1 day | **Files:** `src/middleware/websocket-auth.ts`

**Problem:** Custom JWT uses `atob`/`btoa` (not base64url) and predictable HMAC key.

**Fix — Use proper JWT library or manual RFC implementation:**
```typescript
// Option A: Use jsonwebtoken library
import jwt from 'jsonwebtoken';

const JWT_ALGORITHM = 'HS256';
const JWT_EXPIRY = '24h';
const JWT_ISSUER = 'gravityclaw';

export function createSessionToken(sessionId: string, userId?: string): string {
    return jwt.sign(
        { sid: sessionId, uid: userId },
        config.JWT_SECRET || config.API_KEY,
        { 
            algorithm: JWT_ALGORITHM,
            expiresIn: JWT_EXPIRY, 
            issuer: JWT_ISSUER,
        }
    );
}

export function validateSessionToken(token: string): { sessionId: string; userId?: string } | null {
    try {
        const payload = jwt.verify(token, config.JWT_SECRET || config.API_KEY, {
            algorithms: [JWT_ALGORITHM],
            issuer: JWT_ISSUER,
        }) as jwt.JwtPayload;
        
        return { 
            sessionId: payload.sid as string, 
            userId: payload.uid as string,
        };
    } catch {
        return null;
    }
}
```

**Verification:** Generate token, verify it on another endpoint, check `jwt.io` for standard format.

---

### 1.2 Fix secrets cache invalidation [SEC-011]
**Effort:** 1 day | **File:** `src/secrets-runtime.ts`

**Problem:** Secrets never reload on MASTER_KEY change. Decrypted secrets persist in memory forever.

**Fix:**
```typescript
const cache: {
    loaded: boolean;
    masterKey: string;
    secrets: Map<string, string>;
    loadedAt: number;
} = {
    loaded: false,
    masterKey: "",
    secrets: new Map(),
    loadedAt: 0,
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function loadSecretsIntoCache(): Promise<void> {
    const currentKey = getMasterKey();
    const now = Date.now();
    
    // Reload if: never loaded, key changed, or TTL expired
    if (cache.loaded && 
        cache.masterKey === currentKey && 
        (now - cache.loadedAt) < CACHE_TTL_MS) {
        return;
    }
    
    cache.secrets.clear();
    cache.masterKey = currentKey;
    cache.loadedAt = now;
    cache.loaded = true;
    
    // ... existing decryption logic
}

// Add periodic cleanup
setInterval(() => {
    const now = Date.now();
    if (cache.loaded && (now - cache.loadedAt) > CACHE_TTL_MS * 2) {
        cache.loaded = false;
        cache.secrets.clear();
    }
}, CACHE_TTL_MS).unref();
```

**Verification:** Change MASTER_KEY, call `getSecret('test')`, confirm it uses new key.

---

### 1.3 Add bash sanitization to sandbox [SEC-012]
**Effort:** 2 days | **File:** `src/tools/sandbox.ts`

**Problem:** Bash execution mode has no sanitization.

**Fix:**
```typescript
case "bash":
    const sanitizedBash = sanitizeBashCode(code);
    tempFile = join(tempDir, "script.sh");
    writeFileSync(tempFile, sanitizedBash, "utf-8");
    // ... rest of execution

// Add sanitization function:
function sanitizeBashCode(code: string): string {
    let sanitized = code;
    
    // Block dangerous download-and-execute patterns
    sanitized = sanitized.replace(
        /(curl|wget|fetch)\s+.*?(\||;)\s*(sh|bash|chmod|./)/gi,
        "echo BLOCKED: download-execute chain"
    );
    
    // Block eval-like execution
    sanitized = sanitized.replace(
        /\b(eval|exec|source)\s+.*?(curl|wget|fetch)/gi,
        "echo BLOCKED: eval-exec chain"
    );
    
    // Block privilege escalation
    sanitized = sanitized.replace(/sudo\s+/g, "echo BLOCKED-sudo ");
    
    // Block raw device access
    sanitized = sanitized.replace(/>\s*\/dev\/(sd|nvme|mmc)/g, "> /dev/null");
    
    return sanitized;
}
```

---

### 1.4 Add rate limits + budget enforcement to swarm agents [SEC-007 / AI-003]
**Effort:** 5 days | **File:** `src/agents/swarm.ts`, `src/agent.ts`

**Problem:** Swarm agents bypass ALL safety controls.

**Fix — Route swarm agents through guarded execution:**
```typescript
// In swarm.ts, replace direct provider.chat() with:
private async executeAgentWithGuardrails(
    agentRole: SwarmAgent,
    task: string,
    sessionId: string,
): Promise<string> {
    // Check rate limits
    if (!this.rateLimiter.check(sessionId, `swarm:${agentRole.name}`)) {
        return "Error: Rate limit exceeded for swarm agent";
    }
    
    // Check daily budget
    if (!this.budgetTracker.check(sessionId)) {
        return "Error: Daily budget exceeded for swarm agent";
    }
    
    // Apply token budget
    const tokenBudget = this.tokenBudget.getRemaining(sessionId);
    if (tokenBudget < 100) {
        return "Error: Token budget exhausted";
    }
    
    // Execute with limits
    const truncatedTask = task.slice(0, 4000); // Limit input size
    const response = await provider.chat({
        messages: [
            { role: "system", content: agentRole.systemPrompt },
            { role: "user", content: truncatedTask },
        ],
        maxTokens: 500, // Limit output size
    });
    
    // Track usage
    this.usageTracker.record(sessionId, {
        provider: providerName,
        tokens: response.usage?.totalTokens ?? 0,
        cost: response.usage?.cost ?? 0,
    });
    
    return response.content;
}
```

**Also add iteration limits to prevent runaway swarms:**
```typescript
// In swarm execution loop:
const MAX_SWARM_ITERATIONS = 5;
let iterations = 0;

while (!allCompleted && iterations < MAX_SWARM_ITERATIONS) {
    iterations++;
    // ... execution logic
}
```

---

## Track B: Architecture Consolidation (Week 2-3)

### 1.5 Decompose server.ts into route modules [ARC-001]
**Effort:** 5 days | **Files:** `src/server.ts` → `src/routes/*.ts`

**Target structure:**
```
src/routes/
  health.ts       — /api/health, /api/ready, /api/live
  auth.ts         — /api/auth/token
  metrics.ts      — /metrics, /api/metrics, /api/traces
  webhooks.ts     — /webhook/:sid/:hook_name
  memory.ts       — /api/memory, /api/sessions
  tools.ts        — /api/tools, /api/tools/execute
  admin.ts        — /api/usage, /api/stats, /api/approvals
  scheduler.ts    — /api/scheduler/tasks
  webhooks-crud.ts — /api/webhooks
  swarms.ts       — /api/swarms
  workflows.ts    — /api/workflows
  heartbeats.ts   — /api/heartbeats
  voice.ts        — /api/voice/transcribe, /api/voice/speak
  export.ts       — /api/export/download
  mobile.ts       — /mobile/*
```

**Each route file exports a function that takes the Express app:**
```typescript
// src/routes/health.ts
import { Router } from "express";
import { healthAuthMiddleware } from "../middleware/health-auth.ts";
import { asyncHandler } from "../middleware/errorHandler.ts";

export function registerHealthRoutes(app: Router): void {
    const router = Router();
    
    router.get("/health", healthAuthMiddleware, asyncHandler(async (req, res) => {
        // ... existing health logic
    }));
    
    router.get("/ready", asyncHandler(async (req, res) => {
        // Readiness check — DB + LLM connectivity
        const dbOk = await checkDbConnectivity();
        res.json({ status: dbOk ? "ok" : "degraded", db: dbOk });
    }));
    
    router.get("/live", (_req, res) => {
        res.json({ status: "ok" });
    });
    
    app.use("/api", router);
}
```

**server.ts becomes wiring only (< 100 lines):**
```typescript
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { errorHandler } from "./middleware/errorHandler.ts";
import { registerHealthRoutes } from "./routes/health.ts";
import { registerAuthRoutes } from "./routes/auth.ts";
// ... etc

export function createServer() {
    const app = express();
    
    // Global middleware
    app.use(helmet());
    app.use(cors({ /* config */ }));
    app.use(compression());
    app.use(express.json({ limit: "10mb" }));
    
    // Routes
    registerHealthRoutes(app);
    registerAuthRoutes(app);
    registerMetricsRoutes(app);
    // ... etc
    
    // Error handler (must be last)
    app.use(errorHandler);
    
    return app;
}
```

**Verification:** All existing routes work identically. Run `npm run test:run` to verify.

---

### 1.6 Decompose runAgent() into pipeline [ARC-002]
**Effort:** 3 days | **Files:** `src/agent.ts` → `src/pipeline/*.ts`

**Target structure:**
```
src/pipeline/
  types.ts            — PipelineContext, Stage interfaces
  inputValidator.ts   — Validate and sanitize user input
  contextBuilder.ts   — Build history + system prompt with memory injection
  toolPicker.ts       — Select relevant tools for this turn
  llmCaller.ts        — Invoke the correct LLM provider
  outputValidator.ts  — Validate LLM output before returning
  toolExecutor.ts     — Execute tool calls (with parallel support)
  memoryWriter.ts     — Persist conversation + extract facts
  orchestrator.ts     — Compose pipeline stages into runAgent()
```

**Pipeline stage interface:**
```typescript
// src/pipeline/types.ts
export interface PipelineStage<I, O> {
    name: string;
    execute(context: PipelineContext, input: I): Promise<O>;
}

export interface PipelineContext {
    sessionId: string;
    userId: string;
    platform: string;
    config: AgentConfig;
    db: Database;
    provider: LLMProvider;
    executor: ToolExecutor;
    memory: MemoryManager;
    logger: Logger;
    metrics: MetricsCollector;
}

export class Pipeline {
    private stages: PipelineStage<any, any>[] = [];
    
    addStage(stage: PipelineStage<any, any>): this {
        this.stages.push(stage);
        return this;
    }
    
    async execute(context: PipelineContext, input: any): Promise<any> {
        let currentInput = input;
        for (const stage of this.stages) {
            const start = Date.now();
            try {
                currentInput = await stage.execute(context, currentInput);
                context.metrics.recordStage(stage.name, Date.now() - start);
            } catch (error) {
                context.metrics.recordStageError(stage.name, error);
                throw error;
            }
        }
        return currentInput;
    }
}
```

**Verification:** All existing agent behavior is preserved. Run integration tests.

---

### 1.7 Consolidate to single migration system [ARC-003 / DB-004]
**Effort:** 2 days | **Files:** `src/db/schema.ts`, `src/db/definitions.ts`, `src/db/postgres.ts`

**Problem:** Three diverging schema definitions.

**Fix:**
1. Audit all three schemas and create a unified canonical schema
2. Keep `src/db/definitions.ts` as the single source of truth
3. Remove `src/db/schema.ts` (old system)
4. Remove inline SQL migrations from `src/db/postgres.ts`
5. Make Postgres provider use the same migration runner as SQLite

**Canonical schema reconciliation:**
```typescript
// src/db/definitions.ts — unified schema (simplified example)
export const SCHEMA = {
    sessions: `
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            allow_messages INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `,
    memory: `
        CREATE TABLE IF NOT EXISTS memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            role TEXT NOT NULL DEFAULT 'user',
            content TEXT NOT NULL,
            message_json TEXT NOT NULL,
            timestamp TEXT NOT NULL DEFAULT (datetime('now')),
            settings TEXT DEFAULT '{}'
        )
    `,
    // ... all other tables
};
```

**Verification:** Run all migrations on both SQLite and Postgres. Confirm both produce identical schemas.

---

### 1.8 Add FK constraints to 12+ tables [DB-003]
**Effort:** 1 day | **File:** `src/db/definitions.ts`

**Add FK constraints to all session-scoped tables:**
```sql
ALTER TABLE memory ADD FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
ALTER TABLE usage ADD FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
ALTER TABLE fact_stats ADD FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
ALTER TABLE attachments ADD FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
ALTER TABLE agent_swarms ADD FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
ALTER TABLE workflows ADD FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
ALTER TABLE execution_plans ADD FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
ALTER TABLE background_tasks ADD FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
ALTER TABLE recommendation_events ADD FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
ALTER TABLE metrics ADD FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
ALTER TABLE group_settings ADD FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
ALTER TABLE group_sessions ADD FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
ALTER TABLE webhooks ADD FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
```

---

## Track C: DevOps & CI/CD (Week 2-3)

### 1.9 Set up CI/CD pipeline [ARC-006 / DEV-001]
**Effort:** 3 days | **File:** `.github/workflows/ci.yml`

```yaml
name: CI
on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run lint

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run build
        env:
          NODE_ENV: production

  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: ['20', '22']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '${{ matrix.node-version }}', cache: 'npm' }
      - run: npm ci
      - run: npm run test:run
        env:
          TELEGRAM_BOT_TOKEN: "0000000000:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
          TELEGRAM_ALLOWED_USER_ID: "123456789"
          LLM_PROVIDER: "mock"
          OPENROUTER_API_KEY: "sk-or-dummy"
          API_KEY: "ci-test-key-must-be-at-least-32-chars!!"
          UNRESTRICTED_ACCESS: "false"
          NODE_ENV: "test"
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results-${{ matrix.node-version }}
          path: test-results/

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - name: npm audit
        run: npm audit --audit-level=high
        continue-on-error: true
      - name: CodeQL Analysis
        uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript
      - uses: github/codeql-action/analyze@v3

  docker:
    runs-on: ubuntu-latest
    needs: [typecheck, lint, build, test]
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      - name: Build and export
        uses: docker/build-push-action@v5
        with:
          context: .
          load: true
          tags: gravityclaw:ci-${{ github.sha }}
      - name: Trivy scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: gravityclaw:ci-${{ github.sha }}
          format: sarif
          output: trivy-results.sarif
```

### 1.10 Multi-stage Docker build [DEV-003]
**Effort:** 2 days | **File:** `Dockerfile`

```dockerfile
# Build stage
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage
FROM node:20-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create non-root user
RUN groupadd -r appgroup && useradd -r -g appgroup -d /app -s /sbin/nologin appuser
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["tini", "--"]
CMD ["node", "--max-old-space-size=512", "dist/index.js"]
```

---

### 1.11 Add liveness/readiness probes [DEV-009]
**Effort:** 1 day | **File:** `src/routes/health.ts`

```typescript
// /api/live — simple process alive check
router.get("/live", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// /api/ready — checks dependencies
router.get("/ready", asyncHandler(async (_req, res) => {
    const checks = {
        database: false,
        llm: false,
    };
    
    try {
        db.prepare("SELECT 1").get();
        checks.database = true;
    } catch {}
    
    try {
        // Lightweight LLM provider check
        const provider = getDefaultProvider();
        checks.llm = provider !== null;
    } catch {}
    
    const allOk = Object.values(checks).every(Boolean);
    const statusCode = allOk ? 200 : 503;
    
    res.status(statusCode).json({
        status: allOk ? "ok" : "degraded",
        checks,
        timestamp: new Date().toISOString(),
    });
}));
```

---

### 1.12 Add error tracking integration [DEV-014]
**Effort:** 1 day

**Integrate Sentry or Highlight:**
```bash
npm install @sentry/node @sentry/profiling-node
```

```typescript
// In src/index.ts, after config validation:
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

if (config.SENTRY_DSN) {
    Sentry.init({
        dsn: config.SENTRY_DSN,
        integrations: [nodeProfilingIntegration()],
        tracesSampleRate: 0.1,
        profilesSampleRate: 0.1,
        environment: process.env.NODE_ENV || "development",
    });
    
    // Capture unhandled errors
    process.on("uncaughtException", (error) => {
        Sentry.captureException(error);
        shutdown("UNCAUGHT_EXCEPTION").finally(() => process.exit(1));
    });
    
    process.on("unhandledRejection", (reason) => {
        Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)));
    });
}
```

---

### 1.13 Consolidate telemetry systems [ARC-004 / FOR-003]
**Effort:** 2 days

**Decision:** Keep `src/lib/telemetry/` (OpenTelemetry SDK). Remove `src/observability/`.

**Steps:**
1. Audit all imports from `src/observability/` across the codebase
2. Replace with equivalent `src/lib/telemetry/` imports
3. Verify OpenTelemetry spans, metrics, and logs work correctly
4. Delete `src/observability/` directory
5. Update `src/index.ts` initialization

---

### 1.14 Mount or remove mobile gateway [ARC-005 / FOR-002]
**Effort:** 1 day

**Decision (choose one):**

**Option A — Mount on main server:**
```typescript
// In src/server.ts
import { mobileGateway } from "./gateway/mobile.ts";
app.use('/mobile', mobileGateway.getExpressApp());
```

**Option B — Delete (if not needed):**
```
Delete src/gateway/mobile.ts
Remove all imports and config references
```

---

## Phase 1 Exit Checklist

- [ ] SEC-013: JWT RFC-compliant
- [ ] SEC-011: Secrets cache invalidates properly
- [ ] SEC-012: Bash sandbox sanitized
- [ ] SEC-007: Swarm agent safety controls
- [ ] ARC-001: server.ts decomposed into route modules
- [ ] ARC-002: runAgent() extracted into pipeline
- [ ] ARC-003: Single migration system
- [ ] DB-003: FK constraints on 12+ tables
- [ ] ARC-006: CI/CD pipeline passing
- [ ] DEV-003: Multi-stage Docker build
- [ ] DEV-009: Liveness/readiness probes
- [ ] DEV-014: Error tracking integrated
- [ ] ARC-004: Telemetry consolidated
- [ ] ARC-005: Mobile gateway resolved
- [ ] All P0-CRITICAL and P1-HIGH issues addressed

**Verification Run:**
```bash
# Full CI pipeline
npm run typecheck && npm run lint && npm run build && npm run test:run

# Docker build
docker build -t gravityclaw:test .
docker run -p 3000:3000 gravityclaw:test

# Verify routes
curl http://localhost:3000/api/v1/health
curl http://localhost:3000/api/ready
curl http://localhost:3000/api/live

# Security scan
trivy image gravityclaw:test
npm audit --audit-level=high
```
