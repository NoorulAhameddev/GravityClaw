# Documentation vs. Implementation Discrepancies

**Repository:** [GravityClaw](https://github.com/NoorulAhameddev/GravityClaw)  
**Audit Directory:** `audit/full-file-audit/`  
**Date:** 2026-10-12  

---

## 1. Executive Summary of Discrepancies

In accordance with **Absolute Rule 1 ("The README is NOT proof")** and **Absolute Rule 3 ("Implementation is the source of truth")**, all functional and security assertions documented across `README.md`, `ARCHITECTURE.md`, `.ai/`, and `docs/` were independently cross-referenced against the actual source code.

A substantial divergence exists between the architectural claims and the operational codebase:
- Features documented as "production enterprise security controls" (such as RBAC, human-in-the-loop approval, and sandbox isolation) either collapse into universal administrative access, are bypassed via naming mismatches, or fail to execute due to fatal runtime configuration bugs.

---

## 2. Itemized Discrepancy Catalog

### Discrepancy 1: Role-Based Access Control (RBAC) vs. Universal Admin Bypass
- **Documented Claim:**  
  `README.md` and `docs/architecture.md` claim enterprise multi-user Role-Based Access Control (RBAC) with granular permission tiers (`admin`, `user`, `viewer`, `custom`) backed by a permission matrix.
- **Actual Implementation (`src/middleware/auth.ts:L30-45`):**  
  Whenever an API key is presented, `apiKeyAuth` unconditionally sets `req.role = 'admin'` and `req.user = { id: 'api-key-holder', role: 'admin' }`. Similarly, localhost developer bypass automatically assigns `role: 'admin'`. The `users` database table and the `RBAC_MATRIX` are never evaluated during API request authentication. All authenticated callers are treated as full administrators.

---

### Discrepancy 2: Session Isolation & Privacy vs. Unrestricted Cross-Session Access
- **Documented Claim:**  
  Documentation asserts that user sessions provide strict conversational isolation, private memory stores, and tenant boundaries.
- **Actual Implementation (`src/llm/orchestrator.ts:L351-360`, `src/channels/webchat.ts:L108-144`):**  
  - In `src/llm/orchestrator.ts`, the implementation of `validateSessionAccess()` explicitly notes:
    ```typescript
    // We only check path traversal for session IDs
    if (sessionId.includes('..') || sessionId.includes('/') || sessionId.includes('\\')) {
      return false;
    }
    return true; // No user/tenant ownership check performed!
    ```
  - In `src/channels/webchat.ts`, any connected WebSocket client can supply an arbitrary `chatId` in message payloads (`msg.chatId || currentSessionId`), which immediately rebinds the client connection to that `chatId`, allowing cross-user conversation interception and tool triggering.

---

### Discrepancy 3: Hardened Code Sandbox vs. Non-Functional Execution & Environment Leakage
- **Documented Claim:**  
  Documentation advertises an isolated, secure code execution sandbox for executing untrusted JavaScript and Python snippets without host risk.
- **Actual Implementation (`src/tools/sandbox.ts:L45-52, L80-120`):**  
  - `createSandboxEnv` hardcodes `PATH: ''` in an attempt to isolate the child process. Because `node` and `powershell.exe` rely on `PATH` to resolve system binaries, `spawn('node')` immediately throws `ENOENT: spawn node ENOENT`. The sandbox has never been functional in production and has zero unit tests.
  - Furthermore, `sanitizeJavaScript` uses superficial regex replacements to comment out lines matching `require(` or `process.exit`, but completely ignores `process.env`. If executed, untrusted code could easily exfiltrate API keys and master encryption keys.

---

### Discrepancy 4: Mandatory Human-in-the-Loop Approval vs. Tool Name Mismatch Bypass
- **Documented Claim:**  
  Security documentation states that destructive actions (including file deletion) strictly require human approval before execution.
- **Actual Implementation (`src/middleware/approval.ts:L33`, `src/tools/system/files.ts:L512-520`):**  
  - Default `APPROVAL_REQUIRED_TOOLS` in `src/middleware/approval.ts` and `.env` configures `file_delete`.
  - However, the actual tool registered in `src/tools/system/files.ts` is named `delete_file`.
  - Because `ApprovalGate.isApprovalRequired('delete_file')` checks whether the tool name exists in `APPROVAL_REQUIRED_TOOLS`, the check evaluates to `false`. Destructive file deletions execute immediately without human approval.
  - Additionally, `http_request` is configured as requiring approval, but no tool by that name exists in the codebase.

---

### Discrepancy 5: Browser Automation Session Isolation vs. Global Shared Singleton
- **Documented Claim:**  
  Docs state browser automation tasks are sandboxed, stateless, and per-session.
- **Actual Implementation (`src/tools/automation/browser.ts:L30-85`):**  
  `BrowserSessionManager` maintains a single static singleton browser and page (`this.browser`, `this.page`). All sessions and users share the same browser context. Cookies, authenticated sessions, local storage, and history from previous tasks persist and are directly accessible to subsequent user sessions.

---

### Discrepancy 6: PostgreSQL Database Support vs. Abandoned Scaffolding
- **Documented Claim:**  
  Older architectural specs and ADR documents describe dual SQLite/PostgreSQL support for enterprise production scale.
- **Actual Implementation:**  
  PostgreSQL connection code (`src/db-pg.ts`, `src/db/postgres-provider.ts`, `src/db/postgres.ts`) was deleted from the working copy. The server solely connects to SQLite via `better-sqlite3`. PostgreSQL claims in documentation are obsolete and misleading.

---

### Discrepancy 7: Offline Air-Gapped Egress Guarantees
- **Documented Claim:**  
  Documentation suggests GravityClaw can operate in strict air-gapped or egress-isolated environments.
- **Actual Implementation:**  
  Multiple provider failover routines, browser automation tools, and telemetry hooks attempt external HTTP requests without strict egress network gating or verification.
