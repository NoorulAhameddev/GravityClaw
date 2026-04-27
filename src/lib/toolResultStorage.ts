import * as fs from "node:fs";
import * as path from "node:path";
import { createLogger } from "../logger.ts";
import {
    BYTES_PER_TOKEN,
    DEFAULT_MAX_RESULT_SIZE_CHARS,
    MAX_TOOL_RESULT_BYTES,
} from "../constants/toolLimits.ts";

const log = createLogger("toolResultStorage");

export const TOOL_RESULTS_SUBDIR = "tool-results";

export const PERSISTED_OUTPUT_TAG = "<persisted-output>";
export const PERSISTED_OUTPUT_CLOSING_TAG = "</persisted-output>";

export const TOOL_RESULT_CLEARED_MESSAGE = "[Old tool result content cleared]";

export type PersistedToolResult = {
    filepath: string;
    originalSize: number;
    isJson: boolean;
    preview: string;
    hasMore: boolean;
};

export type PersistToolResultError = {
    error: string;
};

export type PersistResult = PersistedToolResult | PersistToolResultError;

function getToolResultsDir(sessionId: string): string {
    const baseDir = path.resolve(process.cwd(), "data", "tool-results", sessionId);
    return baseDir;
}

export function getPersistenceThreshold(
    toolName: string,
    declaredMaxResultSizeChars: number,
): number {
    if (!Number.isFinite(declaredMaxResultSizeChars)) {
        return declaredMaxResultSizeChars;
    }
    return Math.min(declaredMaxResultSizeChars, DEFAULT_MAX_RESULT_SIZE_CHARS);
}

function getToolResultFilename(sessionId: string, toolName: string, index: number): string {
    const dir = getToolResultsDir(sessionId);
    return path.join(dir, `${toolName}_${index}_${Date.now()}.txt`);
}

export function shouldPersist(
    content: string,
    toolName: string,
    declaredMaxResultSizeChars: number,
): boolean {
    if (!content || content.length === 0) {
        return false;
    }
    const threshold = getPersistenceThreshold(toolName, declaredMaxResultSizeChars);
    return content.length > threshold;
}

export async function persistToolResult(
    sessionId: string,
    toolName: string,
    content: string,
    index: number = 0,
): Promise<PersistResult> {
    if (!content || content.length === 0) {
        return { error: "Empty content" };
    }

    const dir = getToolResultsDir(sessionId);
    const filepath = getToolResultFilename(sessionId, toolName, index);

    try {
        fs.mkdirSync(dir, { recursive: true });

        const isJson = content.trim().startsWith("{") ||
            content.trim().startsWith("[");

        const bytes = content.length;
        const estimatedTokens = Math.ceil(bytes / BYTES_PER_TOKEN);
        const hasMore = estimatedTokens > MAX_TOOL_RESULT_BYTES / BYTES_PER_TOKEN;

        const previewChars = Math.min(200, Math.floor(DEFAULT_MAX_RESULT_SIZE_CHARS / 10));
        const preview = content.slice(0, previewChars) +
            (hasMore ? "\n\n[truncated...]" : "");

        fs.writeFileSync(filepath, content, "utf8");

        log.debug(
            `Persisted ${bytes} bytes (${estimatedTokens} tokens) to ${path.basename(filepath)}`,
        );

        return {
            filepath,
            originalSize: bytes,
            isJson,
            preview,
            hasMore,
        };
    } catch (e) {
        log.error(`Failed to persist tool result: ${e}`);
        return { error: e instanceof Error ? e.message : String(e) };
    }
}

export function readPersistedToolResult(filepath: string): string | null {
    try {
        if (!fs.existsSync(filepath)) {
            return null;
        }
        return fs.readFileSync(filepath, "utf8");
    } catch (e) {
        log.error(`Failed to read persisted tool result: ${e}`);
        return null;
    }
}

export function cleanupPersistedToolResults(sessionId: string, maxAgeMs = 7 * 24 * 60 * 60 * 1000): number {
    const dir = getToolResultsDir(sessionId);
    if (!fs.existsSync(dir)) {
        return 0;
    }

    let cleaned = 0;
    const now = Date.now();

    for (const file of fs.readdirSync(dir)) {
        const filepath = path.join(dir, file);
        const stat = fs.statSync(filepath);
        if (now - stat.mtimeMs > maxAgeMs) {
            fs.unlinkSync(filepath);
            cleaned++;
        }
    }

    return cleaned;
}