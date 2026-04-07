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
        .enum(["openrouter", "anthropic", "openai", "google", "groq", "deepseek", "ollama", "cohere", "mistral", "nvidia", "failover", "mock"])
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
        .describe("Enable security audit logging for file access"),
    
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

    MOBILE_CHANNEL_ENABLED: z
        .string()
        .optional()
        .default("true")
        .transform((val) => val === "true" || val === "1")
        .describe("Enable mobile companion channel (iOS/Android)"),
    MOBILE_WS_PORT: z
        .string()
        .optional()
        .default("3001")
        .transform((val) => parseInt(val, 10))
        .describe("WebSocket port for mobile companion connections"),
    MOBILE_UPLOAD_DIR: z
        .string()
        .optional()
        .default("data/mobile-uploads")
        .describe("Directory for storing mobile camera/screen recordings"),
    MOBILE_FCM_ENABLED: z
        .string()
        .optional()
        .default("false")
        .transform((val) => val === "true" || val === "1")
        .describe("Enable Firebase Cloud Messaging for push notifications"),
    MOBILE_FCM_CREDENTIALS: z
        .string()
        .optional()
        .describe("Path to FCM service account JSON file"),
    MOBILE_APNS_ENABLED: z
        .string()
        .optional()
        .default("false")
        .transform((val) => val === "true" || val === "1")
        .describe("Enable Apple Push Notification service"),
    MOBILE_APNS_KEY_ID: z
        .string()
        .optional()
        .describe("Apple Push Notification Key ID"),
    MOBILE_APNS_TEAM_ID: z
        .string()
        .optional()
        .describe("Apple Developer Team ID"),
    MOBILE_APNS_PRIVATE_KEY: z
        .string()
        .optional()
        .describe("Apple Push Notification private key (base64 encoded)"),

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
        .default("http://localhost:8000")
        .describe("ChromaDB server URL for vector memory (optional)"),

    WEBHOOK_BASE_URL: z
        .string()
        .optional()
        .describe("Base URL for webhooks"),
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
    NVIDIA_API_KEY,
    AGENT_MAX_ITERATIONS,
    AGENT_MAX_TOOLS_PER_ITERATION,
    AGENT_MAX_TOOLS_TOTAL,
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
    API_KEY,
    DISCORD_BOT_TOKEN,
    DISCORD_GUILD_ID,
    SLACK_BOT_TOKEN,
    SLACK_SIGNING_SECRET,
    SLACK_APP_ID,
    GOOGLE_CALENDAR_API_KEY,
    GOOGLE_CREDENTIALS_PATH,
    NOTION_API_KEY,
    NOTION_DATABASE_ID,
    SIGNAL_PHONE_NUMBER,
    SIGNAL_GROUP_IDS,
    SIGNAL_RECIPIENTS,
    APPROVAL_ENABLED,
    APPROVAL_TIMEOUT_MINUTES,
    APPROVAL_REQUIRED_TOOLS,
    EMAIL_SMTP_HOST,
    EMAIL_SMTP_PORT,
    EMAIL_SMTP_USER,
    EMAIL_SMTP_PASS,
    EMAIL_IMAP_HOST,
    EMAIL_IMAP_PORT,
    EMAIL_IMAP_USER,
    EMAIL_IMAP_PASS,
    EMAIL_FROM_ADDRESS,
    EMAIL_ALLOWED_SENDERS,
    PLANNING_MODE,
    PLANNING_MESSAGE_LENGTH_THRESHOLD,
    RETRIEVAL_MEMORY_LIMIT,
    RETRIEVAL_MEMORY_MAX_CHARS,
    QUEUE_ENABLED,
    REDIS_URL,
    QUEUE_CONCURRENCY,
    WHATSAPP_ENABLED,
    RECAP_HOUR_LOCAL,
    RECOMMENDATIONS_DAILY_CRON,
    CHROMA_URL,
    WEBHOOK_BASE_URL,
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
