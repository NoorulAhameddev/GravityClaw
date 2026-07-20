# Phase 2: Quality & Testing (Weeks 4-5)

> **Goal:** Establish testing infrastructure, eliminate type unsafety, remove dead code, consolidate documentation. Bring Type Safety score from 3/10 → 7/10, Code Quality from 3/10 → 6/10.
> **Duration:** 2 weeks (parallel tracks)
> **Owner:** QA Lead + Frontend Lead + Technical Writer
> **Dependencies:** Phase 1 complete (server decomposed, CI/CD operational)
> **Exit Criteria:** Test coverage ≥ 60% on critical paths. All `any` types eliminated. Dead code removed. Tests gate CI.

---

## Track A: Testing Infrastructure (Week 4)

### 2.1 Add config.ts test suite [QA-002]
**Effort:** 2 days | **File:** `src/__tests__/config.test.ts`

**Problem:** 882-line config file with ZERO tests (P0 testing gap).

```typescript
import { describe, it, expect } from "vitest";

// Pure function tests only — no env mutation needed
describe("Config Validation", () => {
    describe("API Key Validation", () => {
        it("rejects keys shorter than 32 characters", () => {
            expect(validateApiKey("short")).toBe(false);
        });

        it("accepts keys of 32 characters", () => {
            expect(validateApiKey("a".repeat(32))).toBe(true);
        });

        it("accepts keys longer than 32 characters", () => {
            expect(validateApiKey("a".repeat(64))).toBe(true);
        });
    });

    describe("URL Validation", () => {
        it("rejects invalid URLs", () => {
            expect(validateUrl("not-a-url")).toBe(false);
        });

        it("accepts valid HTTPS URLs", () => {
            expect(validateUrl("https://example.com/api")).toBe(true);
        });

        it("rejects HTTP URLs in production", () => {
            expect(validateUrl("http://example.com/api", "production")).toBe(false);
        });
    });

    describe("Numeric Range Validation", () => {
        it("clamps values below minimum", () => {
            expect(clampValue(-1, 0, 100)).toBe(0);
        });

        it("clamps values above maximum", () => {
            expect(clampValue(150, 0, 100)).toBe(100);
        });

        it("passes through valid values", () => {
            expect(clampValue(50, 0, 100)).toBe(50);
        });
    });
});
```

**Strategy:** Test pure validation functions in isolation. Integration tests for env loading use a separate helper that creates temp `.env` files.

---

### 2.2 Add LLM provider adapter tests [QA-003]
**Effort:** 3 days | **File:** `src/llm/__tests__/providers.test.ts`

**Problem:** 12+ LLM providers have zero test coverage.

**Approach:** Mock the HTTP layer (nock or MSW), test provider adapter behavior.

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import nock from "nock";

describe("OpenAI Provider", () => {
    beforeEach(() => {
        nock("https://api.openai.com")
            .post("/v1/chat/completions")
            .reply(200, {
                id: "chatcmpl-123",
                choices: [{
                    message: { role: "assistant", content: "Hello!" },
                    finish_reason: "stop",
                }],
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            });
    });

    it("sends properly formatted requests", async () => {
        const provider = new OpenAIProvider({ apiKey: "test-key" });
        const response = await provider.chat({
            messages: [{ role: "user", content: "Hi" }],
            model: "gpt-4",
        });
        expect(response.content).toBe("Hello!");
        expect(response.usage?.totalTokens).toBe(15);
    });

    it("handles API errors gracefully", async () => {
        nock.cleanAll();
        nock("https://api.openai.com")
            .post("/v1/chat/completions")
            .reply(429, {
                error: { message: "Rate limit exceeded", type: "rate_limit_error" },
            });

        const provider = new OpenAIProvider({ apiKey: "test-key" });
        await expect(provider.chat({
            messages: [{ role: "user", content: "Hi" }],
        })).rejects.toThrow(/rate limit/i);
    });
});

describe("Anthropic Provider", () => {
    // ... similar pattern for Anthropic's API
});

describe("OpenRouter Provider", () => {
    // ... OpenRouter's unified API
});
```

**Test list:**
- Provider: OpenAI, Anthropic, Google (Gemini), OpenRouter, Ollama, LMStudio, Groq, DeepSeek, Cohere, Together, Replicate, Custom
- Each tests: happy path, rate limiting, auth failure, malformed response, timeout, streaming (if supported)

---

### 2.3 Add auth pipeline integration tests [QA-005]
**Effort:** 2 days | **File:** `src/__tests__/auth.integration.test.ts`

**Problem:** Auth pipeline has zero integration tests.

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { createTestServer } from "../test-utils.ts";

describe("Auth Middleware Integration", () => {
    const app = createTestServer();

    describe("API Key Authentication", () => {
        it("rejects requests without API key", async () => {
            const res = await app.get("/api/v1/health");
            expect(res.status).toBe(401);
        });

        it("rejects requests with invalid API key", async () => {
            const res = await app.get("/api/v1/health", {
                headers: { "x-api-key": "invalid" },
            });
            expect(res.status).toBe(401);
        });

        it("accepts requests with valid API key", async () => {
            const res = await app.get("/api/v1/health", {
                headers: { "x-api-key": "valid-test-key-1234567890123456" },
            });
            expect(res.status).toBe(200);
        });
    });

    describe("JWT Token Authentication", () => {
        it("rejects expired tokens", async () => {
            const expiredToken = createExpiredTestToken();
            const res = await app.get("/api/v1/sessions", {
                headers: { Authorization: `Bearer ${expiredToken}` },
            });
            expect(res.status).toBe(401);
        });

        it("accepts valid tokens", async () => {
            const validToken = createTestToken({ sid: "test-session" });
            const res = await app.get("/api/v1/sessions", {
                headers: { Authorization: `Bearer ${validToken}` },
            });
            expect(res.status).toBe(200);
        });
    });
});
```

---

### 2.4 Add test coverage CI gate [QA-007]
**Effort:** 1 day | **File:** `.github/workflows/ci.yml` (update)

```yaml
  coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run test:coverage
        env:
          # ... same env as test job
      - name: Check coverage thresholds
        run: |
          # Parse coverage summary
          npx istanbul check-coverage \
            --statements 60 \
            --branches 50 \
            --functions 60 \
            --lines 60
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/

  # Add coverage badge to README
  - name: Generate coverage badge
    if: github.ref == 'refs/heads/main'
    uses: danielealbano/coverage-badge-action@v1
```

---

## Track B: Type Safety & Quality (Week 4-5)

### 2.5 Eliminate all `any` types [COD-002 / COD-006]
**Effort:** 3 days | **Files:** Across codebase (40+ `any` assertions)

**Hunting pattern:**
```bash
rg "\bany\b" --include "*.ts" --type ts | grep -v node_modules | grep -v "\.d\.ts"
rg "as any" --include "*.ts" --type ts | grep -v node_modules
rg ": any" --include "*.ts" --type ts | grep -v node_modules
```

**Common replacements:**

| `any` location | Replacement |
|---|---|
| `req: any` | `Request` or custom interface |
| `res: any` | `Response` |
| `config: any` | `Config` interface |
| `tool: any` | `ToolConfig` interface |
| `message: any` | `ChatMessage` |
| `result: any` | Union type or generic |
| `data: any` | `Record<string, unknown>` |
| `err: any` | `unknown` (with narrowing) |

**Example fix pattern:**
```typescript
// Before
function processMessage(msg: any) {
    return msg.content;
}

// After
interface ChatMessage {
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    tool_calls?: ToolCall[];
}

function processMessage(msg: ChatMessage): string {
    return msg.content;
}
```

**Verification:** `npm run typecheck` passes with strict mode. Zero `any` occurrences.

---

### 2.6 Fix async error handling patterns [COD-001]
**Effort:** 2 days | **Files:** Signatures of middleware handlers

**Pattern to fix all async middleware:**
```typescript
// Before (vulnerable to unhandled rejections)
app.get("/api/route", async (req, res) => {
    const data = await riskyOperation();
    res.json(data);
});

// After
import { asyncHandler } from "../middleware/errorHandler.ts";

app.get("/api/route", asyncHandler(async (req, res) => {
    const data = await riskyOperation();
    res.json(data);
}));
```

**Verification:** Scan for all `app.get/post/put/delete(async (` patterns, ensure wrapped.

---

### 2.7 Extract inline HTTP calls from server.ts [COD-004]
**Effort:** 2 days | **Files:** `src/server.ts` (post-decomposition)

After decomposition (Phase 1.5), check that each route module doesn't contain raw `fetch()` or HTTP client calls. Extract into `src/lib/http-client.ts`:

```typescript
// src/lib/http-client.ts
export class HttpClient {
    constructor(private baseUrl: string, private apiKey: string) {}

    async get<T>(path: string): Promise<T> {
        const res = await fetch(`${this.baseUrl}${path}`, {
            headers: {
                "Authorization": `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
            },
        });
        if (!res.ok) throw new HttpError(res.status, await res.text());
        return res.json();
    }
}
```

---

### 2.8 Add proper error boundaries in frontend [FE-001]
**Effort:** 2 days | **File:** `dashboard/src/App.tsx`, `dashboard/src/components/ErrorBoundary.tsx`

```typescript
// dashboard/src/components/ErrorBoundary.tsx
import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("ErrorBoundary caught:", error, errorInfo);
        this.props.onError?.(error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback || (
                <div className="error-boundary">
                    <h2>Something went wrong</h2>
                    <pre>{this.state.error?.message}</pre>
                    <button onClick={() => this.setState({ hasError: false, error: null })}>
                        Try again
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
```

**Then wrap app:**
```typescript
// In App.tsx
<ErrorBoundary>
    <RouterProvider router={router} />
</ErrorBoundary>
```

---

## Track C: Documentation & Cleanup (Week 5)

### 2.9 Fix all broken documentation links [DOC-001]
**Effort:** 1 day | **Files:** All `.md` files

**Automated scan:**
```bash
npx markdown-link-check **/*.md --quiet --config link-check-config.json
```

**Config for valid external links:**
```json
{
    "baseUrl": "https://github.com/anomalyco/GravityClaw",
    "aliveStatusCodes": [200, 206, 301, 302, 303],
    "ignorePatterns": [
        { "pattern": "^http://localhost" },
        { "pattern": "^https://t.me/" }
    ]
}
```

**Fix approach:**
1. Run automated link checker → get broken link list
2. Each broken link → find correct URL or remove
3. Re-run to verify zero broken links

---

### 2.10 Correct tool names in documentation [DOC-002]
**Effort:** 1 day | **Files:** All `.md` files

**Search pattern:**
```bash
# Find all references to tool names in docs
rg -i "tool_name|fake_tool|example_tool" docs/ --type md

# Cross-reference with actual registered tools
rg "registerTool|toolRegistry\|\.register\(|new Tool\(" src/tools/ --no-line-number | sort -u
```

**Fix:**
Compare all doc references against actual registered tool names. Correct mismatches.

---

### 2.11 Create SECURITY.md [DOC-004]
**Effort:** 1 day | **File:** `SECURITY.md`

```markdown
# Security Policy

## Supported Versions
| Version | Supported |
|---------|-----------|
| >= 1.0.0 | Yes |
| < 1.0.0 | No |

## Reporting a Vulnerability

Email: security@gravityclaw.dev (48h acknowledgment)

### What to include:
- Affected version(s)
- Step-by-step reproduction
- CVSS score (if known)
- Proof of concept (if available)

## Security Posture

### Authentication
- API key: 256-bit minimum, constant-time comparison
- JWT: RS256 with 24h expiry, issuer validation
- Session tokens: CSPRNG-generated, 64 bytes

### Data Protection
- At rest: AES-256-GCM encryption
- In transit: TLS 1.3 minimum
- Secrets: Master-key encrypted, 5min cache TTL

### Sandboxing
- Bash execution: regex-blocked download-execute chains
- Code execution: --sandbox flag required
- MCP servers: restricted environment variables

## Vulnerability Disclosure
We follow a 90-day disclosure timeline with credit in advisories.
```

---

### 2.12 Remove dead code [FOR-001 through FOR-006]
**Effort:** 2 days | **Files:** Delete or archive

| Item | File | Action |
|---|---|---|
| Unregistered admin tools | `src/tools/admin/` (7 files) | `git rm` |
| Dead mobile gateway | `src/gateway/mobile.ts` | `git rm` |
| Orphaned observability | `src/observability/` (likely) | `git rm` |
| Orphaned benchmarks | `benchmarks/` or `tests/benchmarks/` | Archive to `audit/archive/` |
| 3 config types | `src/config.ts` | Remove or fix to match actual usage |
| ~25 redundant doc files | `docs/` | Consolidate + `git rm` |

**Approach:**
1. List all files identified for deletion
2. Check git history for last meaningful changes
3. Verify no remaining imports anywhere in live code
4. `git rm` dead files
5. Move orphaned benchmarks to `audit/archive/`

---

### 2.13 Consolidate documentation structure [DOC-007]
**Effort:** 2 days | **File:** `docs/README.md`, restructure

**New docs structure:**
```
docs/
  README.md           ← Entry point with navigation
  quickstart.md       ← 5-minute setup
  deployment.md       ← Production deployment
  configuration.md    ← All config variables (generated)
  architecture.md     ← System design (from audit)
  api/
    overview.md       ← General API docs
    rest.md           ← REST endpoints (generated from routes)
    websocket.md      ← WebSocket protocol
  development/
    setup.md          ← Dev environment setup
    testing.md        ← Testing guide
    contributing.md   ← PR workflow
  security.md         ← Security policy + practices
  faq.md              ← Common questions
```

**Generator approach for API docs:**
```typescript
// scripts/generate-api-docs.ts
// Parse route registrations and generate OpenAPI/Swagger spec
// Use zod-to-json-schema for type generation
```

---

## Phase 2 Exit Checklist

- [ ] QA-002: Config.ts test suite
- [ ] QA-003: LLM provider adapter tests (all 12+)
- [ ] QA-005: Auth pipeline integration tests
- [ ] QA-007: Test coverage CI gate (60% threshold)
- [ ] COD-002/006: Zero `any` types across codebase
- [ ] COD-001: All async middleware wrapped with error handler
- [ ] COD-004: Inline HTTP calls extracted to library
- [ ] FE-001: Error boundaries in dashboard
- [ ] DOC-001: Zero broken documentation links
- [ ] DOC-002: All tool names match actual registration
- [ ] DOC-004: SECURITY.md published
- [ ] FOR-001/006: Dead code removed
- [ ] DOC-007: Documentation restructured
- [ ] Type Safety score: 3/10 → 7/10
- [ ] Code Quality score: 3/10 → 6/10
- [ ] Document Health score: 5.8/10 → 8/10

**Verification Run:**
```bash
# Full quality gate
npm run typecheck && npm run lint && npm run test:coverage

# Link check
npx markdown-link-check **/*.md --quiet

# Type safety check (zero any)
rg "\bany\b" src/ --include "*.ts" | grep -c "any" # Should be 0

# Dead code verification
rg "require|import.*gateway/mobile" src/ # Should return nothing

# Coverage report
npx istanbul check-coverage --statements 60 --branches 50 --functions 60 --lines 60
```
