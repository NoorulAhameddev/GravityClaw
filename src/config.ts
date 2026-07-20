import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
    SENTRY_DSN: z.string().optional(),
    TELEGRAM_BOT_TOKEN: z
        .string()
        .optional()
        .describe("Telegram bot token from @BotFather. If not set, Telegram integration is disabled."),
    TELEGRAM_ALLOWED_USER_ID: z
        .string()
        .optional()
        .transform((val) => {
            if (!val) return undefined;
            const id = parseInt(val, 10);
            if (isNaN(id)) throw new Error("TELEGRAM_ALLOWED_USER_ID must be a numeric ID");
            return id;
        })
        .describe("Your Telegram user ID from @userinfobot. Required if TELEGRAM_BOT_TOKEN is set."),
    TELEGRAM_ENABLED: z
        .string()
        .optional()
        .default("false")
        .transform(val => val === "true" || val === "1")
        .describe("Set to 'true' to enable Telegram integration (requires TELEGRAM_BOT_TOKEN)."),
    
    // LLM Provider Configuration
    LLM_PROVIDER: z
        .enum(["openrouter", "anthropic", "openai", "google", "groq", "deepseek", "ollama", "cohere", "mistral", "nvidia", "failover", "mock", "opencodezen"])
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
    OPENCODEZEN_API_KEY: z
        .string()
        .optional(),
    OPENCODEZEN_BASE_URL: z
        .string()
        .optional()
        .default("https://opencode.ai/zen/v1"),
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
    COHERE_API_KEY: z
        .string()
        .optional(),
    MISTRAL_API_KEY: z
        .string()
        .optional(),
    NVIDIA_API_KEY: z
        .string()
        .optional()
        .describe("NVIDIA API key for direct NVIDIA NGC access (get from https://org.ngc.nvidia.com)"),
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
    
    // Daily Rate Limits
    LLM_DAILY_CREDIT_LIMIT: z
        .string()
        .optional()
        .transform((val) => (val ? parseFloat(val) : undefined))
        .describe("Maximum daily cost in USD (e.g., 5.0)"),
    LLM_DAILY_TOKEN_LIMIT: z
        .string()
        .optional()
        .transform((val) => (val ? parseInt(val, 10) : undefined))
        .describe("Maximum daily tokens (e.g., 100000)"),
    
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
    
    // OLLAMA Configuration
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
        .describe("Enable security audit logging for file access"),
    UNRESTRICTED_ACCESS: z
        .string()
        .optional()
        .default("false")
        .transform((val) => val === "true" || val === "1")
        .describe("Enable unrestricted access to all files and shell commands anywhere on the system"),
    
    // API Authentication
    API_KEY: z
        .string()
        .optional()
        .describe("API key for securing API endpoints (required for production)")
        .refine((val) => {
            if (process.env.NODE_ENV === 'production' && (!val || val.length < 32)) {
                return false;
            }
            return true;
        }, {
            message: "API_KEY must be at least 32 characters in production"
        }),
    
    // Health Check Authentication
    HEALTH_API_KEY: z
        .string()
        .optional()
        .describe("Separate API key for health check endpoints (allows Docker HEALTHCHECK, k8s probes)"),
    HEALTH_REQUIRE_AUTH: z
        .string()
        .optional()
        .default("false")
        .transform(val => val === "true" || val === "1")
        .describe("Require authentication for health check endpoints"),

    // Environment
    SAML_ENABLED: z.string().optional(),
    SAML_ENTRY_POINT: z.string().optional(),
    SAML_ISSUER: z.string().optional(),
    SAML_CALLBACK_URL: z.string().optional(),
    SAML_CERT: z.string().optional(),
    OIDC_ENABLED: z.string().optional(),
    OIDC_ISSUER: z.string().optional(),
    OIDC_CLIENT_ID: z.string().optional(),
    OIDC_CLIENT_SECRET: z.string().optional(),
    OIDC_CALLBACK_URL: z.string().optional(),

    NODE_ENV: z
        .enum(["development", "test", "production"])
        .default("development"),
    VITEST: z
        .string()
        .optional(),
    
    // External Services
    DISCORD_BOT_TOKEN: z
        .string()
        .optional()
        .describe("Discord bot token for the Discord channel (get from Discord Developer Portal)"),
    DISCORD_GUILD_ID: z
        .string()
        .optional()
        .describe("Discord guild ID for registering slash commands (optional)"),
    
    // Slack Configuration
    SLACK_BOT_TOKEN: z
        .string()
        .optional()
        .describe("Slack bot token for the Slack channel (get from Slack Developer Portal)"),
    SLACK_SIGNING_SECRET: z
        .string()
        .optional()
        .describe("Slack signing secret for request verification (get from Slack Developer Portal)"),
    SLACK_APP_ID: z
        .string()
        .optional()
        .describe("Slack app ID for identifying the app (optional)"),

    // Google Calendar Configuration
    GOOGLE_CALENDAR_API_KEY: z
        .string()
        .optional()
        .describe("Google Calendar API key for simple API access (get from Google Cloud Console)"),
    GOOGLE_CREDENTIALS_PATH: z
        .string()
        .optional()
        .describe("Path to Google service account credentials.json or OAuth2 client credentials.json"),
    
    // Notion Configuration
    NOTION_API_KEY: z
        .string()
        .optional()
        .describe("Notion API key for workspace integration (get from https://www.notion.so/my-integrations)"),
    NOTION_DATABASE_ID: z
        .string()
        .optional()
        .describe("Notion database ID for database queries (optional)"),

    // Signal Configuration
    SIGNAL_PHONE_NUMBER: z
        .string()
        .optional()
        .describe("Signal phone number for the bot (e.g., +1234567890)"),
    SIGNAL_GROUP_IDS: z
        .string()
        .optional()
        .describe("Comma-separated list of allowed Signal group IDs (leave empty for all groups)"),
    SIGNAL_RECIPIENTS: z
        .string()
        .optional()
        .describe("Comma-separated list of allowed Signal phone numbers (for private messages)"),

    // Approval Middleware Configuration
    APPROVAL_ENABLED: z
        .string()
        .optional()
        .default("true")
        .transform((val) => val === "true" || val === "1")
        .describe("Enable human-in-the-loop approval for dangerous tools (default: true)"),
    APPROVAL_TIMEOUT_MINUTES: z
        .string()
        .optional()
        .default("5")
        .transform((val) => parseInt(val, 10))
        .describe("Timeout in minutes for approval requests (default: 5)"),
    APPROVAL_REQUIRED_TOOLS: z
        .string()
        .optional()
        .default("run_shell,file_delete,http_request,execute_code")
        .describe("Comma-separated list of tools requiring approval"),

    // Email Channel Configuration
    EMAIL_SMTP_HOST: z
        .string()
        .optional()
        .describe("SMTP server host for sending emails (e.g., smtp.gmail.com)"),
    EMAIL_SMTP_PORT: z
        .string()
        .optional()
        .default("587")
        .transform((val) => parseInt(val, 10))
        .describe("SMTP server port (default: 587)"),
    EMAIL_SMTP_USER: z
        .string()
        .optional()
        .describe("SMTP username (usually your email address)"),
    EMAIL_SMTP_PASS: z
        .string()
        .optional()
        .describe("SMTP password or app-specific password"),
    EMAIL_IMAP_HOST: z
        .string()
        .optional()
        .describe("IMAP server host for receiving emails (e.g., imap.gmail.com)"),
    EMAIL_IMAP_PORT: z
        .string()
        .optional()
        .default("993")
        .transform((val) => parseInt(val, 10))
        .describe("IMAP server port (default: 993)"),
    EMAIL_IMAP_USER: z
        .string()
        .optional()
        .describe("IMAP username (usually your email address)"),
    EMAIL_IMAP_PASS: z
        .string()
        .optional()
        .describe("IMAP password or app-specific password"),
    EMAIL_FROM_ADDRESS: z
        .string()
        .optional()
        .describe("Email address to send from (your email)"),
    EMAIL_ALLOWED_SENDERS: z
        .string()
        .optional()
        .describe("Comma-separated list of allowed email addresses (only these senders will be processed)"),

    AGENT_MAX_ITERATIONS: z
        .string()
        .optional()
        .default("10")
        .transform(val => parseInt(val, 10))
        .describe("Maximum number of agent iterations per request"),
    
    AGENT_MAX_TOOLS_PER_ITERATION: z
        .string()
        .optional()
        .default("5")
        .transform(val => parseInt(val, 10))
        .describe("Maximum number of tool calls per agent iteration"),
    
    AGENT_MAX_TOOLS_TOTAL: z
        .string()
        .optional()
        .default("50")
        .transform(val => parseInt(val, 10))
        .describe("Maximum total tool calls per agent run"),

    AGENT_TOOL_TIMEOUT_MS: z
        .string()
        .optional()
        .default("60000")
        .transform(val => parseInt(val, 10))
        .describe("Tool execution timeout in milliseconds (default: 60000)"),

    AGENT_MAX_CONCURRENT: z
        .string()
        .optional()
        .default("10")
        .transform(val => parseInt(val, 10))
        .describe("Maximum concurrent agent sessions (default: 10)"),

    TOKEN_BUDGET_ENABLED: z
        .string()
        .optional()
        .default("false")
        .transform(val => val === "true" || val === "1")
        .describe("Enable token budget tracking with diminishing returns detection"),

    TOKEN_BUDGET_MAX: z
        .string()
        .optional()
        .default("200000")
        .transform(val => parseInt(val, 10))
        .describe("Maximum tokens per agent run (0 = unlimited)"),
    
    LLM_MAX_TOKENS: z
        .string()
        .optional()
        .default("4096")
        .transform(val => parseInt(val, 10))
        .describe("Maximum tokens per LLM response (default: 4096, max: 8192)"),
    
    LLM_COST_LIMIT_PER_SESSION: z
        .string()
        .optional()
        .default("10.00")
        .transform(val => parseFloat(val))
        .describe("Maximum cost (USD) per session before blocking - set to 0 for unlimited"),

    TOKEN_BUDGET_DIMINISHING_THRESHOLD: z
        .string()
        .optional()
        .default("500")
        .transform(val => parseInt(val, 10))
        .describe("Tokens below which returns are considered diminishing"),

    AUTO_DREAM_ENABLED: z
        .string()
        .optional()
        .default("false")
        .transform(val => val === "true" || val === "1")
        .describe("Enable automatic memory consolidation when away"),

    AUTO_DREAM_MIN_HOURS: z
        .string()
        .optional()
        .default("24")
        .transform(val => parseInt(val, 10))
        .describe("Minimum hours since last consolidation before auto-dream can fire"),

    AUTO_DREAM_MIN_SESSIONS: z
        .string()
        .optional()
        .default("5")
        .transform(val => parseInt(val, 10))
        .describe("Minimum sessions required before auto-dream can fire"),

    ENABLE_MICROCOMPACT: z
        .string()
        .optional()
        .default("true")
        .transform(val => val === "true" || val === "1")
        .describe("Enable microcompact (lightweight context pruning)"),

    MICROCOMPACT_MAX_TOOL_RESULT_CHARS: z
        .string()
        .optional()
        .default("10000")
        .transform(val => parseInt(val, 10))
        .describe("Maximum chars per tool result in microcompact"),

    MICROCOMPACT_MAX_TOOLS: z
        .string()
        .optional()
        .default("3")
        .transform(val => parseInt(val, 10))
        .describe("Maximum tools to compact per turn"),

    RETRY_MAX_RETRIES: z
        .string()
        .optional()
        .default("3")
        .transform(val => parseInt(val, 10))
        .describe("Maximum retry attempts for API calls"),

    RETRY_MAX_DELAY_MS: z
        .string()
        .optional()
        .default("32000")
        .transform(val => parseInt(val, 10))
        .describe("Maximum delay between retries in milliseconds"),

    RETRY_ENABLE_EXPONENTIAL_BACKOFF: z
        .string()
        .optional()
        .default("true")
        .transform(val => val === "true" || val === "1")
        .describe("Enable exponential backoff for retries"),

    ENABLE_MEMORY_EXTRACTION: z
        .string()
        .optional()
        .default("true")
        .transform(val => val === "true" || val === "1")
        .describe("Enable automatic memory extraction after each turn"),

    MEMORY_EXTRACTION_MIN_TURNS: z
        .string()
        .optional()
        .default("3")
        .transform(val => parseInt(val, 10))
        .describe("Minimum turns before extracting memories"),

    MEMORY_DIRECTORY_ENABLED: z
        .string()
        .optional()
        .default("true")
        .transform(val => val === "true" || val === "1")
        .describe("Enable memory directory system"),

    MEMORY_DIRECTORY_PATH: z
        .string()
        .optional()
        .describe("Custom memory directory path (default: ./memory)"),

    PG_ENABLED: z
        .string()
        .optional()
        .default("false")
        .transform(val => val === "true" || val === "1")
        .describe("Enable PostgreSQL connection pool"),

    PG_HOST: z
        .string()
        .optional()
        .default("localhost")
        .describe("PostgreSQL host"),

    PG_PORT: z
        .string()
        .optional()
        .default("5432")
        .transform(val => parseInt(val, 10))
        .describe("PostgreSQL port"),

    PG_DATABASE: z
        .string()
        .optional()
        .default("gravityclaw")
        .describe("PostgreSQL database name"),

    PG_USER: z
        .string()
        .optional()
        .default("postgres")
        .describe("PostgreSQL user"),

    PG_PASSWORD: z
        .string()
        .optional()
        .describe("PostgreSQL password"),

    PG_CONNECTION_STRING: z
        .string()
        .optional()
        .describe("PostgreSQL connection string (overrides individual fields)"),

    PG_POOL_SIZE: z
        .string()
        .optional()
        .default("10")
        .transform(val => parseInt(val, 10))
        .describe("PostgreSQL pool size"),

    LOG_LEVEL: z
        .string()
        .optional()
        .default("info")
        .describe("Log level: debug | info | warn | error"),

    LOG_FORMAT: z
        .string()
        .optional()
        .default("text")
        .describe("Log format: text | json"),

    ENABLE_CALLER_INFO: z
        .string()
        .optional()
        .default("false")
        .transform(val => val === "true" || val === "1")
        .describe("Enable caller info in logs"),

    PORT: z
        .string()
        .optional()
        .default("3000")
        .transform(val => parseInt(val, 10))
        .describe("Port for the server"),

    LLM_CACHE_ENABLED: z
        .string()
        .optional()
        .default("false")
        .transform(val => val === "true" || val === "1")
        .describe("Enable LLM response caching"),

    LLM_CACHE_TTL_MS: z
        .string()
        .optional()
        .default("60000")
        .transform(val => parseInt(val, 10))
        .describe("TTL for cached LLM responses in milliseconds"),

    PATH_ALLOWLIST: z
        .string()
        .optional()
        .describe("Comma-separated list of allowed directories"),

    SEARCH_PROVIDER: z
        .string()
        .optional()
        .default("duckduckgo")
        .describe("Search provider: duckduckgo | serpapi | brave"),

    SERPAPI_API_KEY: z
        .string()
        .optional()
        .describe("SerpAPI key for search"),

    BRAVE_SEARCH_KEY: z
        .string()
        .optional()
        .describe("Brave Search API key"),

    SEARCH_CACHE_TTL_MINUTES: z
        .string()
        .optional()
        .default("60")
        .transform(val => parseInt(val, 10))
        .describe("Search cache TTL in minutes"),

    AIR_GAPPED: z
        .string()
        .optional()
        .default("false")
        .transform(val => val === "true" || val === "1")
        .describe("Enable air-gapped mode (requires Ollama)"),

    ENABLE_METRICS: z
        .string()
        .optional()
        .default("false")
        .transform(val => val === "true" || val === "1")
        .describe("Enable performance metrics"),

    ENABLE_METRICS_PERSISTENCE: z
        .string()
        .optional()
        .default("false")
        .transform(val => val === "true" || val === "1")
        .describe("Enable metrics persistence"),

    METRICS_RETENTION_HOURS: z
        .string()
        .optional()
        .default("24")
        .transform(val => parseInt(val, 10))
        .describe("Metrics retention period in hours"),

    CORRELATION_ID_HEADER: z
        .string()
        .optional()
        .default("x-correlation-id")
        .describe("Header name for correlation ID"),

    ENABLE_TRACING: z
        .string()
        .optional()
        .default("false")
        .transform(val => val === "true" || val === "1")
        .describe("Enable distributed tracing"),

    OTEL_ENABLED: z
        .string()
        .optional()
        .default("false")
        .transform(val => val === "true" || val === "1")
        .describe("Enable OpenTelemetry"),

    OTEL_EXPORTER_OTLP_ENDPOINT: z
        .string()
        .optional()
        .describe("OpenTelemetry OTLP exporter endpoint"),

    FILE_ACCESS_LOG_RETENTION_DAYS: z
        .string()
        .optional()
        .default("90")
        .transform(val => parseInt(val, 10))
        .describe("File access log retention in days"),

    PLANNING_MODE: z
        .string()
        .optional()
        .default("auto")
        .describe("Planning mode: off | auto | force"),

    PLANNING_MESSAGE_LENGTH_THRESHOLD: z
        .string()
        .optional()
        .default("200")
        .transform(val => parseInt(val, 10))
        .describe("Message length threshold to trigger planning"),

    RETRIEVAL_MEMORY_LIMIT: z
        .string()
        .optional()
        .default("8")
        .transform(val => parseInt(val, 10))
        .describe("Maximum number of memories to retrieve"),

    RETRIEVAL_MEMORY_MAX_CHARS: z
        .string()
        .optional()
        .default("1800")
        .transform(val => parseInt(val, 10))
        .describe("Maximum characters for retrieved memories"),

    QUEUE_ENABLED: z
        .string()
        .optional()
        .default("false")
        .transform(val => val === "true" || val === "1")
        .describe("Enable background task queue"),

    REDIS_URL: z
        .string()
        .optional()
        .describe("Redis URL for queue backend"),

    QUEUE_CONCURRENCY: z
        .string()
        .optional()
        .default("5")
        .transform(val => parseInt(val, 10))
        .describe("Queue worker concurrency"),

    WHATSAPP_ENABLED: z
        .string()
        .optional()
        .default("false")
        .transform(val => val === "true" || val === "1")
        .describe("Enable WhatsApp channel"),

    RECAP_HOUR_LOCAL: z
        .string()
        .optional()
        .default("20")
        .transform(val => parseInt(val, 10))
        .describe("Hour of day for daily recap (0-23)"),

    RECOMMENDATIONS_DAILY_CRON: z
        .string()
        .optional()
        .default("0 9 * * *")
        .describe("Cron for daily recommendations"),

    CHROMA_URL: z
        .string()
        .optional()
        .describe("ChromaDB server URL for vector memory (e.g., http://localhost:8000)"),

    WEBHOOK_BASE_URL: z
        .string()
        .optional()
        .describe("Base URL for webhooks"),

    // Backup System Configuration
    BACKUP_DIR: z
        .string()
        .optional()
        .default("backups")
        .describe("Directory for backup files"),
    BACKUP_CRON: z
        .string()
        .optional()
        .default("0 2 * * *")
        .describe("Cron expression for automatic backups (default: daily at 2 AM)"),
    BACKUP_RETENTION_DAYS: z
        .string()
        .optional()
        .default("30")
        .transform(val => parseInt(val, 10))
        .describe("Number of days to retain backups"),
    BACKUP_ENABLED: z
        .string()
        .optional()
        .default("true")
        .transform(val => val === "true" || val === "1")
        .describe("Enable automatic backup system"),
    BACKUP_ENCRYPT: z
        .string()
        .optional()
        .default("true")
        .transform(val => val === "true" || val === "1")
        .describe("Enable encryption for backups"),
    BACKUP_COMPRESS: z
        .string()
        .optional()
        .default("true")
        .transform(val => val === "true" || val === "1")
        .describe("Enable compression for backups"),
    BACKUP_MASTER_KEY: z
        .string()
        .optional()
        .describe("Master key for backup encryption (defaults to config.MASTER_KEY)"),

    // Auth Configuration
    AUTH_TRUSTED_CIDRS: z
        .string()
        .optional()
        .describe("Comma-separated list of trusted CIDRs for auth"),
    AUTH_ALLOW_LOCALHOST: z
        .string()
        .optional()
        .default("false")
        .transform(val => val === "true" || val === "1")
        .describe("Allow localhost bypass in production"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error("\n❌ Gravity Claw startup failed — invalid configuration:\n");
    for (const issue of parsed.error.issues) {
        const field = issue.path.join(".");
        console.error(`  • ${field}: ${issue.message}`);
    }
    console.error("\n→ Copy .env.example to .env and fill in all required values.\n");
    throw new Error(`Invalid configuration:\n${parsed.error.issues.map(i => `  • ${i.path.join(".")}: ${i.message}`).join("\n")}`);
}

export const config = parsed.data;

if (process.env.NODE_ENV === "production" && config.UNRESTRICTED_ACCESS) {
    console.error("\n❌ Gravity Claw startup failed — CRITICAL SECURITY VIOLATION:\n");
    console.error("  • UNRESTRICTED_ACCESS cannot be enabled in production (NODE_ENV=production).");
    console.error("  • This flag bypasses path validation and allows unauthenticated reads/writes to any system file.");
    console.error("\n→ Disable UNRESTRICTED_ACCESS in your .env to start the server in production.\n");
    throw new Error("UNRESTRICTED_ACCESS cannot be enabled in production. It bypasses path validation and allows unauthenticated reads/writes to any system file.");
}

// Config namespace export.
// Import via: import { config } from "./config.ts";
// Access values as: config.LLM_PROVIDER, config.API_KEY, etc.

// Helper: Get allowed paths as array
export function getAllowedPaths(): string[] {
    if (!config.PATH_ALLOWLIST || config.PATH_ALLOWLIST.trim() === '') {
        // Default to workspace directory only
        return [process.cwd()];
    }
    return config.PATH_ALLOWLIST.split(',').map(p => p.trim()).filter(p => p.length > 0);
}

// Helper: Get safe directories as array
export function getSafeDirectories(): string[] {
    if (!config.SAFE_DIRECTORIES || config.SAFE_DIRECTORIES.trim() === '') {
        // Default to workspace directory only
        return [process.cwd()];
    }
    return config.SAFE_DIRECTORIES.split(',').map(p => p.trim()).filter(p => p.length > 0);
}
