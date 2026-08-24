# Architecture index (thin layer — no duplication)

Canonical architecture docs live at repo root and docs/. This file only indexes them and records
where reality diverges, so agents don't trust prose over code.

## Read order
1. `/ARCHITECTURE.md` — module layout map (verified accurate as of 6251960)
2. `/docs/architecture/ARCHITECTURE_OVERVIEW.md` — narrative overview
3. `/docs/team/ENGINEERING_ORG.md` — ownership boundaries per subsystem
4. `.ai/AUDITS/2026-08-24-hostile-audit.md` — ground-truth divergences + severity ranking

## Known doc-vs-reality divergences (as of 2026-08-24)
| Claimed | Reality |
|---|---|
| Per-session concurrency limiting | Not implemented (no activeAgents check) — GC-003 |
| Microcompact context protection | Dead code (tool-name set matches zero registry names) |
| BM25 fallback tier | Dead code (caller never invoked) |
| AIR_GAPPED => zero external calls | False: node-fetch SDKs, grammy, gaxios, Sentry/OTel escape fetch patch; playwright MCP child downloads packages |
| Plugins system | Inert scaffolding (install throws; zero discovery) — safe-by-absence |
| RBAC/multi-tenant | Cosmetic; req.user never populated; TenantAwareDb never instantiated (latent SQLi if ever wired) |
| Prod stack (Terraform ALB, nginx prod, PagerDuty runbook) | Never applied/run; fictional scaffolding |

Rule: when docs and code disagree, code wins; log the divergence here or in the AUDITS file.
