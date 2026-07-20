import { config } from "./config.ts";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

let pinoLogger: any = null;
try {
    const pinoModule = await import("pino");
    const opts: Record<string, unknown> = {
        level: config.LOG_LEVEL || "info",
        redact: {
            paths: [
                "req.headers.authorization",
                "req.headers['x-api-key']",
                "body.apiKey",
                "apiKey",
                "token",
                "password",
            ],
            censor: "[REDACTED]",
        },
    };
    if (config.NODE_ENV === "development") {
        opts.transport = { target: "pino-pretty", options: { colorize: true } };
    }
    pinoLogger = pinoModule.default(opts);
} catch {
}

export function sanitizeForLogs(input: unknown): unknown {
    try {
        const str = typeof input === "string" ? input : JSON.stringify(input);

        const sanitized = str
            .replace(/api[_-]?key["']?\s*[:=]\s*["'][^"']+["']/gi, 'api_key:"***"')
            .replace(/api[_-]?key\s*[:=]\s*[^\s,}]+/gi, 'api_key:***')
            .replace(/api[_-]?secret["']?\s*[:=]\s*["'][^"']+["']/gi, 'api_secret:"***"')
            .replace(/api[_-]?secret\s*[:=]\s*[^\s,}]+/gi, 'api_secret:***')
            .replace(/token["']?\s*[:=]\s*["'][^"']+["']/gi, 'token:"***"')
            .replace(/token\s*[:=]\s*[^\s,}]+/gi, 'token:***')
            .replace(/password["']?\s*[:=]\s*["'][^"']+["']/gi, 'password:"***"')
            .replace(/password\s*[:=]\s*[^\s,}]+/gi, 'password:***')
            .replace(/Bearer\s+[A-Za-z0-9\-\._~\+\/]+=*/gi, "Bearer ***")
            .replace(/sk-[A-Za-z0-9]{20,}/g, "sk-***")
            .replace(/[A-Za-z0-9_\-]{32,}/g, "***");

        try {
            return JSON.parse(sanitized);
        } catch {
            return sanitized;
        }
    } catch {
        return "***";
    }
}

export interface LogContext {
    requestId?: string;
    correlationId?: string;
    sessionId?: string;
    userId?: string;
    toolName?: string;
    duration?: number;
    [key: string]: unknown;
}

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    prefix: string;
    message: string;
    context?: LogContext | undefined;
    error?: {
        message: string;
        stack?: string | undefined;
        code?: string | undefined;
    } | undefined;
}

function shouldLog(level: LogLevel): boolean {
    return LEVELS[level] >= LEVELS[config.LOG_LEVEL as LogLevel];
}

function timestamp(): string {
    return new Date().toISOString();
}

function getCallerInfo(): { file: string; line: number } {
    const stack = new Error().stack?.split("\n") || [];
    const callerLine = stack[4];
    
    if (!callerLine) return { file: "unknown", line: 0 };
    
    const match = callerLine.match(/\((.+):(\d+):\d+\)|at (.+):(\d+):\d+/);
    if (match) {
        const file = (match[1] || match[3] || "unknown").split("/").pop() || "unknown";
        const line = parseInt(match[2] || match[4] || "0", 10);
        return { file, line };
    }
    
    return { file: "unknown", line: 0 };
}

const ICONS: Record<LogLevel, string> = {
    debug: "🔍",
    info: "ℹ️ ",
    warn: "⚠️ ",
    error: "❌",
};

function formatPretty(level: LogLevel, prefix: string, message: string, context?: LogContext): string {
    const ts = timestamp();
    const icon = ICONS[level];
    let result = `${ts} ${icon} [${prefix}] ${message}`;
    
    if (context) {
        const contextStr = Object.entries(context)
            .filter(([_, v]) => v !== undefined && v !== null)
            .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
            .join(", ");
        if (contextStr) result += ` {${contextStr}}`;
    }
    
    return result;
}

function formatJSON(level: LogLevel, prefix: string, message: string, context?: LogContext, error?: LogEntry["error"]): string {
    const entry: LogEntry = {
        timestamp: timestamp(),
        level,
        prefix,
        message,
        context,
        error,
    };
    
    try {
        return JSON.stringify(entry);
    } catch {
        const safe: LogEntry = {
            ...entry,
            context: context ? Object.fromEntries(
                Object.entries(context).map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : v])
            ) : undefined,
        };
        return JSON.stringify(safe);
    }
}

export function createLogger(prefix: string) {
    const isJSON = config.LOG_FORMAT === "json";
    
    if (pinoLogger) {
        const child = pinoLogger.child({ module: prefix });
        return {
            debug: (msg: string, context?: LogContext) => {
                if (shouldLog("debug")) {
                    child.debug(context || {}, msg);
                }
            },
            info: (msg: string, context?: LogContext) => {
                if (shouldLog("info")) {
                    child.info(context || {}, msg);
                }
            },
            warn: (msg: string, context?: LogContext) => {
                if (shouldLog("warn")) {
                    child.warn(context || {}, msg);
                }
            },
            error: (msg: string, err?: unknown, context?: LogContext) => {
                if (shouldLog("error")) {
                    child.error({ err, ...(context || {}) }, msg);
                }
            },
        };
    }

    return {
        debug: (msg: string, context?: LogContext) => {
            if (shouldLog("debug")) {
                const output = isJSON
                    ? formatJSON("debug", prefix, msg, context)
                    : formatPretty("debug", prefix, msg, context);
                console.debug(output);
            }
        },
        info: (msg: string, context?: LogContext) => {
            if (shouldLog("info")) {
                const output = isJSON
                    ? formatJSON("info", prefix, msg, context)
                    : formatPretty("info", prefix, msg, context);
                console.info(output);
            }
        },
        warn: (msg: string, context?: LogContext) => {
            if (shouldLog("warn")) {
                const output = isJSON
                    ? formatJSON("warn", prefix, msg, context)
                    : formatPretty("warn", prefix, msg, context);
                console.warn(output);
            }
        },
        error: (msg: string, err?: unknown, context?: LogContext) => {
            if (shouldLog("error")) {
                let errorInfo: LogEntry["error"] | undefined;
                
                if (err instanceof Error) {
                    errorInfo = {
                        message: err.message,
                        stack: err.stack,
                        code: (err as any).code,
                    };
                } else if (err) {
                    errorInfo = {
                        message: String(err),
                    };
                }
                
                const output = isJSON
                    ? formatJSON("error", prefix, msg, context, errorInfo)
                    : formatPretty("error", prefix, msg, context);
                console.error(output);
            }
        },
    };
}

export type Logger = ReturnType<typeof createLogger>;
