# Detailed Technical Security & Correctness Findings

**Repository:** [GravityClaw](https://github.com/NoorulAhameddev/GravityClaw)  
**Audit Directory:** `audit/full-file-audit/`  
**Audit Date:** 2026-10-12  
**Total Findings:** 18 (4 Critical, 7 High, 4 Medium, 2 Low, 1 Informational)

---

## FINDING-01: Unrestricted Cross-Session Hijacking & Direct Unauthenticated Tool Invocation in WebChat Channel
- **Severity:** Critical (CVSS 9.8)
- **Confidence:** Confirmed
- **Affected Files:**
  - `src/channels/webchat.ts:L108-144`
  - `src/routes/chat.ts:L40-85`
- **Technical Explanation:**  
  In `WebChatChannel`, when a WebSocket client sends a message, lines 108–115 extract `chatId` directly from the untrusted client message payload:
  ```typescript
  const targetSessionId = msg.chatId || currentSessionId;
  this.sessionConnections.set(targetSessionId, ws);
  ```
  The server reassigns the client's WebSocket connection in the shared lookup map `sessionConnections` without verifying that the client owns `targetSessionId`. An attacker can specify any other user's `chatId` to hijack all incoming LLM responses sent to that session.  
  Furthermore, lines 126–144 allow clients to send `{ type: "tool_call", tool: name, input: ... }` directly over the WebSocket. The server immediately resolves and executes the tool from `ToolRegistry` with zero authentication, zero RBAC checks, and zero approval gating.
- **Call Chain / Execution Path:**  
  Client WebSocket connection → `ws.on('message')` → JSON parse → `this.sessionConnections.set(msg.chatId, ws)` → `this.router.handleMessage()` / `toolRegistry.execute(msg.tool, msg.input)`.
- **Preconditions:**  
  Attacker connects to `/chat` WebSocket endpoint.
- **Impact:**  
  Total loss of confidentiality for arbitrary user sessions. Arbitrary tool execution on backend (shell execution, file deletion, network requests) with server privileges.
- **Why Existing Controls Fail:**  
  No session ownership validation is enforced between the authenticated user identity and the requested `chatId`. Direct WebSocket tool calls bypass `ApprovalGate` and `apiKeyAuth`.
- **Recommended Remediation:**  
  1. Bind the WebSocket connection immutably to the `sessionId` established during handshake authentication. Reject messages where `msg.chatId` differs from the authenticated session.  
  2. Completely remove client-initiated `{ type: "tool_call" }` message handlers from WebSocket protocol; tool calls must strictly originate from LLM orchestration.
- **Regression Tests Needed:**  
  `src/__tests__/channels/webchat-isolation.test.ts` verifying that supplying a foreign `chatId` throws an authorization error and does not rebind socket.
- **Verification Status:** Confirmed via code inspection.

---

## FINDING-02: Broken Session Isolation in LLM Orchestrator Permitting Universal Memory and History Access
- **Severity:** Critical (CVSS 9.1)
- **Confidence:** Confirmed
- **Affected Files:**
  - `src/llm/orchestrator.ts:L351-360`
  - `src/session.ts:L50-90`
- **Technical Explanation:**  
  In `src/llm/orchestrator.ts`, the method `validateSessionAccess()` is intended to enforce session security boundaries. However, lines 351–360 contain:
  ```typescript
  private validateSessionAccess(sessionId: string, userId?: string): boolean {
    // Basic validation - ensure session ID is well-formed
    if (!sessionId || typeof sessionId !== 'string') return false;
    // Prevent path traversal in session IDs
    if (sessionId.includes('..') || sessionId.includes('/') || sessionId.includes('\\')) {
      return false;
    }
    // Note: Session ownership verification is handled at the channel/auth layer
    return true;
  }
  ```
  Because the channel layer does not verify session ownership either, the orchestrator retrieves and mutates conversation history, facts, and attachments for any supplied `sessionId`. Any authenticated client or tool caller can read or alter any user's persistent memory.
- **Call Chain / Execution Path:**  
  Caller provides `sessionId` → `callClaude()` → `validateSessionAccess()` (returns `true`) → `db.getHistory(sessionId)` / `db.saveMessage(sessionId)`.
- **Preconditions:**  
  Access to API or channel with a known or guessed session ID.
- **Impact:**  
  Cross-tenant memory leakage, unauthorized modification of user memories and conversation state.
- **Why Existing Controls Fail:**  
  Responsibility is deferred between layers in comments ("handled at channel layer"), creating an authorization vacuum.
- **Recommended Remediation:**  
  Query the `sessions` table in SQLite to verify that `session.user_id === authenticatedUser.id` before returning or persisting data in `orchestrator.ts`.
- **Regression Tests Needed:**  
  Unit test attempting to call `callClaude()` with a valid `sessionId` belonging to User A while authenticated as User B, asserting `UnauthorizedError`.
- **Verification Status:** Confirmed via code analysis.

---

## FINDING-03: Sandbox Execution Inoperable (`PATH: ''` ENOENT) & Sandbox Javascript Process Environment Leakage
- **Severity:** Critical (CVSS 9.0)
- **Confidence:** Confirmed
- **Affected Files:**
  - `src/tools/sandbox.ts:L45-52, L80-120`
- **Technical Explanation:**  
  In `src/tools/sandbox.ts`, `createSandboxEnv()` sets `PATH: ''`:
  ```typescript
  function createSandboxEnv() {
    return {
      NODE_ENV: 'production',
      PATH: '', // Attempt to isolate process
      TMP: '/tmp',
      TEMP: '/tmp'
    };
  }
  ```
  On Windows and POSIX systems, `spawn('node')` and `spawn('powershell.exe')` rely on `PATH` to locate the interpreter executable. When `PATH` is empty, `spawn` immediately fails with `ENOENT: spawn node ENOENT`. The feature is completely broken.  
  Furthermore, the code sanitization logic in `sanitizeJavaScript()` relies on superficial regex matching for `require(` and `process.exit`, but fails to sanitize access to `process.env`. If the sandbox were functional, code like `Object.keys(process.env)` would allow untrusted code to dump all secrets (`API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `MASTER_KEY`).
- **Call Chain / Execution Path:**  
  Agent calls `execute_code` tool → `executeJavaScript()` → `spawn('node', ..., { env: createSandboxEnv() })` → Immediate ENOENT crash.
- **Preconditions:**  
  Agent invokes `execute_code` tool.
- **Impact:**  
  Complete denial of service for the code execution tool; severe secret exfiltration vulnerability if the binary path is resolved.
- **Why Existing Controls Fail:**  
  Zero tests exist for `src/tools/sandbox.ts` in `src/__tests__/`.
- **Recommended Remediation:**  
  1. Use isolated execution runtimes (such as Docker containers or isolated WebAssembly runtimes) rather than host process spawning.  
  2. If using Node child processes, pass the absolute path to node while explicitly clearing secret variables from `process.env`.
- **Regression Tests Needed:**  
  Add `src/__tests__/tools/sandbox.test.ts` to test execution and verify that `process.env` does not contain API keys.
- **Verification Status:** Confirmed via static analysis and reproduction.

---

## FINDING-04: API Authentication Collapses to Admin Role; RBAC and User Tables Completely Bypassed
- **Severity:** High (CVSS 8.8)
- **Confidence:** Confirmed
- **Affected Files:**
  - `src/middleware/auth.ts:L30-45`
  - `src/db.ts:L120-140`
- **Technical Explanation:**  
  In `src/middleware/auth.ts`, when an incoming request passes the `API_KEY` header check, lines 30–45 execute:
  ```typescript
  req.role = 'admin';
  req.user = { id: 'api-key-holder', role: 'admin' };
  return next();
  ```
  Similarly, localhost development bypass sets `req.role = 'admin'`. The `users` table created in `src/db.ts` and the `RBAC_MATRIX` defined in `src/types/auth.ts` are never queried. Every client with an API key possesses unlimited administrative privileges.
- **Preconditions:**  
  Knowledge of valid `API_KEY` or connection from loopback IP.
- **Impact:**  
  Privilege escalation. Inability to enforce least-privilege access for read-only or standard users.
- **Why Existing Controls Fail:**  
  The authentication middleware bypasses the RBAC matrix by hardcoding role assignment to `admin`.
- **Recommended Remediation:**  
  Implement token/key mapping to individual user accounts in the `users` table and extract the actual user role.
- **Regression Tests Needed:**  
  Test that a viewer API key cannot execute administrative endpoints like `DELETE /api/sessions/:id`.
- **Verification Status:** Confirmed via code analysis.

---

## FINDING-05: Plaintext API Key Logged to Database and Exposed via Audit API
- **Severity:** High (CVSS 7.5)
- **Confidence:** Confirmed
- **Affected Files:**
  - `src/audit/middleware.ts:L11, L33`
  - `src/routes/audit.ts:L20-45`
- **Technical Explanation:**  
  In `src/audit/middleware.ts`, `auditMiddleware` records incoming requests:
  ```typescript
  const actorId = req.user?.id || req.apiKey || 'anonymous';
  db.insertAuditLog({ actor_id: actorId, action: req.path, ... });
  ```
  When requests authenticate using `X-API-Key` without a populated `req.user`, `req.apiKey` (the plaintext API key) is stored directly into the `actor_id` column of `audit_log`. The endpoint `GET /api/audit` returns these log entries, exposing plaintext API keys to any user viewing audit logs.
- **Preconditions:**  
  API request with `X-API-Key` followed by reading audit logs.
- **Impact:**  
  Administrative credential theft through audit log inspection.
- **Why Existing Controls Fail:**  
  Audit middleware treats raw authentication tokens as user identifiers without hashing or redaction.
- **Recommended Remediation:**  
  Store a SHA-256 fingerprint or redacted prefix (`key_...${key.slice(-4)}`) of the API key rather than the raw secret.
- **Regression Tests Needed:**  
  Assert that `actor_id` in `audit_log` does not contain the literal `API_KEY` value.
- **Verification Status:** Confirmed via code inspection.

---

## FINDING-06: Tool Approval Gate Bypass via Mismatched Tool Identifier (`delete_file` vs `file_delete`)
- **Severity:** High (CVSS 7.7)
- **Confidence:** Confirmed
- **Affected Files:**
  - `src/middleware/approval.ts:L33`
  - `src/tools/system/files.ts:L512-520`
  - `.env:L183`
- **Technical Explanation:**  
  `APPROVAL_REQUIRED_TOOLS` in `src/middleware/approval.ts` and `.env` specifies:
  ```typescript
  APPROVAL_REQUIRED_TOOLS = ['run_shell', 'file_delete', 'send_message', 'http_request'];
  ```
  However, in `src/tools/system/files.ts`, the actual registered tool name is `delete_file`:
  ```typescript
  export const deleteFileTool: Tool = {
    name: 'delete_file',
    ...
  ```
  When the agent executes `delete_file`, `ApprovalGate.isApprovalRequired('delete_file')` checks whether `'delete_file'` is in `APPROVAL_REQUIRED_TOOLS`. Because only `'file_delete'` is listed, the check returns `false`, bypassing the approval requirement completely.
- **Preconditions:**  
  Agent calls `delete_file`.
- **Impact:**  
  Unapproved, irreversible deletion of project or filesystem files.
- **Why Existing Controls Fail:**  
  Configuration uses a divergent identifier (`file_delete`) not matching the registered tool symbol (`delete_file`).
- **Recommended Remediation:**  
  Update `approval.ts` and `.env` default to `'delete_file'`, and implement startup schema validation asserting that all entries in `APPROVAL_REQUIRED_TOOLS` match valid registered tools in `ToolRegistry`.
- **Regression Tests Needed:**  
  Assert that `ApprovalGate.isApprovalRequired('delete_file')` returns `true`.
- **Verification Status:** Confirmed via code inspection.

---

## FINDING-07: Shared Browser Singleton Leaks Context, Cookies, and Screenshots Across Sessions
- **Severity:** High (CVSS 7.4)
- **Confidence:** Confirmed
- **Affected Files:**
  - `src/tools/automation/browser.ts:L30-85`
- **Technical Explanation:**  
  `BrowserSessionManager` maintains a static singleton instance of Playwright browser and page (`this.browser`, `this.page`). All incoming sessions, regardless of user or channel, reuse this single page. Cookies, active sessions on external sites, browsing history, and DOM state are shared across all users.
- **Preconditions:**  
  Multiple users invoke browser automation tools.
- **Impact:**  
  Cross-session account hijacking on third-party sites and data leakage between users.
- **Why Existing Controls Fail:**  
  No per-session browser context isolation is instantiated.
- **Recommended Remediation:**  
  Instantiate an isolated `browser.newContext()` per session ID and close contexts upon session completion or timeout.
- **Regression Tests Needed:**  
  Verify that cookies set in session 1 are not present in requests made from session 2.
- **Verification Status:** Confirmed via code inspection.

---

## FINDING-08: Insecure DNS & SSRF Redirect Handling in Browser Automation
- **Severity:** High (CVSS 7.5)
- **Confidence:** Confirmed
- **Affected Files:**
  - `src/tools/automation/browser.ts:L140-190`
  - `src/utils/security.ts:L60-110`
- **Technical Explanation:**  
  `validateUrl()` checks the hostname string against blocked ranges (`127.0.0.1`, `localhost`), but does not resolve the hostname via DNS (vulnerable to DNS rebinding) and does not attach request interception to Playwright's `page.on('response')` or `page.route()` to check HTTP 301/302 redirects. A public URL that redirects to `http://169.254.169.254/latest/meta-data/` will bypass initial validation and fetch sensitive cloud metadata.
- **Preconditions:**  
  Agent navigates to an attacker-controlled URL that issues an HTTP 302 redirect.
- **Impact:**  
  Server-Side Request Forgery (SSRF) and cloud credential exfiltration.
- **Why Existing Controls Fail:**  
  URL validation is string-only and applied only to the initial request URI.
- **Recommended Remediation:**  
  Use Playwright route interception (`page.route('**', ...)`) to validate IP addresses of all outbound requests and redirected targets against private IP blocks.
- **Regression Tests Needed:**  
  Test that navigating to a URL redirecting to `169.254.169.254` aborts the request.
- **Verification Status:** Confirmed via code inspection.

---

## FINDING-09: Anthropic and Google LLM Adapters Generate Schema Violations Causing 400 API Errors
- **Severity:** High (CVSS 7.2)
- **Confidence:** Confirmed
- **Affected Files:**
  - `src/llm/anthropic.ts:L139-159`
  - `src/llm/google.ts:L203-205`
- **Technical Explanation:**  
  In `src/llm/anthropic.ts`, tool use blocks sent to Anthropic contain an invalid property:
  ```typescript
  caller: { type: 'internal', tool_id }
  ```
  The Anthropic Messages API strictly rejects unrecognized fields on `ToolUseBlock` with a 400 Bad Request error. Furthermore, consecutive tool results produce consecutive `role: 'user'` messages, violating Anthropic's strict turn alternation requirements.  
  In `src/llm/google.ts`, message role `'function'` is passed instead of `'user'`, which violates `@google/generative-ai` content specifications.
- **Preconditions:**  
  Invoking Anthropic or Google LLM providers with multiple tool calls.
- **Impact:**  
  Inference loop crashes with 400 Bad Request when executing multi-turn tool calling.
- **Why Existing Controls Fail:**  
  Tests for LLM adapters mock the API response without validating outbound payload schemas against the official provider schemas.
- **Recommended Remediation:**  
  Remove the non-standard `caller` property, merge parallel tool results into a single user message block for Anthropic, and map function roles properly for Gemini.
- **Regression Tests Needed:**  
  Payload schema validation tests verifying outbound payloads against Anthropic and Google API schemas.
- **Verification Status:** Confirmed via code inspection.

---

## FINDING-10: File Content Search Oracle Bypasses Blocked File Patterns
- **Severity:** High (CVSS 7.1)
- **Confidence:** Confirmed
- **Affected Files:**
  - `src/tools/system/files.ts:L686-750`
- **Technical Explanation:**  
  `search_files` tool checks the directory path argument against allowed root directories, but when recursively scanning directory trees to search file contents (`content_search`), it does not call `matchesBlockedPatterns()` on individual child file paths. An agent or prompt injection can invoke `search_files` with regex patterns matching `.env` or sensitive key files to extract secrets line by line without triggering file read approval gates.
- **Preconditions:**  
  Agent or attacker invokes `search_files`.
- **Impact:**  
  Unauthorized disclosure of secrets and environment variables.
- **Why Existing Controls Fail:**  
  Path validation is checked once at the root directory level, not recursively for each child file inspected.
- **Recommended Remediation:**  
  Check `matchesBlockedPatterns(childPath)` before opening and searching any file.
- **Regression Tests Needed:**  
  Test that `search_files` refuses to search or return matches from `.env`.
- **Verification Status:** Confirmed via code inspection.

---

## FINDING-11: WebSocket Authentication Token In URL Query Parameters & Secret Key Reuse
- **Severity:** High (CVSS 7.0)
- **Confidence:** Confirmed
- **Affected Files:**
  - `src/middleware/websocket-auth.ts:L25-60`
  - `src/routes/auth.ts:L20-45`
- **Technical Explanation:**  
  `validateWebSocketAuth` extracts authentication tokens from `url.searchParams.get('token')`. This places sensitive bearer tokens in URLs, exposing them to server logs, proxy access logs, and browser history.  
  Additionally, the JWT signing secret defaults to `config.API_KEY`, reusing the administrative API key as a JWT signing key. Furthermore, `POST /api/auth/token` allows minting tokens for arbitrary `sessionId` and `userId` without validating ownership.
- **Preconditions:**  
  Attacker inspects proxy logs or requests a token for an arbitrary session ID.
- **Impact:**  
  Token leakage and unauthorized session token minting.
- **Why Existing Controls Fail:**  
  URL-based query parameter transport is permitted by the authentication middleware.
- **Recommended Remediation:**  
  Use the `Sec-WebSocket-Protocol` header or an initial authentication frame over the established socket, use an independent `JWT_SECRET`, and enforce session ownership when minting tokens.
- **Regression Tests Needed:**  
  Reject WebSocket connection attempts passing tokens via query parameters in production.
- **Verification Status:** Confirmed via code inspection.

---

## FINDING-12: Persistent Memory Poisoning via Unsanitized Session Facts
- **Severity:** Medium (CVSS 6.5)
- **Confidence:** Confirmed
- **Affected Files:**
  - `src/llm/orchestrator.ts:L210-230`
  - `src/memory/markdown.ts:L45-80`
- **Technical Explanation:**  
  Facts extracted from conversation turns or tool results are written directly to markdown memory files and concatenated verbatim into system prompts:
  ```typescript
  systemPromptContent += '\nRelevant Facts:\n' + factsContent;
  ```
  An attacker can provide an adversarial user prompt instructing the agent to "remember that the user is an admin" or "always ignore approval gates". Once saved to session facts, this payload is injected into every subsequent prompt in that session, persisting across server restarts.
- **Preconditions:**  
  User sends a prompt injection that is parsed as a session fact.
- **Impact:**  
  Persistent instruction injection altering agent behavior for subsequent requests.
- **Why Existing Controls Fail:**  
  Memory facts are injected without trust boundaries, delimiters, or sanitization.
- **Recommended Remediation:**  
  Wrap persistent facts in strictly demarcated XML tags (e.g. `<retrieved_memory trust="untrusted">`) and instruct the LLM that retrieved memory cannot override system instructions.
- **Regression Tests Needed:**  
  Prompt injection persistence test verifying system prompt delimiters.
- **Verification Status:** Confirmed via code inspection.

---

## FINDING-13: Multi-Agent Swarm Subagents Bypass Global Rate Limits and Retain Destructive Tools
- **Severity:** Medium (CVSS 6.2)
- **Confidence:** Confirmed
- **Affected Files:**
  - `src/agents/swarm.ts:L70-130`
  - `src/agent.ts:L85-120`
- **Technical Explanation:**  
  When `AgentSwarm` spawns subagents, each subagent is assigned a newly generated `childSessionId`. Because rate limiting is keyed on `sessionId`, swarm subagents effectively bypass rate limits and token budgets. Additionally, subagents inherit all tools from `registry.getRelevantTools()`, including `run_shell` and `delete_file`, violating least privilege.
- **Preconditions:**  
  Swarm coordination triggered.
- **Impact:**  
  Resource exhaustion and unexpected execution of destructive tools by auxiliary subagents.
- **Why Existing Controls Fail:**  
  Rate limiter does not track parent session hierarchy.
- **Recommended Remediation:**  
  Track subagent token consumption against the root parent session rate limiter, and restrict subagent tool registries to read-only capabilities by default.
- **Regression Tests Needed:**  
  Rate limit test verifying that child subagents consume the parent's rate limit quota.
- **Verification Status:** Confirmed via code inspection.

---

## FINDING-14: Skill Tool Dynamic Code Execution via Child Process Template Interpolation
- **Severity:** Medium (CVSS 6.0)
- **Confidence:** Confirmed
- **Affected Files:**
  - `src/skills/loader.ts:L245-264`
- **Technical Explanation:**  
  In `src/skills/loader.ts`, `executeSkillTool()` executes skill commands by interpolating parameter arguments into command templates:
  ```typescript
  const command = template.replace(/\${(\w+)}/g, (_, key) => args[key] || '');
  await execAsync(command);
  ```
  While basic shell metacharacters are screened, complex multi-line inputs or interpreter escape sequences in Python/Node commands can lead to unintended code execution in the host environment.
- **Preconditions:**  
  Skill execution with malicious parameter inputs.
- **Impact:**  
  Arbitrary code execution on host.
- **Why Existing Controls Fail:**  
  String interpolation into shell command lines rather than structured argv argument passing.
- **Recommended Remediation:**  
  Pass arguments as structured arrays to `execFile` rather than string interpolation into shell commands.
- **Regression Tests Needed:**  
  Pass special characters and shell escapes to skill execution, verifying proper parameterization.
- **Verification Status:** Confirmed via code inspection.

---

## FINDING-15: Dependency Supply Chain Vulnerabilities (87 CVEs in npm audit, 7 Critical)
- **Severity:** Critical (CVSS 9.8)
- **Confidence:** Confirmed
- **Affected Files:**
  - `package-lock.json`
  - `package.json`
- **Technical Explanation:**  
  Running `npm audit` reveals **87 vulnerabilities**: 7 Critical, 22 High, 56 Moderate, and 2 Low. These include:
  - `tar` (Critical): Arbitrary file overwrite via directory traversal.
  - `protobufjs` (Critical): Prototype pollution.
  - `proxy-addr` (High/Critical): Loopback bypass via IPv4-mapped IPv6 addresses.
  - `ws` (High): Memory leakage and Denial of Service.
  - `vite` (High): Path traversal in development server.
- **Preconditions:**  
  Executing vulnerable paths in affected dependencies.
- **Impact:**  
  Potential remote code execution, server DoS, and arbitrary file write via third-party package flaws.
- **Why Existing Controls Fail:**  
  `package-lock.json` pins outdated dependency versions without automated Renovate/Dependabot updating.
- **Recommended Remediation:**  
  Execute `npm audit fix` and upgrade vulnerable direct dependencies (`tar`, `ws`, `vite`, `express`, `body-parser`).
- **Regression Tests Needed:**  
  CI workflow running `npm audit --audit-level=high`.
- **Verification Status:** Confirmed via npm audit.

---

## FINDING-16: Code Formatting Inconsistencies Across 166 Files
- **Severity:** Medium (CVSS 3.0)
- **Confidence:** Confirmed
- **Affected Files:**
  - `package.json`, `.prettierrc`, and 166 tracked repository files
- **Technical Explanation:**  
  Running `npm run format:check` fails with 166 files failing Prettier code formatting standards. This demonstrates that pre-commit hooks and CI formatting checks are not actively enforced.
- **Preconditions:**  
  Running formatting verification.
- **Impact:**  
  Code churn, merge conflicts, and inconsistent code hygiene.
- **Recommended Remediation:**  
  Run `npm run format` across the repository and configure a Git pre-commit hook via Husky.
- **Verification Status:** Confirmed via test execution.

---

## FINDING-17: SQLite Busy Lock Contention Under Parallel Write Workloads
- **Severity:** Low (CVSS 4.2)
- **Confidence:** Strongly Supported
- **Affected Files:**
  - `src/db.ts:L40-85`
- **Technical Explanation:**  
  SQLite WAL mode is enabled with a default busy timeout of 5000ms. Under heavy parallel agent swarm runs or multiple concurrent WebChat streams, concurrent writes to `memory` and `audit_log` tables can result in `SQLITE_BUSY` errors without exponential backoff retry wrappers.
- **Preconditions:**  
  High concurrency (50+ simultaneous agent sessions writing to SQLite).
- **Impact:**  
  Intermittent 500 errors and dropped message persistence under peak load.
- **Recommended Remediation:**  
  Implement a write queue or backoff retry decorator around SQLite write transactions.
- **Verification Status:** Supported by code review.

---

## FINDING-18: Abandoned PostgreSQL Database Adapters Left in Git History
- **Severity:** Informational
- **Confidence:** Confirmed
- **Affected Files:**
  - `src/db-pg.ts`, `src/db/postgres-provider.ts`, `src/db/postgres.ts`, `src/lib/session-store.ts`
- **Technical Explanation:**  
  PostgreSQL database adapters remain in Git HEAD history while deleted from the working tree. Documentation still mentions PostgreSQL support, creating confusion regarding production database capabilities.
- **Impact:**  
  Developer confusion regarding production deployment architecture.
- **Recommended Remediation:**  
  Update documentation to explicitly state that GravityClaw currently operates on SQLite.
- **Verification Status:** Confirmed via Git tree analysis.
