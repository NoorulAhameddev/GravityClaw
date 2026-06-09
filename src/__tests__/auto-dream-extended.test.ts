import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { db } from "../db.ts";
import { config } from "../config.ts";
import { tryAcquireConsolidationLock, releaseConsolidationLock, readLastConsolidatedAt } from "../memory/consolidationLock.ts";
import { executeAutoDream } from "../memory/autoDream.ts";
import { saveFact, readAllFacts, setMemoryRootForTests, resetMemoryRoot } from "../memory/markdown.ts";
import * as agent from "../lib/forkedAgent.ts";

const getConsolidationLockPath = () => path.resolve(process.cwd(), "auto-dream.lock");

describe("AutoDream Extended Production Verification", () => {
    let tempRoot = "";
    
    beforeEach(() => {
        (config as any).AUTO_DREAM_ENABLED = true;
        (config as any).AUTO_DREAM_MIN_HOURS = 12;
        (config as any).AUTO_DREAM_MIN_SESSIONS = 1;

        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gravyclaw-autodream-ext-"));
        setMemoryRootForTests(tempRoot);
        
        const lockPath = getConsolidationLockPath();
        if (fs.existsSync(lockPath)) {
            fs.unlinkSync(lockPath);
        }
        db.prepare("DELETE FROM memory WHERE session_id LIKE 'test_session_%'").run();
        db.prepare("DELETE FROM fact_stats WHERE session_id LIKE 'test_session_%'").run();
    });

    afterEach(() => {
        resetMemoryRoot();
        if (tempRoot && fs.existsSync(tempRoot)) {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
        
        const lockPath = getConsolidationLockPath();
        if (fs.existsSync(lockPath)) {
            try {
                fs.unlinkSync(lockPath);
            } catch (e) {}
        }
    });

    it("1. Concurrent Lock Acquisition (TOCTOU Defense)", async () => {
        // Attempt to acquire lock concurrently
        const p1 = tryAcquireConsolidationLock();
        const p2 = tryAcquireConsolidationLock();
        const p3 = tryAcquireConsolidationLock();
        
        const results = await Promise.all([p1, p2, p3]);
        
        // Exactly one should succeed (return number), others should return null
        const successes = results.filter(r => r !== null);
        const skips = results.filter(r => r === null);
        
        expect(successes.length).toBe(1);
        expect(skips.length).toBe(2);
    });

    it("2. Release Lock Updates mtime (Timestamp Preservation)", async () => {
        const mtime1 = await tryAcquireConsolidationLock();
        expect(mtime1).not.toBeNull();
        
        // Wait 50ms to ensure time difference
        await new Promise(r => setTimeout(r, 50));
        
        await releaseConsolidationLock();
        
        const lockPath = getConsolidationLockPath();
        expect(fs.existsSync(lockPath)).toBe(true); // Must exist
        
        const lastAt = readLastConsolidatedAt();
        expect(lastAt).toBeGreaterThan(mtime1 as number);
    });

    it("3. Error Isolation (Partial Batch Failure)", async () => {
        // Setup two sessions
        saveFact("test_session_1", "preferences", "Fact 1");
        saveFact("test_session_1", "preferences", "Fact 2");
        saveFact("test_session_1", "preferences", "Fact 3");
        
        saveFact("test_session_2", "preferences", "Fact A");
        saveFact("test_session_2", "preferences", "Fact B");
        saveFact("test_session_2", "preferences", "Fact C");

        db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)").run("test_session_1", "{}");
        db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)").run("test_session_2", "{}");

        // Force time gate
        const lockPath = getConsolidationLockPath();
        const pastTime = new Date(Date.now() - 13 * 60 * 60 * 1000);
        fs.writeFileSync(lockPath, "lock");
        fs.utimesSync(lockPath, pastTime, pastTime);

        // Mock LLM to throw error on session 1, succeed on session 2
        vi.spyOn(agent, 'runForkedAgent').mockImplementation(async ({ sessionId }) => {
            if (sessionId === "dream-test_session_1") {
                throw new Error("Simulated LLM Timeout/Failure");
            }
            return {
                messages: [{ role: "assistant", content: "- [preferences] Consolidated 2" }],
                totalUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
            };
        });

        await executeAutoDream();

        // Session 1 should be untouched (3 facts)
        const facts1 = readAllFacts("test_session_1");
        expect(facts1.length).toBe(3);

        // Session 2 should be consolidated (1 fact)
        const facts2 = readAllFacts("test_session_2");
        expect(facts2.length).toBe(1);
        expect(facts2[0]?.fact).toBe("Consolidated 2");
        
        vi.restoreAllMocks();
    });

    it("4. Database State Synchronization (Orphan Cleanup)", async () => {
        saveFact("test_session_db", "preferences", "Old Fact 1");
        saveFact("test_session_db", "preferences", "Old Fact 2");
        saveFact("test_session_db", "preferences", "Old Fact 3");
        
        db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)").run("test_session_db", "{}");

        // Verify stats exist
        let stats: any[] = db.prepare("SELECT * FROM fact_stats WHERE session_id = ?").all("test_session_db");
        expect(stats.length).toBe(3);

        const lockPath = getConsolidationLockPath();
        const pastTime = new Date(Date.now() - 13 * 60 * 60 * 1000);
        fs.writeFileSync(lockPath, "lock");
        fs.utimesSync(lockPath, pastTime, pastTime);

        vi.spyOn(agent, 'runForkedAgent').mockImplementation(async () => {
            return {
                messages: [{ role: "assistant", content: "- [preferences] New Unified Fact" }],
                totalUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
            };
        });
        
        vi.useFakeTimers();
        vi.advanceTimersByTime(15 * 60 * 1000); // 15 mins to bypass SCAN_SESSIONS_INTERVAL_MS throttle

        await executeAutoDream();
        
        vi.useRealTimers();
        
        // Verify old stats are gone, and new stat is present
        stats = db.prepare("SELECT fact_text FROM fact_stats WHERE session_id = ?").all("test_session_db") as any[];
        expect(stats.length).toBe(1);
        expect(stats[0].fact_text).toBe("New Unified Fact");
        
        vi.restoreAllMocks();
    });
});
