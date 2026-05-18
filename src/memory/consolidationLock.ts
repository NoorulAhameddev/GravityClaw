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
    
    // Check if there's a stale lock we should clean up
    try {
        const lockStat = fs.statSync(lockPath);
        const ageMs = Date.now() - lockStat.mtimeMs;
        if (ageMs > 60 * 60 * 1000) {
            log.warn("Lock file is stale, removing and retrying");
            try {
                fs.unlinkSync(lockPath);
            } catch (e) {
                // Ignore if it was already deleted by another process
            }
        }
    } catch (e) {
        // File doesn't exist, which is fine
    }

    try {
        // Use 'wx' flag for atomic creation. Fails if file already exists.
        const fd = fs.openSync(lockPath, "wx");
        fs.writeSync(fd, JSON.stringify({ startedAt: Date.now() }));
        fs.closeSync(fd);
        return fs.statSync(lockPath).mtimeMs;
    } catch (e: any) {
        if (e.code === "EEXIST") {
            log.debug("Lock file exists (or was just created), consolidation may already be running");
            return null;
        }
        throw e;
    }
}

export async function releaseConsolidationLock(): Promise<void> {
    const lockPath = getLockFilePath();
    try {
        if (fs.existsSync(lockPath)) {
            const now = new Date();
            fs.utimesSync(lockPath, now, now);
        }
    } catch (e) {
        log.warn(`Failed to release lock, might be already deleted: ${e}`);
    }
}

export async function rollbackConsolidationLock(priorMtime: number): Promise<void> {
    const lockPath = getLockFilePath();
    if (fs.existsSync(lockPath)) {
        const priorDate = new Date(priorMtime);
        fs.utimesSync(lockPath, priorDate, priorDate);
    }
}