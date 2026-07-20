# Phase 4: Enterprise Readiness (Weeks 9-12)

> **Goal:** Horizontal scaling, SSO/SAML/RBAC, zero-downtime deploys, multi-tenant isolation, SOC2 controls, public SDK. Elevate Production Readiness score from 4.5/10 → 9/10, DevOps score from 5/10 → 9/10.
> **Duration:** 4 weeks (parallel tracks)
> **Owner:** Platform Lead + SRE + Solutions Architect
> **Dependencies:** Phase 1-3 complete (all P0-P2 issues resolved, streaming operational, monitoring in place)
> **Exit Criteria:** Multi-tenant isolation validated. SSO operational. Horizontal scale-out tested. SOC2 control mapping complete. Public SDK published.

---

## Track A: Architecture & Scaling (Week 9-10)

### 4.1 Horizontal scaling with stateless design
**Effort:** 5 days

**Problem:** Current architecture assumes single-process, single-server.

**Changes required:**

1. **Externalize session state to Redis:**
```typescript
// src/lib/session-store.ts
import { createClient, RedisClientType } from "redis";

export class RedisSessionStore {
    private client: RedisClientType;
    
    constructor(url: string = process.env.REDIS_URL || "redis://localhost:6379") {
        this.client = createClient({ url });
    }
    
    async get(sessionId: string): Promise<Session | null> {
        const data = await this.client.get(`session:${sessionId}`);
        return data ? JSON.parse(data) : null;
    }
    
    async set(sessionId: string, session: Session, ttl: number = 3600): Promise<void> {
        await this.client.setEx(`session:${sessionId}`, ttl, JSON.stringify(session));
    }
    
    async delete(sessionId: string): Promise<void> {
        await this.client.del(`session:${sessionId}`);
    }
}
```

2. **Make file-based storage pluggable:**
```typescript
interface StorageBackend {
    read(key: string): Promise<Buffer | null>;
    write(key: string, data: Buffer): Promise<void>;
    delete(key: string): Promise<void>;
    list(prefix: string): Promise<string[]>;
}

class S3Storage implements StorageBackend {
    constructor(private bucket: string, private prefix: string) {}
    
    async read(key: string): Promise<Buffer | null> {
        // S3 getObject
    }
    
    async write(key: string, data: Buffer): Promise<void> {
        // S3 putObject
    }
    
    async delete(key: string): Promise<void> {
        // S3 deleteObject
    }
    
    async list(prefix: string): Promise<string[]> {
        // S3 listObjects
    }
}
```

3. **Stateless WebSocket routing:**
```typescript
// Use Redis pub/sub for cross-instance message routing
class WebSocketManager {
    private connections = new Map<string, WebSocket>();
    private redis: RedisClientType;
    
    constructor() {
        this.redis = createClient();
        this.redis.subscribe("ws:messages", (message) => {
            const { sessionId, payload } = JSON.parse(message);
            const ws = this.connections.get(sessionId);
            if (ws) ws.send(JSON.stringify(payload));
        });
    }
    
    async route(sessionId: string, payload: any): Promise<void> {
        const ws = this.connections.get(sessionId);
        if (ws) {
            ws.send(JSON.stringify(payload));
        } else {
            // Publish to Redis — another instance may have the connection
            await this.redis.publish("ws:messages", JSON.stringify({ sessionId, payload }));
        }
    }
}
```

---

### 4.2 Multi-tenant isolation [ENT-001]
**Effort:** 5 days

**Problem:** No tenant isolation — all users share same database and config.

**Isolation model:**
```
Level 1: Row-level (cheapest)
  - All tenants share schema
  - Each table has tenant_id column
  - RLS policies on Postgres
  - Row-level security middleware on every query

Level 2: Schema-per-tenant (medium)
  - Each tenant gets a dedicated schema
  - Same table definitions, separate namespace
  - Connection pool routes by tenant header

Level 3: Database-per-tenant (most isolated)
  - Each tenant gets a dedicated database
  - Separate connection pool per tenant
  - Used for highest-compliance customers
```

**Recommended: Hybrid approach (Level 1 default, Level 3 for enterprise):**

```typescript
// src/middleware/tenant.ts
export function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
    const tenantId = req.headers["x-tenant-id"] as string;
    
    if (!tenantId) {
        return res.status(401).json({ error: "X-Tenant-Id header required" });
    }
    
    // Attach tenant context to request
    req.tenant = {
        id: tenantId,
        isolation: getTenantIsolationLevel(tenantId),
        db: getTenantDb(tenantId), // Returns proxy that adds tenant_id to queries
    };
    
    next();
}

// Row-level security via query proxy
class TenantAwareDb {
    constructor(private db: Database, private tenantId: string) {}
    
    all(sql: string, params: any[] = []): any[] {
        // Automatically inject tenant_id filter
        const tenantAwareSql = injectTenantFilter(sql, this.tenantId);
        return this.db.all(tenantAwareSql, params);
    }
    
    get(sql: string, params: any[] = []): any {
        const tenantAwareSql = injectTenantFilter(sql, this.tenantId);
        return this.db.get(tenantAwareSql, params);
    }
}
```

**Tenant management APIs:**
```typescript
// src/routes/admin/tenants.ts
router.post("/admin/tenants", superAdminAuth, asyncHandler(async (req, res) => {
    const { name, isolationLevel, maxSessions, maxUsers } = req.body;
    
    const tenant = await createTenant({
        name,
        isolationLevel: isolationLevel || "row",
        maxSessions: maxSessions || 1000,
        maxUsers: maxUsers || 50,
    });
    
    res.status(201).json(tenant);
}));

router.get("/admin/tenants/:id/usage", adminAuth, asyncHandler(async (req, res) => {
    const usage = await db.all(`
        SELECT 
            date(created_at) as day,
            COUNT(*) as requests,
            SUM(tokens) as tokens
        FROM usage 
        WHERE tenant_id = ?
        AND created_at > datetime('now', '-30 days')
        GROUP BY date(created_at)
    `, [req.params.id]);
    
    res.json(usage);
}));
```

**Verification:** Tenant A cannot access Tenant B data via any API. RBAC policies enforce separation.

---

### 4.3 SSO/SAML/OIDC integration [ENT-002]
**Effort:** 5 days

```typescript
// npm install passport passport-saml @node-saml/passport-saml openid-client

// src/auth/sso.ts
import passport from "passport";
import { Strategy as SamlStrategy } from "@node-saml/passport-saml";
import { Strategy as OidcStrategy } from "openid-client";

export function configureSSO(app: Express) {
    app.use(passport.initialize());
    
    // SAML (Azure AD, Okta, OneLogin)
    if (config.saml.enabled) {
        passport.use(new SamlStrategy({
            entryPoint: config.saml.entryPoint,
            issuer: config.saml.issuer,
            callbackUrl: config.saml.callbackUrl,
            cert: config.saml.cert,
        }, (profile, done) => {
            const user = mapSamlProfile(profile);
            done(null, user);
        }));
    }
    
    // OIDC (Google, GitHub, Auth0)
    if (config.oidc.enabled) {
        passport.use("oidc", new OidcStrategy({
            issuer: config.oidc.issuer,
            clientID: config.oidc.clientId,
            clientSecret: config.oidc.clientSecret,
            callbackURL: config.oidc.callbackUrl,
        }, (tokenset, userinfo, done) => {
            const user = mapOidcUser(userinfo);
            done(null, user);
        }));
    }
    
    // SSO routes
    router.get("/auth/sso/:provider", passport.authenticate("saml", {
        // ... provider-specific options
    }));
    
    router.post("/auth/sso/:provider/callback", passport.authenticate("saml", {
        failureRedirect: "/auth/sso/failure",
    }), (req, res) => {
        // Generate GravityClaw session token
        const token = createSessionToken(req.user.id);
        res.redirect(`/dashboard?token=${token}`);
    });
}
```

**Supported providers (Phase 4):**
- Azure AD (SAML + OIDC)
- Okta (SAML + OIDC)
- Google Workspace (OIDC)
- Auth0 (OIDC)
- OneLogin (SAML)
- Generic SAML 2.0 / OIDC

---

### 4.4 RBAC / ABAC authorization [ENT-003]
**Effort:** 4 days

```typescript
// src/auth/rbac.ts
type Permission = 
    | "session:read" | "session:write" | "session:delete"
    | "tools:execute" | "tools:admin"
    | "users:manage" | "users:read"
    | "settings:read" | "settings:write"
    | "admin:all";

type Role = "admin" | "user" | "viewer" | "custom";

const RBAC_MATRIX: Record<Role, Permission[]> = {
    admin: ["session:read", "session:write", "session:delete", "tools:execute", 
            "tools:admin", "users:manage", "users:read", "settings:read", 
            "settings:write", "admin:all"],
    user: ["session:read", "session:write", "tools:execute", "users:read",
           "settings:read"],
    viewer: ["session:read", "users:read", "settings:read"],
    custom: [], // Dynamically assigned
};

export function requirePermission(...permissions: Permission[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: "Authentication required" });
        }
        
        const userPermissions = RBAC_MATRIX[user.role] || [];
        const hasAll = permissions.every(p => userPermissions.includes(p));
        
        if (!hasAll) {
            return res.status(403).json({ 
                error: "Insufficient permissions",
                required: permissions,
                missing: permissions.filter(p => !userPermissions.includes(p)),
            });
        }
        
        next();
    };
}

// Usage in routes:
router.post("/api/users", 
    authMiddleware, 
    requirePermission("users:manage"),
    asyncHandler(async (req, res) => {
        // Create user
    })
);
```

---

### 4.5 Zero-downtime deployment [ENT-006]
**Effort:** 3 days

**Strategy: Rolling update with health check gating**

```yaml
# docker-compose.prod.yml
version: "3.8"
services:
  app:
    image: gravityclaw:${VERSION}
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
        order: start-first
        failure_action: rollback
      restart_policy:
        condition: any
        delay: 5s
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/api/live').then(r=>process.exit(r.ok?0:1))"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 30s
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
  
  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s

  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    ports:
      - "443:443"
    depends_on:
      - app
```

**Nginx config for zero-downtime:**
```nginx
upstream gravityclaw {
    least_conn;
    server app:3000 max_fails=3 fail_timeout=30s;
}

server {
    listen 443 ssl http2;
    
    location / {
        proxy_pass http://gravityclaw;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
        
        # Health check
        health_check interval=10s fails=3 passes=2;
    }
}
```

**Deployment script:**
```bash
#!/bin/bash
# deploy.sh
set -e

VERSION=${GITHUB_SHA:-$(git rev-parse --short HEAD)}
echo "Deploying version: $VERSION"

# Build
docker build -t gravityclaw:$VERSION .
docker tag gravityclaw:$VERSION registry.gravityclaw.io/gravityclaw:$VERSION
docker push registry.gravityclaw.io/gravityclaw:$VERSION

# Deploy with rolling update
docker stack deploy -c docker-compose.prod.yml gravityclaw --with-registry-auth

# Wait for rollout
echo "Waiting for rollout..."
sleep 30

# Verify
curl -f http://localhost:3000/api/ready || {
    echo "Deployment verification failed. Rolling back..."
    docker stack rollback gravityclaw
    exit 1
}

echo "Deployment successful: $VERSION"
```

---

## Track B: Security & Compliance (Week 10-11)

### 4.6 SOC 2 control mapping [ENT-004]
**Effort:** 5 days

**Create compliance documentation in `audit/compliance/`:**

```
audit/compliance/
  soc2/
    README.md                 ← Overview of SOC2 posture
    controls.md               ← Mapping of all SOC2 controls to implementation
    cc6.md                    ← Logical & Physical Access Controls (CC6)
    cc7.md                    ← System Operations (CC7)  
    cc8.md                    ← Change Management (CC8)
    cc9.md                    ← Risk Mitigation (CC9)
```

**Control mapping example (CC6.1 — Logical Access Security):**
```markdown
## CC6.1 — Logical Access Security

### Requirement
The entity uses logical access controls to authenticate users and prevent unauthorized access.

### Implementation

| Control | Implementation | Evidence |
|---------|---------------|----------|
| Authentication | API key + JWT + SSO (Phase 4.3) | Auth middleware tests |
| Password policy | Keys require 32+ chars | config.ts validation |
| Session management | 24h JWT expiry, Redis-backed | session-store.ts |
| MFA | TOTP via authenticator app | src/auth/mfa.ts |
| Rate limiting | Token bucket per user/IP | src/middleware/rate-limit.ts |
| Account lockout | 5 failed attempts → 15min lock | src/auth/lockout.ts |

### Testing
- [ ] Automated: auth integration tests (Phase 2.3)
- [ ] Manual: Quarterly access review
- [ ] Penetration test: Annual third-party audit
```

---

### 4.7 Audit logging [ENT-005]
**Effort:** 3 days

```typescript
// src/audit/logger.ts
export enum AuditEvent {
    LOGIN_SUCCESS = "login.success",
    LOGIN_FAILURE = "login.failure",
    LOGOUT = "logout",
    SESSION_CREATED = "session.created",
    SESSION_DELETED = "session.deleted",
    TOOL_EXECUTED = "tool.executed",
    ADMIN_ACTION = "admin.action",
    SETTINGS_CHANGED = "settings.changed",
    USER_CREATED = "user.created",
    USER_DELETED = "user.deleted",
    ROLE_CHANGED = "role.changed",
    API_KEY_ROTATED = "api_key.rotated",
    DATA_EXPORTED = "data.exported",
    DATA_DELETED = "data.deleted",
}

export interface AuditEntry {
    timestamp: string;
    event: AuditEvent;
    actorId: string;
    actorType: "user" | "admin" | "system" | "api_key";
    tenantId?: string;
    resourceType: string;
    resourceId: string;
    details: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
}

export class AuditLogger {
    constructor(private db: Database) {}
    
    async log(entry: Omit<AuditEntry, "timestamp">): Promise<void> {
        await this.db.run(`
            INSERT INTO audit_log (
                timestamp, event, actor_id, actor_type, tenant_id,
                resource_type, resource_id, details, ip_address, user_agent, success
            ) VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            entry.event, entry.actorId, entry.actorType, entry.tenantId || null,
            entry.resourceType, entry.resourceId, JSON.stringify(entry.details),
            entry.ipAddress || null, entry.userAgent || null, entry.success ? 1 : 0,
        ]);
    }
    
    async query(filters: {
        event?: AuditEvent;
        actorId?: string;
        tenantId?: string;
        startDate?: string;
        endDate?: string;
        limit?: number;
        offset?: number;
    }): Promise<AuditEntry[]> {
        // ... query builder
    }
}

// Middleware to auto-log requests
export function auditMiddleware(event: AuditEvent) {
    return (req: Request, res: Response, next: NextFunction) => {
        const originalEnd = res.end;
        res.end = function(...args: any[]) {
            const auditLogger = req.app.get("auditLogger");
            auditLogger.log({
                event,
                actorId: req.user?.id || "anonymous",
                actorType: req.user?.type || "api_key",
                tenantId: req.tenant?.id,
                resourceType: req.path.split("/")[2] || "unknown",
                resourceId: req.params.id || "unknown",
                details: { method: req.method, statusCode: res.statusCode },
                ipAddress: req.ip,
                userAgent: req.headers["user-agent"],
                success: res.statusCode < 400,
            });
            return originalEnd.apply(res, args);
        };
        next();
    };
}
```

---

### 4.8 Encryption key rotation + HSM support [ENT-007]
**Effort:** 3 days

```typescript
// src/secrets/kms.ts
interface KmsBackend {
    encrypt(keyId: string, plaintext: Buffer): Promise<Buffer>;
    decrypt(keyId: string, ciphertext: Buffer): Promise<Buffer>;
    generateKey(): Promise<{ keyId: string; publicKey?: string }>;
    rotateKey(oldKeyId: string): Promise<string>; // Returns new keyId
}

class AwsKmsBackend implements KmsBackend {
    constructor(private client: KMSClient) {}
    
    async encrypt(keyId: string, plaintext: Buffer): Promise<Buffer> {
        const result = await this.client.send(new EncryptCommand({
            KeyId: keyId,
            Plaintext: plaintext,
        }));
        return Buffer.from(result.CiphertextBlob!);
    }
    
    async decrypt(keyId: string, ciphertext: Buffer): Promise<Buffer> {
        const result = await this.client.send(new DecryptCommand({
            KeyId: keyId,
            CiphertextBlob: ciphertext,
        }));
        return Buffer.from(result.Plaintext!);
    }
}

// Key rotation workflow:
async function rotateMasterKey(): Promise<void> {
    const newKeyId = await kms.generateKey();
    const oldKeyId = config.masterKeyId;
    
    // Re-encrypt all secrets with new key
    const secrets = await db.all("SELECT id, encrypted_value FROM secrets");
    for (const secret of secrets) {
        const decrypted = await kms.decrypt(oldKeyId, Buffer.from(secret.encrypted_value, "hex"));
        const reEncrypted = await kms.encrypt(newKeyId.keyId, decrypted);
        await db.run("UPDATE secrets SET encrypted_value = ?, key_id = ? WHERE id = ?", [
            reEncrypted.toString("hex"), newKeyId.keyId, secret.id,
        ]);
    }
    
    // Update config
    config.masterKeyId = newKeyId.keyId;
    
    // Log rotation
    auditLogger.log({
        event: AuditEvent.API_KEY_ROTATED,
        actorId: "system",
        resourceType: "encryption_key",
        resourceId: oldKeyId,
        details: { newKeyId: newKeyId.keyId },
        success: true,
    });
}
```

---

## Track C: Ecosystem & SDK (Week 11-12)

### 4.9 Public JavaScript/TypeScript SDK [ENT-008]
**Effort:** 5 days

```typescript
// sdk/gravityclaw-client/src/index.ts
export class GravityClawClient {
    private baseUrl: string;
    private apiKey: string;
    
    constructor(config: { baseUrl: string; apiKey: string }) {
        this.baseUrl = config.baseUrl.replace(/\/$/, "");
        this.apiKey = config.apiKey;
    }
    
    private async request<T>(
        method: string, 
        path: string, 
        body?: any
    ): Promise<T> {
        const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
            method,
            headers: {
                "Content-Type": "application/json",
                "X-Api-Key": this.apiKey,
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        
        if (!res.ok) {
            const error = await res.json().catch(() => ({ error: res.statusText }));
            throw new GravityClawError(res.status, error.error || "Unknown error");
        }
        
        return res.json();
    }
    
    // Session management
    async createSession(config?: SessionConfig): Promise<Session> {
        return this.request("POST", "/sessions", config);
    }
    
    async listSessions(): Promise<Session[]> {
        return this.request("GET", "/sessions");
    }
    
    // Chat
    async chat(sessionId: string, message: string): Promise<ChatResponse> {
        return this.request("POST", `/sessions/${sessionId}/chat`, { message });
    }
    
    async *chatStream(sessionId: string, message: string): AsyncGenerator<StreamChunk> {
        const res = await fetch(`${this.baseUrl}/api/v1/sessions/${sessionId}/chat/stream`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Api-Key": this.apiKey,
            },
            body: JSON.stringify({ message }),
        });
        
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            for (const line of chunk.split("\n")) {
                if (line.startsWith("data: ") && line !== "data: [DONE]") {
                    yield JSON.parse(line.slice(6));
                }
            }
        }
    }
    
    // Tools
    async listTools(): Promise<ToolDefinition[]> {
        return this.request("GET", "/tools");
    }
    
    async executeTool(name: string, args: Record<string, any>): Promise<any> {
        return this.request("POST", "/tools/execute", { name, args });
    }
    
    // Memory
    async searchMemory(sessionId: string, query: string): Promise<MemoryResult[]> {
        return this.request("GET", `/sessions/${sessionId}/memory/search`, { query });
    }
    
    // Admin
    async getUsage(period?: string): Promise<UsageReport> {
        return this.request("GET", `/admin/usage?period=${period || "24h"}`);
    }
}
```

**Package structure:**
```
sdk/gravityclaw-client/
  package.json
  tsconfig.json
  src/
    index.ts
    types.ts
    errors.ts
    streaming.ts
  README.md
  examples/
    basic-chat.ts
    streaming-chat.ts
    multi-agent.ts
```

---

### 4.10 Plugin marketplace [ENT-009]
**Effort:** 5 days

```typescript
// src/plugins/registry.ts
export interface PluginManifest {
    name: string;
    version: string;
    description: string;
    author: string;
    license: string;
    entry: string; // Relative path to plugin entry point
    tools: string[]; // Tool names this plugin provides
    permissions: Permission[]; // Required permissions
    configSchema: Record<string, any>; // JSON Schema for plugin config
}

export class PluginRegistry {
    private plugins = new Map<string, PluginManifest>();
    
    async install(source: string): Promise<PluginManifest> {
        // Support: npm package, git URL, local path, registry URL
        const manifest = await this.resolveSource(source);
        
        // Validate manifest
        this.validateManifest(manifest);
        
        // Check permissions against policy
        await this.checkPermissions(manifest);
        
        // Download/install plugin
        await this.downloadPlugin(manifest);
        
        // Register tools
        for (const toolName of manifest.tools) {
            await this.registerPluginTool(manifest, toolName);
        }
        
        this.plugins.set(manifest.name, manifest);
        return manifest;
    }
    
    async uninstall(name: string): Promise<void> {
        const manifest = this.plugins.get(name);
        if (!manifest) throw new Error(`Plugin not found: ${name}`);
        
        // Unregister tools
        for (const toolName of manifest.tools) {
            await this.unregisterPluginTool(name, toolName);
        }
        
        // Remove plugin
        this.plugins.delete(name);
    }
    
    list(): PluginManifest[] {
        return Array.from(this.plugins.values());
    }
}
```

**Plugin API structure:**
```typescript
// Plugin entry point pattern
export default {
    manifest: {
        name: "my-plugin",
        version: "1.0.0",
        description: "Example plugin",
        tools: ["my-custom-tool"],
        permissions: ["tools:execute"],
    },
    
    setup(context: PluginContext): void {
        // Called when plugin is loaded
        context.registerTool({
            name: "my-custom-tool",
            description: "A custom tool from my plugin",
            handler: async (args: any) => {
                // Tool implementation
                return { result: "done" };
            },
        });
    },
    
    teardown(context: PluginContext): void {
        // Called when plugin is unloaded
    },
};
```

---

### 4.11 Terraform/Pulumi IaC [DEV-008]
**Effort:** 3 days

```terraform
# infrastructure/terraform/main.tf
provider "aws" {
  region = var.aws_region
}

module "gravityclaw" {
  source = "./modules/gravityclaw"
  
  app_name    = "gravityclaw"
  environment = var.environment
  
  # Networking
  vpc_cidr          = "10.0.0.0/16"
  public_subnets    = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnets   = ["10.0.10.0/24", "10.0.11.0/24"]
  
  # Compute (ECS Fargate)
  app_cpu           = 1024
  app_memory        = 2048
  min_capacity      = 2
  max_capacity      = 20
  desired_capacity  = 2
  
  # Database
  redis_node_type   = "cache.t3.small"
  
  # Storage
  attachment_bucket = "gravityclaw-attachments-${var.environment}"
  
  # Monitoring
  alarm_email       = var.alarm_email
  enable_dashboard  = true
}
```

---

### 4.12 Production runbook [DEV-006]
**Effort:** 2 days

**`docs/operations/runbook.md`:**
```markdown
# Production Runbook

## On-Call Rotation
- Primary: @sre-lead
- Secondary: @backend-lead
- Escalation: @engineering-manager

## Incident Response

### Severity Levels
| Level | Response Time | Examples |
|-------|--------------|----------|
| SEV1 | 15min | Service down, data loss |
| SEV2 | 1hr | Degraded performance, partial outage |
| SEV3 | 4hr | Non-critical bug, UI issue |
| SEV4 | Next sprint | Minor issue, enhancement |

### Common Procedures

#### 1. Service Unreachable
```bash
# 1. Check health endpoints
curl -f http://app:3000/api/live
curl -f http://app:3000/api/ready

# 2. Check logs
docker service logs gravityclaw_app --tail 100

# 3. Check resource usage
docker stats $(docker ps -q)

# 4. Restart if needed
docker service update --force gravityclaw_app
```

#### 2. High Latency
```bash
# 1. Check metrics
curl http://app:3000/metrics | grep http_request_duration

# 2. Check LLM provider status
# ... specific provider dashboards

# 3. Scale up
docker service scale gravityclaw_app=5
```

#### 3. Database Issues
```bash
# 1. Check Redis
redis-cli ping
redis-cli info | grep used_memory

# 2. Check Postgres
psql $DATABASE_URL -c "SELECT count(*) FROM sessions;"
psql $DATABASE_URL -c "SELECT * FROM pg_stat_activity;"

# 3. Failover if needed
# ... provider-specific failover steps
```

### Health Dashboard
URL: https://status.gravityclaw.dev
PagerDuty: gravityclaw-prod
Slack: #oncall-alerts
```

---

## Phase 4 Exit Checklist

- [ ] ENT-001: Multi-tenant isolation (row-level + hybrid)
- [ ] ENT-002: SSO/SAML/OIDC (Azure AD, Okta, Google, Auth0)
- [ ] ENT-003: RBAC/ABAC authorization
- [ ] ENT-004: SOC 2 control mapping
- [ ] ENT-005: Audit logging
- [ ] ENT-006: Zero-downtime rolling deployments
- [ ] ENT-007: Encryption key rotation + KMS
- [ ] ENT-008: Public TypeScript SDK
- [ ] ENT-009: Plugin marketplace
- [ ] DEV-008: Terraform/Pulumi IaC
- [ ] DEV-006: Production runbook
- [ ] Horizontal scaling with Redis + stateless design
- [ ] Production Readiness score: 4.5/10 → 9/10
- [ ] DevOps score: 5/10 → 9/10

**Verification Run:**
```bash
# Horizontal scaling test
docker stack deploy -c docker-compose.prod.yml gravityclaw --with-registry-auth
docker service scale gravityclaw_app=3

# Load test with 50 concurrent users
npx autocannon -c 50 -d 60 http://localhost:3000/api/v1/chat

# SSO flow test
curl -v http://localhost:3000/auth/sso/azure/callback?code=test-code

# RBAC test
curl -H "X-Api-Key: viewer-key" http://localhost:3000/api/users/manage
# Expected: 403

# Multi-tenant isolation test
curl -H "X-Tenant-Id: tenant-a" http://localhost:3000/api/sessions
# Should NOT show tenant-b's sessions

# SDK test (separate repo)
npm link ../../sdk/gravityclaw-client
node examples/basic-chat.js

# Zero-downtime deploy test
./deploy.sh
# Should show zero failed requests during deploy

# Audit log test
curl http://localhost:3000/api/admin/audit?event=login.success
# Should show audit entries

# SOC2 compliance check
python scripts/compliance-check.py
# Should pass all 50+ controls
```
