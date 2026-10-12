# Security Architecture: Single-Owner & Agent Capability Model

GravityClaw is engineered as a **high-performance, secure personal AI agent ecosystem** (inspired by projects like OpenClaw and Hermes Agent). 

In a personal agent architecture, the primary security boundary is not human-versus-human tenant isolation, but rather **defending the operator's host environment against prompt injection, untrusted web data, and unconstrained tool execution**.

---

## 1. Single-Owner Authentication & Network Defense

GravityClaw operates under a single-owner trust model:
* **Host Operator Trust:** The local user who launches the daemon is the root owner and operator.
* **API Key & Bearer Token (`API_KEY`):** Protects REST and WebSocket interfaces against unauthorized access.
* **Cross-Site WebSocket Hijacking (CSWSH) Defense:** WebChat and Live Canvas WebSockets require authenticated handshake headers (`Authorization` or `Sec-WebSocket-Protocol`) or signed session tokens, preventing malicious websites visited in the user's browser from issuing unauthorized agent commands.

---

## 2. Agent Capability Profiles & Subagent Scoping

Rather than traditional multi-user enterprise RBAC, authorization in GravityClaw is focused on **Agent Capability Gating** ([`src/auth/rbac.ts`](file:///d:/Projects/GravityClaw/src/auth/rbac.ts)):

| Agent Role | Scope & Description | Restricted Tools |
| :--- | :--- | :--- |
| **`primary`** | Master agent loop interacting directly with the owner | Unrestricted tool access under Human-in-the-Loop oversight |
| **`researcher`** | Web exploration and information synthesis | `delete_file`, `file_delete`, `run_shell`, `write_file` blocked |
| **`coder`** | Code development in the workspace sandbox | Destructive filesystem deletion tools blocked |
| **`reviewer`** | Read-only code and artifact review | `run_shell`, `write_file`, and deletion tools blocked |
| **`summarizer`** | Memory distillation and chat summarization | All system modification and browser tools blocked |

Subagents coordinated via [`SwarmCoordinator`](file:///d:/Projects/GravityClaw/src/agents/swarm.ts) automatically inherit these capability restrictions via `filterToolsForAgentRole()`.

---

## 3. Human-in-the-Loop (HITL) Approvals

The most critical safety control for an autonomous agent with shell and filesystem capabilities is explicit human oversight:
* **The Threat:** Untrusted web content, fetched APIs, or indirect prompt injections attempting to trigger destructive actions (e.g., `rm -rf`, file deletion, sensitive exfiltration).
* **Approval Gates ([`src/middleware/approval.ts`](file:///d:/Projects/GravityClaw/src/middleware/approval.ts)):** High-risk tools (`delete_file`, `file_delete`, `run_shell`) pause autonomous execution until the owner explicitly approves the action via CLI, WebChat, or Telegram.

---

## 4. Host & Secret Isolation

* **Safe Directories & Path Validation ([`src/security/path-validator.ts`](file:///d:/Projects/GravityClaw/src/security/path-validator.ts)):** Filesystem operations are strictly confined to configured workspace directories. Attempts to access `.env`, private keys (`.ssh`), or traverse directory trees (`../`) are blocked and logged.
* **SSRF Defense ([`src/tools/automation/browser.ts`](file:///d:/Projects/GravityClaw/src/tools/automation/browser.ts)):** Automated browser tools intercept requests to prevent navigations or redirects to cloud metadata endpoints (`169.254.169.254`, `metadata.google.internal`) and internal RFC 1918 subnets.
* **Process Sandbox ([`src/tools/sandbox.ts`](file:///d:/Projects/GravityClaw/src/tools/sandbox.ts)):** Executes JavaScript code in an isolated child process with strict timeouts, empty environment variables, and banned pattern detection.

---

## 5. Audit Logging

Located in [`src/audit/`](file:///d:/Projects/GravityClaw/src/audit/), the audit subsystem maintains a tamper-resistant local log of critical actions:
* **Tracked Events:** Tool executions, approval decisions, session modifications, and authentication failures.
* **Credential Protection:** Plaintext API keys and secrets are automatically masked with SHA-256 fingerprints before being written to the database.
