import { config } from "../config.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("retry");

export interface RetryOptions {
    maxRetries?: number;
    maxDelayMs?: number;
    exponentialBackoff?: boolean;
    onRetry?: (attempt: number, error: Error) => void | Promise<void>;
}

export interface RetryResult<T> {
    success: boolean;
    data?: T;
    error?: Error;
    attempts: number;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_MAX_DELAY = 32000;
const MIN_DELAY_MS = 1000;

const ERROR_CODES_RETRY = {
    408: true,
    409: true,
    429: true,
    500: true,
    502: true,
    503: true,
    504: true,
};

const ERROR_CODES_NO_RETRY = {
    400: true,
    401: true,
    403: true,
    404: true,
};

function isRetryableStatus(status: number): boolean {
    if (status in ERROR_CODES_RETRY) return true;
    if (status in ERROR_CODES_NO_RETRY) return false;
    return status >= 500;
}

function isTransientError(error: Error | unknown): boolean {
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes("etimedout") || message.includes("timeout")) {
            return true;
        }
        if (message.includes("econnrefused") || message.includes("econnreset")) {
            return true;
        }
        if (message.includes("overload")) {
            return true;
        }
        if (message.includes("rate limit")) {
            return true;
        }
    }
    return false;
}

function calculateDelay(attempt: number, maxDelay: number, exponential: boolean): number {
    if (exponential) {
        const delay = Math.min(MIN_DELAY_MS * Math.pow(2, attempt), maxDelay);
        const jitter = Math.random() * 0.3 * delay;
        return Math.floor(delay + jitter);
    }
    const linearDelay = (maxDelay / (DEFAULT_MAX_RETRIES + 1)) * (attempt + 1);
    return Math.floor(linearDelay + Math.random() * 1000);
}

export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {},
): Promise<RetryResult<T>> {
    const maxRetries = options.maxRetries ?? config.RETRY_MAX_RETRIES ?? DEFAULT_MAX_RETRIES;
    const maxDelay = options.maxDelayMs ?? config.RETRY_MAX_DELAY_MS ?? DEFAULT_MAX_DELAY;
    const exponential = options.exponentialBackoff ?? config.RETRY_ENABLE_EXPONENTIAL_BACKOFF ?? true;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const data = await fn();
            if (attempt > 0) {
                log.info(`Operation succeeded on attempt ${attempt + 1}`);
            }
            return { success: true, data, attempts: attempt + 1 };
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt === maxRetries) {
                log.error(`All ${maxRetries + 1} attempts failed: ${lastError.message}`);
                return { success: false, error: lastError, attempts: attempt + 1 };
            }

            const shouldRetry =
                isTransientError(lastError) ||
                (lastError.message.includes("status") &&
                    isRetryableStatus(parseInt(lastError.message.match(/\d{3}/)?.[0] ?? "0")));

            if (!shouldRetry) {
                log.error(`Non-retryable error: ${lastError.message}`);
                return { success: false, error: lastError, attempts: attempt + 1 };
            }

            const delay = calculateDelay(attempt, maxDelay, exponential);
            log.warn(`Attempt ${attempt + 1} failed: ${lastError.message}, retrying in ${delay}ms...`);

            if (options.onRetry) {
                await options.onRetry(attempt, lastError);
            }

            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    return { success: false, error: lastError!, attempts: maxRetries + 1 };
}

export async function withRetrySimple<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {},
): Promise<T> {
    const result = await withRetry(fn, options);
    if (!result.success) {
        throw result.error;
    }
    return result.data!;
}

export function isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
        return isTransientError(error);
    }
    return false;
}

export function classifyError(error: unknown): string {
    if (!(error instanceof Error)) {
        return "unknown";
    }

    const message = error.message.toLowerCase();

    if (message.includes("auth") || message.includes("401") || message.includes("403")) {
        return "auth_error";
    }

    if (message.includes("rate limit") || message.includes("429")) {
        return "rate_limit";
    }

    if (message.includes("overload") || message.includes("529") || message.includes("503")) {
        return "server_overload";
    }

    if (message.includes("prompt too long") || message.includes("context")) {
        return "context_overflow";
    }

    if (message.includes("timeout") || message.includes("timed out")) {
        return "timeout";
    }

    if (message.includes("500") || message.includes("502") || message.includes("504")) {
        return "server_error";
    }

    return "unknown";
}