import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Tool } from "./index.ts";
import { createLogger } from "../logger.ts";

const execAsync = promisify(exec);
const log = createLogger("tool:shell");

/** Commands containing these patterns require explicit confirmation before running. */
const DANGEROUS_PATTERNS: RegExp[] = [
    /\brm\s+-rf?\b/i,
    /\bdel\s+\/[sq]/i,
    /\brmdir\b/i,
    /\bformat\b/i,
    /\bshutdown\b/i,
    /\breboot\b/i,
    /\bpoweroff\b/i,
    /\bmkfs\b/i,
    /\bdd\b.*of=/i,
    /\bcurl\b.*\|\s*(sh|bash|zsh|fish)/i,
    /\bwget\b.*\|\s*(sh|bash|zsh|fish)/i,
    /\b>\/dev\/[a-z]+[0-9]/i,
    /\bdrop\s+(table|database)\b/i,
    /\btruncate\s+table\b/i,
];

/** Max bytes to return to the LLM — avoids flooding context */
const MAX_OUTPUT_BYTES = 4096;

export function isDangerous(command: string): boolean {
    return DANGEROUS_PATTERNS.some((p) => p.test(command));
}

/**
 * A map of pending confirmations. Key: chatId, Value: the command awaiting confirmation.
 * The bot module interacts with this map when the user replies with y/n.
 */
export const pendingConfirmations = new Map<number, string>();

export const shellTool: Tool = {
    name: "run_shell",
    description:
        "Executes a shell command on the local machine and returns stdout and stderr. Use this for file operations, running scripts, checking system info, etc. Dangerous commands (e.g. rm -rf, shutdown) will first ask the user for confirmation.",
    inputSchema: {
        type: "object" as const,
        properties: {
            command: {
                type: "string",
                description: "The shell command to execute",
            },
            timeout_ms: {
                type: "number",
                description: "Timeout in milliseconds (default: 30000, max: 120000)",
            },
        },
        required: ["command"],
    },
    async execute(input) {
        const command = String(input["command"] ?? "").trim();
        const timeoutMs = Math.min(Number(input["timeout_ms"] ?? 30_000), 120_000);
        
        // Check group permissions
        const isGroup = Boolean(input["__isGroup"]);
        const platform = String(input["__platform"] || "");
        const groupId = String(input["__groupId"] || "");
        const userId = String(input["__userId"] || "");

        if (isGroup && platform && groupId && userId) {
            const { isToolAllowedForUser } = await import("../groups/index.ts");
            const allowed = isToolAllowedForUser(platform, groupId, userId, "run_shell");
            
            if (!allowed) {
                return "Error: The run_shell tool requires administrator privileges in this group.";
            }
        }

        if (!command) {
            return "Error: no command provided.";
        }

        log.info(`Executing: ${command.substring(0, 80)}${command.length > 80 ? "…" : ""}`);

        try {
            const { stdout, stderr } = await execAsync(command, {
                timeout: timeoutMs,
                shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
            });

            const output = [
                stdout ? `stdout:\n${stdout}` : "",
                stderr ? `stderr:\n${stderr}` : "",
            ]
                .filter(Boolean)
                .join("\n")
                .trim();

            const result = output || "(no output)";

            if (Buffer.byteLength(result, "utf8") > MAX_OUTPUT_BYTES) {
                const truncated = result.substring(0, MAX_OUTPUT_BYTES);
                return `${truncated}\n\n[output truncated — ${Buffer.byteLength(result, "utf8")} bytes total, showing first ${MAX_OUTPUT_BYTES}]`;
            }

            return result;
        } catch (err) {
            if (err instanceof Error) {
                return `Error: ${err.message}`;
            }
            return "Error: unknown failure";
        }
    },
};
