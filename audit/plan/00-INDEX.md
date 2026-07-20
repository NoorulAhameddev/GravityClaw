# GravityClaw — Master Remediation Plan Index

> **Classification:** INTERNAL — Engineering Team
> **Total Issues:** ~150+ (including sub-issues)
> **Estimated Total Effort:** 6-9 months (team of 2-3 engineers)
> **Priority:** P0-P4
> **Dependencies:** Tracked per-issue

---

## Document Structure

| File | Contents |
|------|----------|
| `00-INDEX.md` | This file — master index, dependency graph, conventions |
| `01-ISSUE-DATABASE.md` | Every issue cataloged with severity, effort, phase, file refs |
| `02-PHASE-0.md` | **Stop the Bleeding** — security triage, critical bug fixes (Week 1) |
| `03-PHASE-1.md` | **Production Hardening** — infrastructure, monitoring, auth (Weeks 2-3) |
| `04-PHASE-2.md` | **Quality & Testing** — tests, code quality, docs (Weeks 4-7) |
| `05-PHASE-3.md` | **Scale & Polish** — performance, streaming, UX (Months 2-3) |
| `06-PHASE-4.md` | **Enterprise Readiness** — scaling, compliance, ecosystem (Months 3-6) |

---

## Dependency Graph

```
Phase 0 (Week 1)
  │
  ├── C-1: Shell tool validation
  ├── C-2: MCP env filter
  ├── C-3: Postgres await fix
  ├── C-4: Timing attack fix
  ├── E-1: Global error handler
  ├── A-1: Input sanitization
  ├── A-2: Output validation (start)
  ├── S-1: WebSocket auth secure
  ├── S-2: Mobile approval auth
  ├── F-1: Frontend error boundary
  └── D-1: Broken link fixes
        │
        ▼
Phase 1 (Weeks 2-3)
  │
  ├── Depends on: Phase 0 completion
  ├── Server.ts decomposition ← blocked by E-1
  ├── runAgent() decomposition ← blocked by A-1, A-2
  ├── Migration consolidation ← blocked by C-3
  ├── CI/CD setup ← blocked by (nothing, parallel)
  ├── 12+ FK constraints ← blocked by C-3
  ├── Docker hardening ← blocked by (nothing)
  ├── JWT RFC fix ← blocked by S-1
  ├── Secrets cache fix ← blocked by (nothing)
  ├── Sandbox bash sanitization ← blocked by C-1
  ├── Swarm safety controls ← blocked by A-1, A-2
  ├── Liveness/readiness probes ← blocked by E-1
  ├── Monitoring setup ← blocked by (nothing)
  │
  ├── Parallel track: Documentation overhaul
  ├── Parallel track: Dead code removal
  └── Parallel track: Security scanning
        │
        ▼
Phase 2 (Weeks 4-7)
  │
  ├── Depends on: Phase 0 + Phase 1
  ├── Test infrastructure ← blocked by CI/CD
  ├── Config.ts test suite ← blocked by (nothing, but needs CI)
  ├── LLM provider tests ← blocked by (nothing)
  ├── Security pipeline tests ← blocked by S-1, S-2
  ├── Frontend tests ← blocked by F-1
  ├── Any type elimination ← blocked by (nothing, incremental)
  ├── Lint rules ← blocked by (nothing)
  ├── Documentation consolidation ← blocked by D-1
  ├── Dual telemetry consolidation ← blocked by (nothing)
  ├── Orphaned file removal ← blocked by (nothing)
  │
  └── Parallel track: E2E test stabilization
        │
        ▼
Phase 3 (Months 2-3)
  │
  ├── Depends on: Phase 2
  ├── Performance: O(n)→O(1) LRU ← blocked by (nothing)
  ├── Performance: Parallel tool execution ← blocked by runAgent() decomposition
  ├── Performance: LLM cache eviction ← blocked by (nothing)
  ├── Performance: SHA-1 offload ← blocked by (nothing)
  ├── Performance: BM25 indexing ← blocked by migration consolidation
  ├── Performance: getHistory pagination ← blocked by (nothing)
  ├── LLM streaming (all providers) ← blocked by (nothing, big effort)
  ├── Telegram hard dependency removal ← blocked by (nothing)
  ├── CLI init wizard ← blocked by (nothing)
  ├── 349-line .env reduction ← blocked by (nothing)
  ├── Frontend ARIA/memo/routing ← blocked by F-1
  ├── Hallucination detection ← blocked by A-2
  │
  └── Parallel track: API versioning
        │
        ▼
Phase 4 (Months 3-6)
  │
  ├── Depends on: Phase 3
  ├── Horizontal scaling
  ├── SSO/SAML/RBAC
  ├── Zero-downtime deploys
  ├── Plugin marketplace
  ├── SOC2-type controls
  ├── Multi-tenant isolation
  └── Public SDK/API
```

---

## Severity Classification

| Level | Definition | Response Time |
|-------|------------|---------------|
| **P0-CRITICAL** | Security vuln (CVSS > 7.0), data loss, complete system failure | Within hours |
| **P1-HIGH** | Significant security risk, major architectural flaw, broken feature | Within days |
| **P2-MEDIUM** | Code smell, performance concern, missing test coverage | Within sprints |
| **P3-LOW** | Style issue, minor optimization, nice-to-have | When time permits |
| **P4-DECORATIVE** | Cosmetic, documentation polish, minor UX | Icebox |

---

## Effort Estimation

| Effort | Range | Example |
|--------|-------|---------|
| **XS** | 15-30 min | Fix a broken link, add `.dockerignore` |
| **S** | 1-4 hours | Add `LIMIT` to query, cache AJV schema |
| **M** | 1-3 days | Decompose server.ts, add CI/CD, fix JWT |
| **L** | 1-2 weeks | Implement streaming, add test framework, fix all `any` types |
| **XL** | 2-4 weeks | Plugin marketplace, horizontal scaling, multi-tenant |
| **XXL** | 1-3 months | Enterprise readiness, SOC2, public SDK |

---

## How to Use This Plan

1. **Start with Phase 0** — every issue in Phase 0 is a blocker for everything else
2. **Work in parallel where possible** — the dependency graph shows which tracks are independent
3. **Each issue has a "Fix" section** — specific code changes, not general advice
4. **Reassess after each phase** — the plan should be updated as the codebase evolves
5. **Phase 0 is non-negotiable** — do not skip it even if "nothing is broken right now"

---

## Source Reports

| Agent | Focus | File Reference |
|-------|-------|----------------|
| Agent 1 | Reverse Engineer | `audit/REVERSE_ENGINEER.md` |
| Agent 2 | Code Quality | `audit/CODE_QUALITY.md` |
| Agent 3 | Security | `audit/SECURITY.md` |
| Agent 4 | Performance | `audit/PERFORMANCE.md` |
| Agent 5 | DevOps | `audit/DEVOPS.md` |
| Agent 6 | Database | `audit/DATABASE.md` |
| Agent 7 | AI/LLM | `audit/AI_LLM.md` |
| Agent 8 | Frontend | `audit/FRONTEND.md` |
| Agent 9 | Backend | `audit/BACKEND.md` |
| Agent 10 | Product | `audit/PRODUCT.md` |
| Agent 11 | QA | `audit/QA.md` |
| Agent 12 | Documentation | `audit/DOCS.md` |
| Agent 13 | Forensics | `audit/FORENSICS.md` |
| Agent 14 | CTO Synthesis | `audit/CTO-FINAL-SYNTHESIS.md` |

---

*Generated 2026-07-18 | Next review: After Phase 0 completion*
