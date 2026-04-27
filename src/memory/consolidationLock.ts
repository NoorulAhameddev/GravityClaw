import * as fs from "node:fs";
import * as path from "node:path";
import { db } from "../db.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("autoDream:lock");

const LOCK_FILE = "auto-dream.lock";

function getLockFilePath(): string {
    return path.resolve(process.cwd(), LOCK_FILE);
}

export function readLastConsolidatedAt(): number {
    const lockPath = getLockFilePath();
    if (!fs.existsSync(lockPath)) {
        if (!fs.existsSync(path.dirname(lockPath))) {
            fs.mkdirSync(path.dirname(lockPath), { recursive: true });
        }
        return 0;
    }
    const mtime = fs.statSync(lockPath).mtimeMs;
    return mtime;
}

export async function tryAcquireConsolidationLock(): Promise<number | null> {
    const lockPath = getLockFilePath();
    if (fs.existsSync(lockPath)) {
        const lockStat = fs.statSync(lockPath);
        const ageMs = Date.now() - lockStat.mtimeMs;
        if (ageMs < 60 * 60 * 1000) {
            log.debug("Lock file is recent, consolidation may already be running");
            return null;
        }
        log.warn("Lock file is stale, removing and retrying");
        fs.unlinkSync(lockPath);
    }
    fs.writeFileSync(lockPath, JSON.stringify({ startedAt: Date.now() }), "utf8");
    return fs.statSync(lockPath).mtimeMs;
}

export async function releaseConsolidationLock(): Promise<void> {
    const lockPath = getLockFilePath();
    if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
    }
}

export async function rollbackConsolidationLock(priorMtime: number): Promise<void> {
    const lockPath = getLockFilePath();
    if (fs.existsSync(lockPath)) {
        const stat = fs.statSync(lockPath);
        fs.utimesSync(lockPath, priorMtime, priorMtime);
    }
}