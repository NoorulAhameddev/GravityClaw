import { createLogger } from "../logger.ts";

const logger = createLogger("json");

export interface SafeParseResult<T> {
    success: boolean;
    data: T | null;
    error?: string;
}

export function safeJsonParse<T>(jsonString: string, fallback: T, context?: string): SafeParseResult<T> {
    try {
        const parsed = JSON.parse(jsonString) as T;
        return { success: true, data: parsed };
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.warn(`JSON parse failed${context ? ` in ${context}` : ""}: ${errorMessage}`, {
            preview: jsonString?.substring(0, 100),
        });
        return { success: false, data: fallback, error: errorMessage };
    }
}

export function safeJsonParseOptional<T>(jsonString: string | null | undefined, context?: string): SafeParseResult<T> {
    if (jsonString === null || jsonString === undefined || jsonString === "") {
        return { success: true, data: null };
    }
    return safeJsonParse<T>(jsonString, null as unknown as T, context);
}

export function requireJsonParse<T>(jsonString: string, context?: string): T {
    try {
        return JSON.parse(jsonString) as T;
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error(`JSON parse failed (required)${context ? ` in ${context}` : ""}: ${errorMessage}`);
        throw new Error(`JSON parse failed: ${errorMessage}`);
    }
}