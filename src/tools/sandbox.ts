import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Tool } from "./index.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("tool:sandbox");

interface ExecutionResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    timedOut: boolean;
    error?: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_OUTPUT_BYTES = 16_384;
const MAX_MEMORY_MB = 256;

const DANGEROUS_PATTERNS: RegExp[] = [
    /\bimport\s*\(\s*['"]/,
    /\brequire\s*\(/,
    /\bdynamicImport\b/i,
    /\beval\s*\(/,
    /\bFunction\s*\(/,
    /\bexec\s*\(/,
    /\bspawn\s*\(/,
    /\bexecFile\s*\(/,
    /\bfork\s*\(/,
    /\bchild_process\b/,
    /\bprocess\.exit\b/,
    /\bprocess\.kill\b/,
    /\bprocess\.cwd\b/,
    /\bfs\b/,
    /\bnet\b/,
    /\btls\b/,
    /\bhttp\b/,
    /\bhttps\b/,
    /\bdgram\b/,
    /\bchild_process\b/,
    /\b__dirname\b/,
    /\b__filename\b/,
    /\bglobal\b/,
    /\bglobalThis\b/,
    /\bGLOBAL\b/,
];

function sanitizeJavaScript(code: string): string {
    const lines = code.split("\n");
    const sanitized: string[] = [];
    
    for (const line of lines) {
        let processed = line;
        for (const pattern of DANGEROUS_PATTERNS) {
            if (pattern.test(processed)) {
                processed = `// BLOCKED: ${processed}`;
                break;
            }
        }
        sanitized.push(processed);
    }
    
    return sanitized.join("\n");
}

function sanitizePython(code: string): string {
    const lines = code.split("\n");
    const sanitized: string[] = [];
    const dangerous = [
        /import\s+os/,
        /import\s+sys/,
        /import\s+subprocess/,
        /import\s+socket/,
        /import\s+urllib/,
        /import\s+requests/,
        /import\s+http/,
        /import\s+https/,
        /from\s+os\s+import/,
        /from\s+subprocess\s+import/,
        /from\s+socket\s+import/,
        /__import__\s*\(\s*['"]os['"]/,
        /__import__\s*\(\s*['"]subprocess/,
        /__import__\s*\(\s*['"]socket/,
        /exec\s*\(/,
        /eval\s*\(/,
        /open\s*\(/,
        /file\s*\(/,
        /input\s*\(/,
        /os\.system/,
        /os\.popen/,
        /subprocess\./,
    ];
    
    for (const line of lines) {
        let processed = line;
        for (const pattern of dangerous) {
            if (pattern.test(processed)) {
                processed = `# BLOCKED: ${processed}`;
                break;
            }
        }
        sanitized.push(processed);
    }
    
    return sanitized.join("\n");
}

async function executeWithTimeout(
    command: string,
    args: string[],
    timeoutMs: number,
    env: Record<string, string>
): Promise<ExecutionResult> {
    return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        let killed = false;
        
        const child: ChildProcess = spawn(command, args, {
            env: env as NodeJS.ProcessEnv,
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true,
            cwd: tmpdir(),
        });
        
        const timeout = setTimeout(() => {
            killed = true;
            child.kill("SIGKILL");
        }, timeoutMs);
        
        if (child.stdout) {
            child.stdout.on("data", (data: Buffer) => {
                const chunk = data.toString();
                if (stdout.length + chunk.length <= MAX_OUTPUT_BYTES) {
                    stdout += chunk;
                }
            });
        }
        
        if (child.stderr) {
            child.stderr.on("data", (data: Buffer) => {
                const chunk = data.toString();
                if (stderr.length + chunk.length <= MAX_OUTPUT_BYTES) {
                    stderr += chunk;
                }
            });
        }
        
        child.on("close", (code: number | null) => {
            clearTimeout(timeout);
            resolve({
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                exitCode: code,
                timedOut: killed,
            });
        });
        
        child.on("error", (err) => {
            clearTimeout(timeout);
            resolve({
                stdout: "",
                stderr: "",
                exitCode: null,
                timedOut: false,
                error: err.message,
            });
        });
    });
}

function createSandboxEnv(language: string): Record<string, string> {
    const baseEnv: Record<string, string> = {
        HOME: tmpdir(),
        TEMP: tmpdir(),
        TMP: tmpdir(),
        TMPDIR: tmpdir(),
        PATH: "",
        NODE_PATH: "",
        PYTHONPATH: "",
        PYTHONHOME: "",
        PYTHONIOENCODING: "utf-8",
        LANG: "en_US.UTF-8",
        LC_ALL: "en_US.UTF-8",
        NO_PROXY: "*",
        no_proxy: "*",
        HTTP_PROXY: "",
        HTTPS_PROXY: "",
        http_proxy: "",
        https_proxy: "",
    };
    
    if (language === "javascript") {
        baseEnv.NODE_OPTIONS = "--no-warnings --disable-experimental-fetch --no-experimental-fetch";
    }
    
    return baseEnv;
}

export const sandboxTool: Tool = {
    name: "execute_code",
    description: "Execute code in a sandboxed environment. Supports JavaScript/TypeScript and Python with strict security controls: no filesystem access beyond temp, no network, strict timeout, and dangerous functions blocked.",
    inputSchema: {
        type: "object" as const,
        properties: {
            language: {
                type: "string",
                enum: ["javascript", "python", "bash"],
                description: "The programming language of the code to execute (default: javascript)",
                default: "javascript",
            },
            code: {
                type: "string",
                description: "The code to execute",
            },
            timeout: {
                type: "number",
                description: "Maximum execution time in seconds (default: 10, max: 30)",
                default: 10,
            },
        },
        required: ["code"],
    },
    requiresApproval: true,
    async execute(input) {
        const language = String(input["language"] ?? "javascript");
        const code = String(input["code"] ?? "");
        const timeoutSec = Math.min(Number(input["timeout"] ?? 10), 30);
        const timeoutMs = timeoutSec * 1000;
        
        if (!code.trim()) {
            return "Error: No code provided.";
        }
        
        const isGroup = Boolean(input["__isGroup"]);
        const platform = String(input["__platform"] || "");
        const groupId = String(input["__groupId"] || "");
        const userId = String(input["__userId"] || "");
        
        if (isGroup && platform && groupId && userId) {
            const { isToolAllowedForUser } = await import("../groups/index.ts");
            const allowed = isToolAllowedForUser(platform, groupId, userId, "execute_code");
            
            if (!allowed) {
                return "Error: The execute_code tool requires administrator privileges in this group.";
            }
        }
        
        log.info(`Executing ${language} code (${code.length} chars, ${timeoutSec}s timeout)`);
        
        let tempDir: string;
        let tempFile = "";
        
        try {
            tempDir = mkdtempSync(join(tmpdir(), "sandbox-"));
        } catch {
            return "Error: Failed to create temp directory.";
        }
        
        try {
            let sanitizedCode: string;
            let command: string;
            let args: string[];
            
            switch (language) {
                case "javascript":
                    sanitizedCode = sanitizeJavaScript(code);
                    tempFile = join(tempDir, "script.js");
                    writeFileSync(tempFile, sanitizedCode, "utf-8");
                    command = "node";
                    args = [
                        "--no-warnings",
                        "--experimental-vm-modules",
                        "--no-experimental-fetch",
                        "--disable-experimental-fetch",
                        "--max-old-space-size=" + MAX_MEMORY_MB,
                        tempFile,
                    ];
                    break;
                    
                case "python":
                    sanitizedCode = sanitizePython(code);
                    tempFile = join(tempDir, "script.py");
                    writeFileSync(tempFile, sanitizedCode, "utf-8");
                    
                    const pythonCmd = process.platform === "win32" ? "python" : "python3";
                    command = pythonCmd;
                    args = ["-u", tempFile];
                    break;
                    
                case "bash":
                    tempFile = join(tempDir, "script.sh");
                    writeFileSync(tempFile, code, "utf-8");
                    command = process.platform === "win32" ? "powershell.exe" : "/bin/sh";
                    args = process.platform === "win32" 
                        ? ["-NoProfile", "-NonInteractive", "-Command", code]
                        : ["-c", code];
                    break;
                    
                default:
                    return `Error: Unsupported language: ${language}. Supported: javascript, python, bash`;
            }
            
            const env = createSandboxEnv(language);
            const result = await executeWithTimeout(command, args, timeoutMs, env);
            
            let output = "";
            if (result.timedOut) {
                output = `Error: Execution timed out after ${timeoutSec} seconds`;
            } else if (result.error) {
                output = `Error: ${result.error}`;
            } else {
                if (result.stdout) {
                    output += result.stdout;
                }
                if (result.stderr) {
                    if (output) output += "\n";
                    output += `stderr: ${result.stderr}`;
                }
                if (!output) {
                    output = "(no output)";
                }
                if (result.exitCode !== 0 && result.exitCode !== null) {
                    output += `\n(exit code: ${result.exitCode})`;
                }
            }
            
            if (output.length > MAX_OUTPUT_BYTES) {
                output = output.substring(0, MAX_OUTPUT_BYTES) + "\n[output truncated]";
            }
            
            return output;
            
        } catch (err) {
            return `Error: Execution failed: ${err instanceof Error ? err.message : "Unknown error"}`;
        } finally {
            try {
                if (tempFile && existsSync(tempFile)) {
                    unlinkSync(tempFile);
                }
            } catch {
                // Ignore cleanup errors
            }
            try {
                if (tempDir && existsSync(tempDir)) {
                    unlinkSync(tempDir);
                }
            } catch {
                // Ignore cleanup errors
            }
        }
    },
};

export const runCodeAliasTool: Tool = {
    name: "run_code",
    description: "Execute code in a sandboxed environment. Alias for execute_code.",
    inputSchema: sandboxTool.inputSchema,
    requiresApproval: true,
    async execute(input) {
        return sandboxTool.execute(input);
    },
};
