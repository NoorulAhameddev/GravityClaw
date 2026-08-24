# GravityClaw — Project Identity

Personal AI agent ecosystem ("personal Jarvis"): multi-channel agent runtime with LLM provider
failover, layered memory, ~107-tool registry, multi-agent orchestration (mesh DAG / swarm),
Telegram + WebChat channels, Express 5 API, React 19 dashboard, CLI.

## Stack
- TypeScript 5.x, ESM, Node >=22 (engines), tsx runtime, esbuild bundle
- better-sqlite3 (default store, WAL) | optional pg adapter | Supabase/ChromaDB optional/dormant
- Express 5 + ws@8; React 19 + Vite dashboard (`dashboard/`); legacy `public/`
- Vitest (67 spec files) + Playwright (11 e2e specs); Zod env config (sole access point — never read process.env directly outside src/config.ts)
- LLM: 12 providers via OpenAI-types lingua franca; FailoverProvider + retry + cache decorators

## Entry points
- Runtime bootstrap: `src/index.ts` (main()) <- `src/cli.ts start` <- `bin/gravityclaw.mjs`
- Composition root: `src/bootstrap.ts`; HTTP: `src/server.ts`; agent loop: `src/pipeline/orchestrator.ts`; LLM calls: `src/llm/orchestrator.ts callClaude()`

## Canonical documents (single source each — do not duplicate)
| Topic | Source |
|---|---|
| Architecture overview | `/ARCHITECTURE.md`, `/docs/architecture/ARCHITECTURE_OVERVIEW.md` |
| Known divergences (doc vs reality) | `.ai/AUDITS/2026-08-24-hostile-audit.md` |
| Ownership / review gates | `/docs/team/ENGINEERING_ORG.md` |
| Deployment guide | `/DEPLOYMENT.md` |
| Env contract | `/.env.example` (~120 vars, tiered) |

## Multi-agent OS
`.ai/` is the canonical project state system. Workspace-level `D:\Projects\.ai_memory\`
is a cross-session pointer layer that must reference this directory, not duplicate it.
