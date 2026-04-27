import * as fs from "node:fs";
import * as path from "node:path";
import { config } from "../config.ts";
import { createLogger } from "../logger.ts";
import type { MemoryType, MemoryEntry } from "./memdirTypes.js";

const log = createLogger("memdir");

const DEFAULT_MEMORY_FILENAME = "MEMORY.md";
const DEFAULT_MEMORY_DIR = "./memory";

function getMemoryBaseDir(): string {
    if (config.MEMORY_DIRECTORY_PATH) {
        return config.MEMORY_DIRECTORY_PATH;
    }
    return DEFAULT_MEMORY_DIR;
}

function getMemoryDir(projectRoot?: string): string {
    const baseDir = getMemoryBaseDir();
    if (path.isAbsolute(baseDir)) {
        return baseDir;
    }
    const root = projectRoot ?? process.cwd();
    return path.resolve(root, baseDir);
}

function getMemoryEntrypoint(projectRoot?: string): string {
    return path.join(getMemoryDir(projectRoot), DEFAULT_MEMORY_FILENAME);
}

export function isMemoryDirectoryEnabled(): boolean {
    return config.MEMORY_DIRECTORY_ENABLED ?? true;
}

export function isAutoMemoryEnabled(): boolean {
    return isMemoryDirectoryEnabled();
}

export function loadMemoryEntrypoint(projectRoot?: string): string {
    if (!isAutoMemoryEnabled()) {
        return "";
    }

    const entrypoint = getMemoryEntrypoint(projectRoot);
    if (!fs.existsSync(entrypoint)) {
        return "";
    }

    try {
        const content = fs.readFileSync(entrypoint, "utf8");
        return content;
    } catch (e) {
        log.error(`Failed to read memory entrypoint: ${e}`);
        return "";
    }
}

export async function loadMemoryPrompt(projectRoot?: string): Promise<string> {
    if (!isAutoMemoryEnabled()) {
        return "";
    }

    const content = loadMemoryEntrypoint(projectRoot);
    if (!content) {
        return "";
    }

    const lines = content.split("\n");
    return lines
        .map((line) => {
            if (line.startsWith("#")) {
                return line;
            }
            if (line.trim()) {
                return `- ${line.trim()}`;
            }
            return line;
        })
        .join("\n");
}

export function parseMemoryContent(content: string): MemoryEntry[] {
    const entries: MemoryEntry[] = [];
    const lines = content.split("\n");
    let currentType: MemoryType = "user";
    let currentContent: string[] = [];
    let currentSource: string | undefined;

    for (const line of lines) {
        const typeMatch = line.match(/^\[(user|feedback|project|reference)\]/i);
        if (typeMatch && typeMatch[1]) {
            if (currentContent.length > 0) {
                const entry: MemoryEntry = {
                    type: currentType,
                    content: currentContent.join("\n").trim(),
                };
                if (currentSource) {
                    entry.source = currentSource;
                }
                entries.push(entry);
            }
            currentType = (typeMatch[1].toLowerCase() as MemoryType);
            currentContent = [];
            currentSource = undefined;
            continue;
        }

        const sourceMatch = line.match(/^# (.+)$/);
        if (sourceMatch) {
            currentSource = sourceMatch[1];
            continue;
        }

        if (line.trim() || currentContent.length > 0) {
            currentContent.push(line);
        }
    }

    if (currentContent.length > 0) {
        const entry: MemoryEntry = {
            type: currentType,
            content: currentContent.join("\n").trim(),
        };
        if (currentSource) {
            entry.source = currentSource;
        }
        entries.push(entry);
    }

    return entries;
}

export function saveMemoryEntry(
    projectRoot: string,
    type: MemoryType,
    content: string,
    source?: string,
): void {
    if (!isAutoMemoryEnabled()) {
        return;
    }

    const dir = getMemoryDir(projectRoot);
    const entrypoint = getMemoryEntrypoint(projectRoot);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const timestamp = new Date().toISOString();
    const header = `[${type}] ${source ? `# ${source}` : ""}`;
    const entry = `- [${timestamp}] ${header}\n${content}\n`;

    fs.appendFileSync(entrypoint, entry + "\n", "utf8");

    log.debug(`Saved memory entry: ${type}`);
}

export function scanMemoryFiles(projectRoot?: string): string[] {
    if (!isAutoMemoryEnabled()) {
        return [];
    }

    const dir = getMemoryDir(projectRoot);
    if (!fs.existsSync(dir)) {
        return [];
    }

    const files: string[] = [];
    const entries = fs.readdirSync(dir);

    for (const entry of entries) {
        if (entry.endsWith(".md") || entry.endsWith(".txt")) {
            files.push(path.join(dir, entry));
        }
    }

    return files;
}