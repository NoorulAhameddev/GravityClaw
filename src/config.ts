import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
    TELEGRAM_BOT_TOKEN: z
        .string()
        .min(1, "TELEGRAM_BOT_TOKEN is required — get one from @BotFather"),
    TELEGRAM_ALLOWED_USER_ID: z
        .string()
        .min(1, "TELEGRAM_ALLOWED_USER_ID is required — get it from @userinfobot")
        .transform((val) => {
            const id = parseInt(val, 10);
            if (isNaN(id)) throw new Error("TELEGRAM_ALLOWED_USER_ID must be a numeric ID");
            return id;
        }),
    
    // LLM Provider Configuration
    LLM_PROVIDER: z
        .enum(["openrouter", "anthropic", "openai", "google", "groq", "deepseek", "ollama", "failover"])
        .default("openrouter"),
    LLM_MODEL: z
        .string()
        .default("openrouter/free"),
    LLM_FAILOVER_LIST: z
        .string()
        .optional()
        .default("openai,anthropic,openrouter")
        .describe("Comma-separated list of providers to use in failover mode (e.g., 'openai,anthropic,groq')"),
    
    // API Keys for different providers (at least one required based on LLM_PROVIDER)
    OPENROUTER_API_KEY: z
        .string()
        .optional(),
    OPENAI_API_KEY: z
        .string()
        .optional(),
    ANTHROPIC_API_KEY: z
        .string()
        .optional(),
    GOOGLE_API_KEY: z
        .string()
        .optional(),
    GROQ_API_KEY: z
        .string()
        .optional(),
    DEEPSEEK_API_KEY: z
        .string()
        .optional(),
    SUPABASE_URL: z
        .string()
        .optional(),
    SUPABASE_KEY: z
        .string()
        .optional(),
    OPENAI_EMBEDDING_MODEL: z
        .string()
        .optional()
        .default("text-embedding-3-small"),
    
    // ElevenLabs Voice Configuration
    ELEVENLABS_API_KEY: z
        .string()
        .optional()
        .describe("ElevenLabs API key for text-to-speech (optional)"),
    ELEVENLABS_VOICE_ID: z
        .string()
        .optional()
        .default("bella")
        .describe("Default ElevenLabs voice ID (bella, eric, essie, isabella, james, jessica, josh, kunka, lah, michael, rachel, samantha, sarah, william)"),
    
    // Wake Word Detection Configuration (Desktop/Local Only)
    WAKE_WORD_ENABLED: z
        .string()
        .optional()
        .default("false")
        .transform((val) => val === "true" || val === "1")
        .describe("Enable wake word detection (requires microphone access, desktop only)"),
    WAKE_WORD_PHRASE: z
        .string()
        .optional()
        .default("hey claw")
        .describe("Custom wake phrase (default: 'hey claw'). Use built-in words like 'go', 'stop', 'yes', 'no' for better accuracy."),
      WAKE_WORD_THRESHOLD: z
        .string()
        .optional()
        .default("0.75")
        .transform((val) => parseFloat(val))
        .describe("Confidence threshold for wake word detection (0-1, default: 0.75)"),
    
    OLLAMA_BASE_URL: z
        .string()
        .optional()
        .default("http://localhost:11434"),
    
    // Encrypted Secrets
    MASTER_KEY: z
        .string()
        .optional()
        .describe("Master encryption key for secrets.enc.json (64-char hex or any string) - generate with: npm run secret:generate"),
    
    // Security Configuration
    SECRET_ROTATION_DAYS: z
        .string()
        .optional()
        .default("90")
        .transform((val) => parseInt(val, 10))
        .describe("Number of days before secrets are flagged for rotation (default: 90)"),
    SECRET_CLEANUP_DAYS: z
        .string()
        .optional()
        .default("90")
        .transform((val) => parseInt(val, 10))
        .describe("Number of days to keep deleted secrets before cleanup (default: 90)"),
    SAFE_DIRECTORIES: z
        .string()
        .optional()
        .default(".")
        .describe("Comma-separated list of allowed directories for file operations (default: workspace only)"),
    SECURITY_AUDIT_ENABLED: z
        .string()
        .optional()
        .default("true")
        .transform((val) => val === "true" || val === "1")
        .describe("Enable security audit logging for secrets and file access (default: true)"),
    FILE_ACCESS_LOG_RETENTION_DAYS: z
        .string()
        .optional()
        .default("30")
        .transform((val) => parseInt(val, 10))
        .describe("Retain file access logs for N days before cleanup (default: 30)"),
    
    // File Operations Security
    PATH_ALLOWLIST: z
        .string()
        .optional()
        .default("")
        .describe("Comma-separated list of allowed directories for file operations. Empty = workspace directory only. Example: '/home/user/docs,/tmp'"),
    
    // Web Search Configuration
    SEARCH_PROVIDER: z
        .enum(["duckduckgo", "serpapi", "brave"])
        .optional()
        .default("duckduckgo")
        .describe("Search provider: 'duckduckgo' (free), 'serpapi' (requires SERPAPI_API_KEY), or 'brave' (requires BRAVE_SEARCH_KEY and free tier: 2k/month)"),
    SERPAPI_API_KEY: z
        .string()
        .optional()
        .describe("SerpAPI key (for SEARCH_PROVIDER=serpapi). Get from https://serpapi.com"),
    BRAVE_SEARCH_KEY: z
        .string()
        .optional()
        .describe("Brave Search API key (for SEARCH_PROVIDER=brave). Get from https://api.search.brave.com"),
    SEARCH_CACHE_TTL_MINUTES: z
        .string()
        .optional()
        .default("60")
        .transform((val) => {
            const n = parseInt(val, 10);
            if (isNaN(n) || n < 1) return 60;
            return n;
        })
        .describe("Cache TTL in minutes for search results (default: 60)"),
    
    AGENT_MAX_ITERATIONS: z
        .string()
        .default("10")
        .transform((val) => {
            const n = parseInt(val, 10);
            if (isNaN(n) || n < 1) throw new Error("AGENT_MAX_ITERATIONS must be a positive integer");
            return n;
        }),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    WHATSAPP_ENABLED: z
        .string()
        .optional()
        .default("false")
        .transform((val) => val === "true" || val === "1"),
    PORT: z
        .string()
        .optional()
        .default("3000")
        .transform((val) => parseInt(val, 10)),
    
    // Webhook Configuration
    WEBHOOK_BASE_URL: z
        .string()
        .optional()
        .describe("Base URL for webhook endpoints (e.g., 'https://yourdomain.com'). Defaults to http://localhost:PORT"),

    // Air-Gapped Mode (local-only, no external APIs)
    AIR_GAPPED: z
        .string()
        .optional()
        .default("false")
        .transform((val) => val === "true" || val === "1")
        .describe("Enable air-gapped mode — disables all external APIs and forces local models only (requires Ollama running)"),

    // Phase 6 Proactive Behaviors
    RECAP_HOUR_LOCAL: z
        .string()
        .optional()
        .default("20")
        .transform((val) => {
            const hour = parseInt(val, 10);
            if (isNaN(hour) || hour < 0 || hour > 23) return 20;
            return hour;
        })
        .describe("Local hour (0-23) for the daily evening recap. Default: 20 (8 PM)"),
    RECOMMENDATIONS_DAILY_CRON: z
        .string()
        .optional()
        .default("0 9 * * *")
        .describe("Cron expression for the daily smart recommendations sweep. Default: 0 9 * * *"),

    // Observability Configuration
    LOG_FORMAT: z
        .enum(["pretty", "json"])
        .optional()
        .default("pretty")
        .describe("Log output format: 'pretty' for development, 'json' for production/parsing"),
    ENABLE_CALLER_INFO: z
        .string()
        .optional()
        .default("false")
        .transform((val) => val === "true" || val === "1")
        .describe("Include source file and line number in log output (slight performance cost)"),
    ENABLE_METRICS: z
        .string()
        .optional()
        .default("true")
        .transform((val) => val === "true" || val === "1")
        .describe("Enable metrics collection and recording"),
    ENABLE_METRICS_PERSISTENCE: z
        .string()
        .optional()
        .default("false")
        .transform((val) => val === "true" || val === "1")
        .describe("Persist metrics to SQLite (default: in-memory only)"),
    METRICS_RETENTION_HOURS: z
        .string()
        .optional()
        .default("24")
        .transform((val) => {
            const n = parseInt(val, 10);
            return isNaN(n) || n < 1 ? 24 : n;
        })
        .describe("How long to retain metrics in memory (hours)"),
    CORRELATION_ID_HEADER: z
        .string()
        .optional()
        .default("X-Correlation-ID")
        .describe("HTTP header name for correlation ID propagation"),
    ENABLE_TRACING: z
        .string()
        .optional()
        .default("true")
        .transform((val) => val === "true" || val === "1")
        .describe("Enable distributed tracing and span collection"),
    OTEL_ENABLED: z
        .string()
        .optional()
        .default("false")
        .transform((val) => val === "true" || val === "1")
        .describe("Enable OpenTelemetry export (requires OTEL_EXPORTER_OTLP_ENDPOINT)"),
    OTEL_EXPORTER_OTLP_ENDPOINT: z
        .string()
        .optional()
        .describe("OpenTelemetry collector endpoint (e.g., http://localhost:4318)"),

    // Backup & Restore Configuration
    BACKUP_ENABLED: z
        .string()
        .optional()
        .default("true")
        .transform((val) => val === "true" || val === "1")
        .describe("Enable automatic backup scheduler (default: true)"),
    BACKUP_CRON: z
        .string()
        .optional()
        .default("0 2 * * *")
        .describe("Cron expression for backup schedule (default: 0 2 * * * = daily at 2 AM)"),
    BACKUP_RETENTION_DAYS: z
        .string()
        .optional()
        .default("30")
        .transform((val) => {
            const n = parseInt(val, 10);
            return isNaN(n) || n < 1 ? 30 : n;
        })
        .describe("Number of days to retain backups (default: 30)"),
    BACKUP_ENCRYPT: z
        .string()
        .optional()
        .default("true")
        .transform((val) => val === "true" || val === "1")
        .describe("Encrypt backups with AES-256-GCM (default: true)"),
    BACKUP_COMPRESS: z
        .string()
        .optional()
        .default("true")
        .transform((val) => val === "true" || val === "1")
        .describe("Compress backups with gzip (default: true)"),
    BACKUP_DIR: z
        .string()
        .optional()
        .describe("Directory to store backups (default: ./backups)"),
    BACKUP_MASTER_KEY: z
        .string()
        .optional()
        .describe("Master key for backup encryption (uses MASTER_KEY if not set)"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error("\n❌ Gravity Claw startup failed — invalid configuration:\n");
    for (const issue of parsed.error.issues) {
        const field = issue.path.join(".");
        console.error(`  • ${field}: ${issue.message}`);
    }
    console.error("\n→ Copy .env.example to .env and fill in all required values.\n");
    process.exit(1);
}

export const config = parsed.data;

// Destructure commonly used values for convenience
export const {
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_ALLOWED_USER_ID,
    LLM_PROVIDER,
    LLM_MODEL,
    OPENAI_API_KEY,
    AGENT_MAX_ITERATIONS,
    LOG_LEVEL,
    LOG_FORMAT,
    ENABLE_CALLER_INFO,
    PORT,
    WAKE_WORD_PHRASE,
    WAKE_WORD_THRESHOLD,
    WAKE_WORD_ENABLED,
    PATH_ALLOWLIST,
    SEARCH_PROVIDER,
    SERPAPI_API_KEY,
    BRAVE_SEARCH_KEY,
    SEARCH_CACHE_TTL_MINUTES,
    AIR_GAPPED,
    ENABLE_METRICS,
    ENABLE_METRICS_PERSISTENCE,
    METRICS_RETENTION_HOURS,
    CORRELATION_ID_HEADER,
    ENABLE_TRACING,
    OTEL_ENABLED,
    OTEL_EXPORTER_OTLP_ENDPOINT,
    SECRET_ROTATION_DAYS,
    SECRET_CLEANUP_DAYS,
    SAFE_DIRECTORIES,
    SECURITY_AUDIT_ENABLED,
    FILE_ACCESS_LOG_RETENTION_DAYS,
} = config;

// Helper: Get allowed paths as array
export function getAllowedPaths(): string[] {
    if (!PATH_ALLOWLIST || PATH_ALLOWLIST.trim() === '') {
        // Default to workspace directory only
        return [process.cwd()];
    }
    return PATH_ALLOWLIST.split(',').map(p => p.trim()).filter(p => p.length > 0);
}

// Helper: Get safe directories as array
export function getSafeDirectories(): string[] {
    if (!SAFE_DIRECTORIES || SAFE_DIRECTORIES.trim() === '') {
        // Default to workspace directory only
        return [process.cwd()];
    }
    return SAFE_DIRECTORIES.split(',').map(p => p.trim()).filter(p => p.length > 0);
}
