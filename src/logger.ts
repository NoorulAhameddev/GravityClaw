import { config } from "./config.ts";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const ICONS: Record<LogLevel, string> = {
    debug: "🔍",
    info: "ℹ️ ",
    warn: "⚠️ ",
    error: "❌",
};

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
    return LEVELS[level] >= LEVELS[config.LOG_LEVEL];
}

function timestamp(): string {
    return new Date().toISOString();
}

/**
 * Get caller info (filename and line number)
 * Useful for identifying where logs originated
 */
function getCallerInfo(): { file: string; line: number } {
    const stack = new Error().stack?.split("\n") || [];
    const callerLine = stack[4]; // Skip Error, getCallerInfo, format, and direct logger call
    
    if (!callerLine) return { file: "unknown", line: 0 };
    
    const match = callerLine.match(/\((.+):(\d+):\d+\)|at (.+):(\d+):\d+/);
    if (match) {
        const file = (match[1] || match[3] || "unknown").split("/").pop() || "unknown";
        const line = parseInt(match[2] || match[4] || "0", 10);
        return { file, line };
    }
    
    return { file: "unknown", line: 0 };
}

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
        // Fallback if context contains non-serializable objects
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
    const caller = config.ENABLE_CALLER_INFO ? getCallerInfo() : null;
    
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
