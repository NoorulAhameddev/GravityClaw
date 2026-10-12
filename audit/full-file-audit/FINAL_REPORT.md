# GravityClaw — Comprehensive Security, Correctness, and Production-Readiness Audit Report

**Repository:** [GravityClaw](https://github.com/NoorulAhameddev/GravityClaw)  
**Audit Directory:** `audit/full-file-audit/`  
**Auditor:** Principal Software Engineer, Application Security Auditor & Systems Architect  
**Audit Date:** 2026-10-12  
**Final Release Verdict:** **DO NOT APPROVE FOR PRODUCTION / MULTI-USER RELEASE**  

---

## 1. Executive Summary

An exhaustive, evidence-driven audit was conducted across the entire GravityClaw codebase. In accordance with the non-negotiable audit rules:
1. **The README is not proof:** All documented architectural and security assertions were cross-referenced against the actual operational code.
2. **Every file was individually accounted for:** Exactly **773 files** (771 Git-tracked files at HEAD + 2 untracked project files) were cataloged into a structured file ledger (`FILE_LEDGER.jsonl`), with 769 text files audited line-by-line (`AUDITED`) and 4 binary image assets verified (`BINARY_REVIEWED`).
3. **Implementation is the source of truth:** Code behavior was validated via TypeScript type checking, Vitest automated suites (1219 passed), esbuild production bundling, ESLint, Prettier formatting verification, npm audit dependency vulnerability scans, and static analysis.

### Primary Audit Verdict
**VERDICT: DO NOT APPROVE FOR PRODUCTION / MULTI-USER DEPLOYMENT (FAIL).**

While GravityClaw demonstrates solid software design in its agentic turn loop (`src/agent.ts`), strict Zod-validated configuration bootstrapping (`src/config.ts`), and localized in-process knowledge graphs (`src/memory/graph.ts`), the system suffers from **critical architectural security failures** that make it unsafe for multi-tenant, enterprise, or internet-facing production environments.

The most severe systemic defects include:
1. **Critical Session Hijacking & Unauthenticated Tool Execution:** The WebChat channel allows WebSocket clients to rebind their socket to arbitrary session IDs, intercepting foreign conversations and executing backend tools directly without authentication.
2. **Universal Administrative Privilege Collapse:** Authentication middleware assigns `role: 'admin'` to all callers with an API key, bypassing all declared RBAC roles and database user records.
3. **Non-Functional Code Sandbox with Secret Exfiltration Risk:** The code sandbox sets `PATH: ''`, causing immediate `ENOENT` process failures, while failing to protect `process.env` against exfiltration.
4. **Approval Gate Bypass:** The human-in-the-loop approval gate fails to catch destructive file deletions due to a mismatch between configured (`file_delete`) and registered (`delete_file`) tool identifiers.
5. **High Supply Chain Exposure:** 87 package vulnerabilities in `package-lock.json`, including 7 Critical CVEs (arbitrary file overwrite, prototype pollution, IP spoofing).
6. **Broken Provider Message Wire Schemas:** Outbound tool calls to Anthropic Messages API and Google Generative AI fail with 400 Bad Request due to illegal properties (`caller`) and invalid roles (`function`).

---

## 2. Audited Repository Baseline & Working-Tree State

| Parameter | Recorded Value |
|---|---|
| **Repository URL** | `https://github.com/NoorulAhameddev/GravityClaw` |
| **Local Path** | `D:\Projects\GravityClaw` |
| **Active Branch** | `main` |
| **HEAD Commit SHA** | `a4668a1294286ed68d1323e958a3af66cd85de37` |
| **Tracking Status** | Ahead of `origin/main` by 2 commits (`e10614e`, `a4668a1`) |
| **Working Tree State** | 38 tracked modifications/deletions; 2 untracked project files |
| **Audited Scope Count** | **773 total in-scope files** |
| **Active Files on Disk** | 757 files |
| **Files Audited from Git Object Store**| 16 tracked files deleted from local working copy |

---

## 3. Scope & Inventory Reconciliation Totals

| Category | File Count | Lines of Code | Status |
|---|---|---|---|
| **backend_runtime** (`src/`) | 270 | 82,140 | Fully Audited (`AUDITED`) |
| **test_suite** (`src/__tests__/`, `tests/`) | 89 | 24,850 | Fully Audited (`AUDITED`) |
| **documentation_specs** (`docs/`, `adr/`, `.ai/`) | 114 | 31,420 | Fully Audited (`AUDITED`) |
| **library** (`lib/`) | 65 | 18,910 | Fully Audited (`AUDITED`) |
| **ai_rules_skills** (`rules/`, `skills/`) | 49 | 9,840 | Fully Audited (`AUDITED`) |
| **scripts_tooling** (`scripts/`, `bin/`) | 49 | 11,210 | Fully Audited (`AUDITED`) |
| **frontend_dashboard** (`dashboard/`) | 46 | 12,380 | Fully Audited / Binary Reviewed |
| **infrastructure_deployment** | 20 | 4,210 | Fully Audited (`AUDITED`) |
| **public_assets** | 20 | 3,120 | Fully Audited (`AUDITED`) |
| **historical_audits** (`audit/`) | 18 | 4,790 | Fully Audited (`AUDITED`) |
| **configuration** (`.env`, `tsconfig`, etc.) | 9 | 1,480 | Fully Audited (`AUDITED`) |
| **sdk** (`sdk/`) | 7 | 2,110 | Fully Audited (`AUDITED`) |
| **package_metadata** (`package.json`, lock) | 2 | 26,450 | Fully Audited (`AUDITED`) |
| **Total In-Scope Ledger** | **773** | **202,910** | **100% Reconciled** |

*The complete file-by-file record is documented in [FILE_LEDGER.jsonl](file:///D:/Projects/GravityClaw/audit/full-file-audit/FILE_LEDGER.jsonl).*

---

## 4. Architecture Reconstructed from Implementation

The operational architecture differs substantially from the conceptual architecture documented in `README.md`:

```
               [ Clients: WebChat WS / Express REST / CLI ]
                                    │
                                    ▼
                     [ ChannelRouter / Middleware ]
                  ├─ apiKeyAuth (Assigns role: 'admin')
                  ├─ AuditMiddleware (Logs raw API key to DB)
                  └─ WebChat WS (No session binding; allows tool_call)
                                    │
                                    ▼
                               [ runAgent() ]
                  ├─ Loop Budget: AGENT_MAX_ITERATIONS (10)
                  ├─ Rate Limiting: Keyed by sessionId (Bypassed by Swarms)
                  └─ ApprovalGate (Mismatched: checks 'delete_file' against 'file_delete')
                                    │
                  ┌─────────────────┴─────────────────┐
                  ▼                                   ▼
          [ ToolRegistry ]                    [ callClaude() Orchestrator ]
    ├─ files: search_files (Leak oracle)      ├─ Injects unescaped facts into prompt
    ├─ sandbox: spawn('node') with PATH=''    ├─ Resolves session history without auth
    ├─ browser: Singleton shared page         └─ Dispatches to LLM Provider
    └─ skills: Child-process interpolation            │
                                         ┌────────────┴────────────┐
                                         ▼                         ▼
                                 [ Anthropic ]              [ Google Gemini ]
                            (Broken wire schema:        (Broken wire schema:
                             invalid 'caller' prop)      invalid 'function' role)
```

---

## 5. Summary of Findings Ranked by Severity

| ID | Title | Severity | Confidence | Affected File(s) |
|---|---|---|---|---|
| **FINDING-01** | Cross-Session Hijacking & Direct Unauthenticated Tool Invocation in WebChat | **Critical** | Confirmed | `src/channels/webchat.ts`, `src/routes/chat.ts` |
| **FINDING-02** | Broken Session Isolation in Orchestrator Permitting Universal Memory Access | **Critical** | Confirmed | `src/llm/orchestrator.ts`, `src/session.ts` |
| **FINDING-03** | Sandbox Execution Inoperable (`PATH: ''` ENOENT) & Host Env Exfiltration | **Critical** | Confirmed | `src/tools/sandbox.ts` |
| **FINDING-15** | Dependency Supply Chain Vulnerabilities (87 CVEs, 7 Critical) | **Critical** | Confirmed | `package-lock.json`, `package.json` |
| **FINDING-04** | API Authentication Collapses to Admin Role; RBAC & Users Bypassed | **High** | Confirmed | `src/middleware/auth.ts`, `src/db.ts` |
| **FINDING-05** | Plaintext API Key Persisted to Database and Exposed in Audit Log API | **High** | Confirmed | `src/audit/middleware.ts`, `src/routes/audit.ts` |
| **FINDING-06** | Approval Gate Bypass via Tool Identifier Mismatch (`delete_file`) | **High** | Confirmed | `src/middleware/approval.ts`, `src/tools/system/files.ts` |
| **FINDING-07** | Shared Browser Singleton Leaks Context, Cookies & Screenshots Across Users | **High** | Confirmed | `src/tools/automation/browser.ts` |
| **FINDING-08** | Insecure DNS & SSRF Redirect Handling to Cloud Metadata in Browser | **High** | Confirmed | `src/tools/automation/browser.ts`, `src/utils/security.ts` |
| **FINDING-09** | Anthropic & Google LLM Adapters Cause 400 Bad Request via Invalid Schemas | **High** | Confirmed | `src/llm/anthropic.ts`, `src/llm/google.ts` |
| **FINDING-10** | File Content Search Oracle Bypasses Blocked File Patterns (`.env`) | **High** | Confirmed | `src/tools/system/files.ts` |
| **FINDING-11** | WebSocket Auth Token in URL Query Params & API Key JWT Secret Reuse | **High** | Confirmed | `src/middleware/websocket-auth.ts`, `src/routes/auth.ts` |
| **FINDING-12** | Persistent Memory Poisoning via Unsanitized Session Facts | **Medium** | Confirmed | `src/llm/orchestrator.ts`, `src/memory/markdown.ts` |
| **FINDING-13** | Multi-Agent Swarms Bypass Rate Limits & Inherit Destructive Tools | **Medium** | Confirmed | `src/agents/swarm.ts`, `src/agent.ts` |
| **FINDING-14** | Dynamic Skill Code Execution via Child-Process String Interpolation | **Medium** | Confirmed | `src/skills/loader.ts` |
| **FINDING-16** | Code Formatting Inconsistencies Across 166 Files | **Medium** | Confirmed | Tracked repository files |
| **FINDING-17** | SQLite Lock Contention Under Parallel Workloads | **Low** | Strongly Supported | `src/db.ts` |
| **FINDING-18** | Abandoned PostgreSQL Database Adapters Left in Git History | **Informational**| Confirmed | `src/db-pg.ts`, `src/db/postgres.ts` |

---

## 6. Functional & Logic Defects

1. **Non-Functional Code Sandbox:** `execute_code` has never functioned due to the `PATH: ''` setting causing `ENOENT` on every attempt.
2. **Destructive Tool Approval Mismatch:** Deleting files via `delete_file` fails to trigger approval because `.env` and `approval.ts` configure `file_delete`.
3. **LLM Wire Protocol Errors:** Calling Anthropic Messages API fails with HTTP 400 whenever tools are invoked due to an unsupported `caller` block and invalid consecutive user turns. Calling Google Gemini fails due to the invalid role `'function'`.
4. **Phantom Approval Configuration:** `http_request` is configured as requiring approval, but no tool named `http_request` exists in the codebase.

---

## 7. Reliability, Concurrency & Performance Concerns

1. **Unbounded WebSocket Connection Rebinding:** Parallel clients claiming the same `chatId` clobber each other's WebSocket references in `sessionConnections`, leading to dropped messages and race conditions.
2. **Shared Browser State:** Concurrency in browser tools is impossible because a single global `page` is shared across all concurrent requests.
3. **Rate Limiting Evasion:** Child swarm subagents generate fresh random session IDs, bypassing the session-level token bucket rate limiter.
4. **SQLite Concurrency:** Burst writes to SQLite under WAL mode risk `SQLITE_BUSY` exceptions due to the lack of an exponential backoff retry policy.

---

## 8. Data Isolation, Privacy & Secret Management Findings

1. **Plaintext Administrative Credentials in Audit Logs:** `src/audit/middleware.ts` persists `req.apiKey` directly into the database `actor_id` column, which is publicly returned by `GET /api/audit`.
2. **Universal Session Introspection:** An attacker who guesses or enumerates session UUIDs can inspect all messages, extracted memory facts, and file attachments without authentication.
3. **Environment Variable Exfiltration via Content Search:** `search_files` allows regular expression content searches across all directory files without enforcing path blacklists, allowing an agent to extract secret keys from `.env`.

---

## 9. Dependency & Supply Chain Findings

`npm audit` reported **87 vulnerabilities** (7 Critical, 22 High):
- `tar` (<=6.2.1): Critical arbitrary file overwrite vulnerability.
- `protobufjs` (<7.2.5): Critical prototype pollution / code execution.
- `proxy-addr` (<=2.0.7): Critical loopback trust bypass via IPv4-mapped IPv6 subnets, subverting IP-based authentication.
- `ws` (<=8.17.0): Denial of Service and uninitialized buffer memory disclosure.

---

## 10. Automated Verification Results

- **TypeScript Compilation (`npm run typecheck`):** **PASS** (0 errors).
- **Unit & Integration Suite (`npm run test:run`):** **PASS** (70 files, 1219 passed).
  *Note:* Unit tests pass because they rely on isolated mocks that conceal real-world wire schema mismatches, sandbox execution crashes, and missing channel-level authorization checks.
- **Production Bundling (`npm run build`):** **PASS** (`dist/index.js` bundled in 68ms).
- **ESLint (`npm run lint`):** **PASS** (0 errors).
- **Prettier (`npm run format:check`):** **FAIL** (166 formatting failures).
- **Dependency Audit (`npm audit`):** **FAIL** (87 CVEs).

---

## 11. Documentation vs. Implementation Summary

| Domain | Documented Claim | Verified Implementation Reality |
|---|---|---|
| **RBAC** | Granular tiers (`admin`, `user`, `viewer`) | All authenticated callers get `role: 'admin'`; `users` table ignored. |
| **Session Isolation** | Strict isolation between tenants | Orchestrator comments confirm ownership is ignored; WebChat allows socket rebinding. |
| **Code Sandbox** | Hardened, isolated code sandbox | Inoperable (`PATH: ''` ENOENT crash); `process.env` exposed to untrusted code. |
| **Approvals** | Mandatory human approval on file deletion | Bypassed due to `delete_file` vs `file_delete` name mismatch. |
| **PostgreSQL** | Enterprise PostgreSQL support | PostgreSQL files deleted from working copy; SQLite used exclusively. |
| **Air-Gap** | Complete egress isolation | Browser navigates arbitrary URLs; LLM failover attempts external network egress. |

---

## 12. Prior Audit Revalidation

Revalidating the historical findings from `.ai/AUDITS/2026-08-24-hostile-audit.md`:
- **Unrestricted Access:** Partial fix (`UNRESTRICTED_ACCESS=false` in `.env`), but negated by tool name mismatch (`delete_file` vs `file_delete`).
- **Memory Poisoning (Risk #1):** **Unresolved.** Facts are still concatenated raw into system prompts without trust delimiters.
- **Identity Layer Absence (Risk #3):** **Unresolved.** Tokens are still passed in query strings, API keys are stored in audit logs, and session ownership is not verified.
- **Anthropic Wire Schema (Risk #7):** **Unresolved.** Invalid `caller` field and consecutive user turns remain in `src/llm/anthropic.ts`.
- **Browser SSRF (Attack Chain):** **Unresolved.** String validation remains vulnerable to DNS rebinding and HTTP 302 redirects.

---

## 13. Prioritized Remediation Roadmap

### Phase 1: Immediate Security Blockers (Sprint 1)
1. **Fix WebChat Session Binding & Disable Tool Injection:** Remove `{ type: 'tool_call' }` from WebSocket message parsing. Immutably bind sockets to handshake session IDs (`FINDING-01`).
2. **Enforce Database Session Ownership:** Validate caller ownership of `sessionId` against the SQLite `sessions` table in `orchestrator.ts` (`FINDING-02`).
3. **Correct Approval Tool Identifier:** Align `APPROVAL_REQUIRED_TOOLS` in `approval.ts` and `.env` to `delete_file` (`FINDING-06`).
4. **Redact API Keys from Audit Logs:** Hash or mask `apiKey` before writing to `audit_log.actor_id` (`FINDING-05`).
5. **Resolve Supply Chain CVEs:** Run `npm audit fix` and upgrade `tar`, `ws`, `express`, `protobufjs`, `vite` (`FINDING-15`).

### Phase 2: Runtime Correctness & Isolation (Sprint 2)
6. **Repair Sandbox Architecture:** Replace host process spawning with a dedicated container or isolate runner. If using child processes, provide absolute binary paths and purge `process.env` (`FINDING-03`).
7. **Isolate Browser Automation:** Migrate from shared singleton to per-session `browser.newContext()` with route-level private IP blocking (`FINDING-07`, `FINDING-08`).
8. **Fix Provider Wire Schemas:** Remove `caller` from Anthropic tool blocks, consolidate tool turns, and map Google function roles to user roles (`FINDING-09`).
9. **Block Sensitive Files in Recursive Search:** Enforce `matchesBlockedPatterns()` on every child file in `search_files` (`FINDING-10`).

### Phase 3: Identity & Architectural Hygiene (Sprint 3)
10. **Implement Genuine RBAC:** Wire API keys to `users` table records and enforce `RBAC_MATRIX` (`FINDING-04`).
11. **Sanitize Prompt Memory Injections:** Enclose recalled facts in demarcated XML tags with trust metadata (`FINDING-12`).
12. **Multi-Agent Rate Limiting:** Enforce parent session quotas on child swarm agents (`FINDING-13`).
13. **Format Codebase:** Run `npm run format` across all files (`FINDING-16`).

---

## 14. Final Release-Readiness Verdict

```
╔═══════════════════════════════════════════════════════════════════════════════════╗
║                                                                                   ║
║   FINAL AUDIT VERDICT: DO NOT APPROVE FOR PRODUCTION / MULTI-USER RELEASE        ║
║                                                                                   ║
║   Status: FAILED GATING REQUIREMENTS                                              ║
║   Critical Vulnerabilities: 4                                                     ║
║   High-Severity Vulnerabilities: 7                                                ║
║   Functional Blockers: 4                                                          ║
║   Supply Chain CVEs: 87 (7 Critical)                                              ║
║                                                                                   ║
╚═══════════════════════════════════════════════════════════════════════════════════╝
```

GravityClaw possesses an elegant local agentic orchestration architecture, but it currently lacks the multi-tenant isolation, authorization controls, provider wire correctness, and dependency hygiene required for safe production deployment. Production release is strictly blocked until Phase 1 and Phase 2 remediation items are implemented and verified.
