# Environment Variables Reference

This document is auto-generated from `src/config.ts` — the single source of truth for all configuration. All environment variables are documented here with their types, defaults, and descriptions.

---

## Quick Start

```bash
cp .env.example .env
# Edit .env with your values
npm run dev
```

Only `API_KEY` and `LLM_PROVIDER` are required for basic operation. All other variables have safe defaults or disable the feature when empty.

---

## Required

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `API_KEY` | `string` | — | API key for securing API endpoints. Must be 32+ chars in production. |
| `LLM_PROVIDER` | `enum` | `openrouter` | One of: `openrouter`, `anthropic`, `openai`, `google`, `groq`, `deepseek`, `ollama`, `cohere`, `mistral`, `nvidia`, `failover`, `mock`, `opencodezen` |

---

## LLM Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `LLM_MODEL` | `string` | `openrouter/free` | Model identifier for the selected provider |
| `LLM_FAILOVER_LIST` | `string` | `openai,anthropic,openrouter` | Comma-separated fallback providers for failover mode |
| `LLM_MAX_TOKENS` | `number` | `4096` | Max tokens per LLM response (max 8192) |
| `LLM_CACHE_ENABLED` | `boolean` | `false` | Enable LLM response caching |
| `LLM_CACHE_TTL_MS` | `number` | `60000` | TTL for cached responses (ms) |
| `OLLAMA_BASE_URL` | `string` | `http://localhost:11434` | Ollama server URL |

---

## LLM API Keys

| Variable | Type | Description |
|----------|------|-------------|
| `OPENROUTER_API_KEY` | `string` | OpenRouter API key (sk-or-v1-...) |
| `OPENAI_API_KEY` | `string` | OpenAI API key (sk-...) |
| `ANTHROPIC_API_KEY` | `string` | Anthropic API key (sk-ant-...) |
| `GOOGLE_API_KEY` | `string` | Google AI API key |
| `GROQ_API_KEY` | `string` | Groq API key (gsk_...) |
| `DEEPSEEK_API_KEY` | `string` | DeepSeek API key (sk-...) |
| `COHERE_API_KEY` | `string` | Cohere API key |
| `MISTRAL_API_KEY` | `string` | Mistral API key |
| `NVIDIA_API_KEY` | `string` | NVIDIA NGC API key |

---

## Communication Channels

### Telegram

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `TELEGRAM_ENABLED` | `boolean` | `false` | Enable Telegram integration |
| `TELEGRAM_BOT_TOKEN` | `string` | — | Bot token from @BotFather |
| `TELEGRAM_ALLOWED_USER_ID` | `number` | — | Your Telegram user ID from @userinfobot |

### Discord

| Variable | Type | Description |
|----------|------|-------------|
| `DISCORD_BOT_TOKEN` | `string` | Bot token from Discord Developer Portal |
| `DISCORD_GUILD_ID` | `string` | Guild ID for slash command registration (optional) |

### Slack

| Variable | Type | Description |
|----------|------|-------------|
| `SLACK_BOT_TOKEN` | `string` | Bot token from Slack Developer Portal (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | `string` | Signing secret for request verification |
| `SLACK_APP_ID` | `string` | Slack app ID (optional) |

### WhatsApp

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `WHATSAPP_ENABLED` | `boolean` | `false` | Enable WhatsApp channel |

### Signal

| Variable | Type | Description |
|----------|------|-------------|
| `SIGNAL_PHONE_NUMBER` | `string` | Signal bot phone number (e.g., +1234567890) |
| `SIGNAL_GROUP_IDS` | `string` | Comma-separated allowed group IDs (empty = all) |
| `SIGNAL_RECIPIENTS` | `string` | Comma-separated allowed phone numbers for DMs |

### Email

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `EMAIL_SMTP_HOST` | `string` | — | SMTP server (e.g., smtp.gmail.com) |
| `EMAIL_SMTP_PORT` | `number` | `587` | SMTP port |
| `EMAIL_SMTP_USER` | `string` | — | SMTP username |
| `EMAIL_SMTP_PASS` | `string` | — | SMTP password |
| `EMAIL_IMAP_HOST` | `string` | — | IMAP server (e.g., imap.gmail.com) |
| `EMAIL_IMAP_PORT` | `number` | `993` | IMAP port |
| `EMAIL_IMAP_USER` | `string` | — | IMAP username |
| `EMAIL_IMAP_PASS` | `string` | — | IMAP password |
| `EMAIL_FROM_ADDRESS` | `string` | — | Sender email address |
| `EMAIL_ALLOWED_SENDERS` | `string` | — | Comma-separated allowed sender addresses |

---

## Database

SQLite is used by default. All data lives in `data/gravity.db`.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PG_ENABLED` | `boolean` | `false` | Enable PostgreSQL backend |
| `PG_HOST` | `string` | `localhost` | PostgreSQL host |
| `PG_PORT` | `number` | `5432` | PostgreSQL port |
| `PG_DATABASE` | `string` | `gravityclaw` | Database name |
| `PG_USER` | `string` | `postgres` | Database user |
| `PG_PASSWORD` | `string` | — | Database password |
| `PG_CONNECTION_STRING` | `string` | — | Full connection string (overrides individual fields) |
| `PG_POOL_SIZE` | `number` | `10` | Connection pool size |

---

## Productivity Integrations

### Google Calendar

| Variable | Type | Description |
|----------|------|-------------|
| `GOOGLE_CALENDAR_API_KEY` | `string` | API key from Google Cloud Console |
| `GOOGLE_CREDENTIALS_PATH` | `string` | Path to service account or OAuth2 credentials.json |

### Notion

| Variable | Type | Description |
|----------|------|-------------|
| `NOTION_API_KEY` | `string` | Integration key from notion.so/my-integrations |
| `NOTION_DATABASE_ID` | `string` | Database ID for queries (optional) |

---

## Search

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SEARCH_PROVIDER` | `enum` | `duckduckgo` | One of: `duckduckgo`, `serpapi`, `brave` |
| `BRAVE_SEARCH_KEY` | `string` | — | Brave Search API key |
| `SERPAPI_API_KEY` | `string` | — | SerpAPI key |
| `SEARCH_CACHE_TTL_MINUTES` | `number` | `60` | Search result cache TTL |

---

## Voice & Wake Word

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ELEVENLABS_API_KEY` | `string` | — | ElevenLabs TTS API key |
| `ELEVENLABS_VOICE_ID` | `string` | `bella` | Voice ID from ElevenLabs library |
| `WAKE_WORD_ENABLED` | `boolean` | `false` | Enable wake word detection (desktop only) |
| `WAKE_WORD_PHRASE` | `string` | `hey claw` | Wake phrase (use built-in words for best accuracy) |
| `WAKE_WORD_THRESHOLD` | `number` | `0.75` | Confidence threshold (0-1) |

---

## Agent Limits

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `AGENT_MAX_ITERATIONS` | `number` | `10` | Max agent iterations per request |
| `AGENT_MAX_TOOLS_PER_ITERATION` | `number` | `5` | Max tool calls per iteration |
| `AGENT_MAX_TOOLS_TOTAL` | `number` | `50` | Max total tool calls per agent run |
| `AGENT_TOOL_TIMEOUT_MS` | `number` | `60000` | Tool execution timeout (ms) |
| `AGENT_MAX_CONCURRENT` | `number` | `10` | Max concurrent agent sessions |

---

## Token & Cost Management

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `TOKEN_BUDGET_ENABLED` | `boolean` | `false` | Enable token budget tracking |
| `TOKEN_BUDGET_MAX` | `number` | `200000` | Max tokens per run (0 = unlimited) |
| `TOKEN_BUDGET_DIMINISHING_THRESHOLD` | `number` | `500` | Token count below which returns are diminishing |
| `LLM_DAILY_CREDIT_LIMIT` | `number` | — | Max daily cost in USD |
| `LLM_DAILY_TOKEN_LIMIT` | `number` | — | Max daily tokens |
| `LLM_COST_LIMIT_PER_SESSION` | `number` | `10.00` | Max cost per session (0 = unlimited) |

---

## Memory & Knowledge

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SUPABASE_URL` | `string` | — | Supabase project URL for cloud sync |
| `SUPABASE_KEY` | `string` | — | Supabase anon/service key |
| `OPENAI_EMBEDDING_MODEL` | `string` | `text-embedding-3-small` | Embedding model for vector memory |
| `CHROMA_URL` | `string` | — | ChromaDB server URL for vector memory |
| `ENABLE_MEMORY_EXTRACTION` | `boolean` | `true` | Auto-extract memories after each turn |
| `MEMORY_EXTRACTION_MIN_TURNS` | `number` | `3` | Minimum turns before extraction |
| `MEMORY_DIRECTORY_ENABLED` | `boolean` | `true` | Enable memory directory system |
| `MEMORY_DIRECTORY_PATH` | `string` | `./memory` | Custom memory directory path |
| `RETRIEVAL_MEMORY_LIMIT` | `number` | `8` | Max memories to retrieve |
| `RETRIEVAL_MEMORY_MAX_CHARS` | `number` | `1800` | Max chars for retrieved memories |

---

## Auto-Dream (Background Consolidation)

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `AUTO_DREAM_ENABLED` | `boolean` | `false` | Enable auto memory consolidation when away |
| `AUTO_DREAM_MIN_HOURS` | `number` | `24` | Min hours since last consolidation |
| `AUTO_DREAM_MIN_SESSIONS` | `number` | `5` | Min sessions before consolidation triggers |

---

## Microcompact (Context Pruning)

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ENABLE_MICROCOMPACT` | `boolean` | `true` | Enable lightweight context pruning |
| `MICROCOMPACT_MAX_TOOL_RESULT_CHARS` | `number` | `10000` | Max chars per tool result after compaction |
| `MICROCOMPACT_MAX_TOOLS` | `number` | `3` | Max tools to compact per turn |

---

## Retry Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `RETRY_MAX_RETRIES` | `number` | `3` | Max retry attempts for API calls |
| `RETRY_MAX_DELAY_MS` | `number` | `32000` | Max delay between retries (ms) |
| `RETRY_ENABLE_EXPONENTIAL_BACKOFF` | `boolean` | `true` | Enable exponential backoff |

---

## Security & Access Control

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MASTER_KEY` | `string` | — | Encryption key for secrets.enc.json (64-char hex or any string) |
| `AIR_GAPPED` | `boolean` | `false` | Enable air-gapped mode (requires Ollama) |
| `SECRET_ROTATION_DAYS` | `number` | `90` | Days before secrets flagged for rotation |
| `SECRET_CLEANUP_DAYS` | `number` | `90` | Days to keep deleted secrets before cleanup |
| `SAFE_DIRECTORIES` | `string` | `.` | Comma-separated allowed directories for file ops |
| `PATH_ALLOWLIST` | `string` | — | Comma-separated path allowlist |
| `SECURITY_AUDIT_ENABLED` | `boolean` | `true` | Enable file access audit logging |
| `UNRESTRICTED_ACCESS` | `boolean` | `false` | **DANGER:** Bypasses all path validation (blocked in production) |
| `HEALTH_API_KEY` | `string` | — | Separate API key for health check endpoints |
| `HEALTH_REQUIRE_AUTH` | `boolean` | `false` | Require auth for health check endpoints |
| `FILE_ACCESS_LOG_RETENTION_DAYS` | `number` | `90` | File access log retention period |
| `AUTH_TRUSTED_CIDRS` | `string` | — | Comma-separated trusted CIDRs |
| `AUTH_ALLOW_LOCALHOST` | `boolean` | `false` | Allow localhost bypass in production |

### Approval Middleware

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `APPROVAL_ENABLED` | `boolean` | `true` | Enable human-in-the-loop approval |
| `APPROVAL_TIMEOUT_MINUTES` | `number` | `5` | Timeout for approval requests (min) |
| `APPROVAL_REQUIRED_TOOLS` | `string` | `run_shell,file_delete,http_request,execute_code` | Comma-separated tools requiring approval |

---

## SSO / Authentication

| Variable | Type | Description |
|----------|------|-------------|
| `SAML_ENABLED` | `string` | Enable SAML SSO |
| `SAML_ENTRY_POINT` | `string` | SAML identity provider entry point |
| `SAML_ISSUER` | `string` | SAML issuer/entity ID |
| `SAML_CALLBACK_URL` | `string` | SAML callback/ACS URL |
| `SAML_CERT` | `string` | SAML certificate |
| `OIDC_ENABLED` | `string` | Enable OpenID Connect |
| `OIDC_ISSUER` | `string` | OIDC issuer URL |
| `OIDC_CLIENT_ID` | `string` | OIDC client ID |
| `OIDC_CLIENT_SECRET` | `string` | OIDC client secret |
| `OIDC_CALLBACK_URL` | `string` | OIDC redirect URI |

---

## Proactive Features

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `RECAP_HOUR_LOCAL` | `number` | `20` | Hour of day for daily recap (0-23) |
| `RECOMMENDATIONS_DAILY_CRON` | `string` | `0 9 * * *` | Cron expression for daily recommendations |

---

## Planning Mode

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PLANNING_MODE` | `enum` | `auto` | One of: `off`, `auto`, `force` |
| `PLANNING_MESSAGE_LENGTH_THRESHOLD` | `number` | `200` | Message char length to trigger planning |

---

## Background Queue

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `QUEUE_ENABLED` | `boolean` | `false` | Enable background task queue |
| `REDIS_URL` | `string` | — | Redis URL for queue backend |
| `QUEUE_CONCURRENCY` | `number` | `5` | Queue worker concurrency |

---

## Backup System

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `BACKUP_ENABLED` | `boolean` | `true` | Enable automatic backup system |
| `BACKUP_DIR` | `string` | `backups` | Backup directory |
| `BACKUP_CRON` | `string` | `0 2 * * *` | Cron for automatic backups (daily at 2AM) |
| `BACKUP_RETENTION_DAYS` | `number` | `30` | Backup retention period |
| `BACKUP_ENCRYPT` | `boolean` | `true` | Enable backup encryption |
| `BACKUP_COMPRESS` | `boolean` | `true` | Enable backup compression |
| `BACKUP_MASTER_KEY` | `string` | — | Master key for backup encryption (defaults to MASTER_KEY) |

---

## Observability & Monitoring

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SENTRY_DSN` | `string` | — | Sentry DSN for error tracking |
| `LOG_LEVEL` | `enum` | `info` | One of: `debug`, `info`, `warn`, `error` |
| `LOG_FORMAT` | `enum` | `text` | One of: `text`, `json` |
| `ENABLE_CALLER_INFO` | `boolean` | `false` | Include caller info in logs |
| `ENABLE_METRICS` | `boolean` | `false` | Enable performance metrics |
| `ENABLE_METRICS_PERSISTENCE` | `boolean` | `false` | Persist metrics to disk |
| `METRICS_RETENTION_HOURS` | `number` | `24` | Metrics retention period |
| `ENABLE_TRACING` | `boolean` | `false` | Enable distributed tracing |
| `OTEL_ENABLED` | `boolean` | `false` | Enable OpenTelemetry |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `string` | — | OTLP exporter endpoint |
| `CORRELATION_ID_HEADER` | `string` | `x-correlation-id` | Header name for request correlation |

---

## Server

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PORT` | `number` | `3000` | HTTP server port |
| `NODE_ENV` | `enum` | `development` | One of: `development`, `test`, `production` |
| `WEBHOOK_BASE_URL` | `string` | — | Base URL for webhook callbacks |

---

## OpenCode Zen (Internal)

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `OPENCODEZEN_API_KEY` | `string` | — | OpenCode Zen API key |
| `OPENCODEZEN_BASE_URL` | `string` | `https://opencode.ai/zen/v1` | OpenCode Zen base URL |

---

## Other

| Variable | Type | Description |
|----------|------|-------------|
| `VITEST` | `string` | Internal — set by Vitest test runner |

---

## Programmatic Access

All environment variables are accessible via the config module:

```typescript
import { config } from "./config.ts";
console.log(config.LLM_PROVIDER);    // "openrouter"
console.log(config.API_KEY);         // "your-api-key-..."
```

Helper functions:

- `getAllowedPaths()` — Returns resolved path allowlist as array
- `getSafeDirectories()` — Returns safe directories as array

---

## Validation on Startup

Gravity Claw validates all env vars on startup using Zod. If any required vars are missing or invalid, the server will print detailed error messages and exit. Always refer to this document when troubleshooting configuration issues.

**Last Updated**: July 19, 2026
