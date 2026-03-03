import { config } from "./config.ts";

type LogLevel = "debug" | "info" | "warn" | "error";

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

function shouldLog(level: LogLevel): boolean {
    return LEVELS[level] >= LEVELS[config.LOG_LEVEL];
}

function timestamp(): string {
    return new Date().toISOString();
}

function format(level: LogLevel, prefix: string, message: string): string {
    return `${timestamp()} ${ICONS[level]} [${prefix}] ${message}`;
}

export function createLogger(prefix: string) {
    return {
        debug: (msg: string) => {
            if (shouldLog("debug")) console.debug(format("debug", prefix, msg));
        },
        info: (msg: string) => {
            if (shouldLog("info")) console.info(format("info", prefix, msg));
        },
        warn: (msg: string) => {
            if (shouldLog("warn")) console.warn(format("warn", prefix, msg));
        },
        error: (msg: string, err?: unknown) => {
            if (shouldLog("error")) {
                console.error(format("error", prefix, msg));
                if (err instanceof Error) {
                    console.error(`  cause: ${err.message}`);
                }
            }
        },
    };
}

export type Logger = ReturnType<typeof createLogger>;
