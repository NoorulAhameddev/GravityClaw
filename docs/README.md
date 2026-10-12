# Gravity Claw Documentation

Welcome to the Gravity Claw documentation. This directory provides practical, clear technical documentation for operating and developing Gravity Claw.

## 📁 Directory Structure

### Core References (`docs/`)

- [INDEX.md](INDEX.md) — Master documentation index and sitemap
- [environment.md](environment.md) — Comprehensive reference of all supported environment variables
- [AIRGAP.md](AIRGAP.md) — Air-gapped offline operation with local LLMs (Ollama)
- [ENCRYPTED_SECRETS.md](ENCRYPTED_SECRETS.md) — AES-256-GCM encrypted secrets vault
- [MULTI_AGENT_SYSTEMS.md](MULTI_AGENT_SYSTEMS.md) — Swarms and DAG-based Mesh workflows
- [SKILLS_GUIDE.md](SKILLS_GUIDE.md) — Guide for defining prompt-based agent skills
- [TOOLS_REFERENCE.md](TOOLS_REFERENCE.md) — Complete catalog of all 80+ built-in tools
- [PROACTIVE_FEATURES.md](PROACTIVE_FEATURES.md) — Heartbeat check-ins and cron tasks

### `/architecture` — System Architecture

- [ARCHITECTURE.md](architecture/ARCHITECTURE.md) — Request flow, agent loop sequence diagrams, and subsystem design
- [PIPELINE.md](architecture/PIPELINE.md) — Agent execution pipeline

### `/guides` — User & Operational Guides

- [CLI.md](guides/CLI.md) — Command-line interface reference and interactive commands
- [API.md](guides/API.md) — REST endpoints and WebSocket protocol
- [DEPLOYMENT.md](guides/DEPLOYMENT.md) — Local development and VPS deployment
- [MODEL_SWITCHING.md](guides/MODEL_SWITCHING.md) — Dynamic model selection and failover chains

### `/features` — Feature Documentation

- [BACKUP_RESTORE_SYSTEM.md](features/backup/BACKUP_RESTORE_SYSTEM.md) — Automated database backup and restore system
- [CANVAS.md](features/canvas/CANVAS.md) — Live Canvas (A2UI) widgets
- [EXPORT_FUNCTIONALITY.md](features/export/EXPORT_FUNCTIONALITY.md) — Chat history and memory export
- [OBSERVABILITY.md](features/observability/OBSERVABILITY.md) — Structured logging, Prometheus metrics, and tracing
- [PERFORMANCE.md](features/performance/PERFORMANCE.md) — Caching strategies and performance tuning
- [RATE_LIMITING.md](features/rate-limiting/RATE_LIMITING.md) — Token-bucket rate limiting system
- [AUTH_AND_AUDIT.md](features/security/AUTH_AND_AUDIT.md) — Personal Agent Security Model and local audit log
- [TOUCH_GESTURES.md](features/touch-gestures/TOUCH_GESTURES.md) — Mobile gesture interactions
- [MCP_BRIDGE.md](features/MCP_BRIDGE.md) — Model Context Protocol integration

---

## 🔍 Quick Navigation

**Getting Started:**
1. Start with [CLI.md](guides/CLI.md) or [environment.md](environment.md)
2. Explore available capabilities in [TOOLS_REFERENCE.md](TOOLS_REFERENCE.md)
3. Learn the system architecture in [ARCHITECTURE.md](architecture/ARCHITECTURE.md)

**Master Index:**
See [INDEX.md](INDEX.md) for the complete documentation index.
