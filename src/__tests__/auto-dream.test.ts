import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { db } from "../db.ts";
import { config } from "../config.ts";
import {
    saveFact,
    readAllFacts,
    setMemoryRootForTests,
    resetMemoryRoot,
} from "../memory/markdown.ts";
import {
    executeAutoDream,
    startAutoDreamScheduler,
} from "../memory/autoDream.ts";

const getConsolidationLockPath = () => path.resolve(process.cwd(), "auto-dream.lock");

vi.mock("../lib/forkedAgent.ts", () => {
    return {
        runForkedAgent: vi.fn().mockImplementation(async ({ prompt, sessionId }) => {
            return {
                messages: [
                    {
                        role: "assistant",
                        content: `- [preferences] Consolidated preference
- [profile] Consolidated profile`,
                    },
                ],
            };
        }),
    };
});

describe("AutoDream Integration and Consolidation", () => {
    const sessionId = "telegram:12345";
    let tempRoot = "";
    
    // Store original config values to restore after tests
    const originalEnabled = config.AUTO_DREAM_ENABLED;
    const originalMinHours = config.AUTO_DREAM_MIN_HOURS;
    const originalMinSessions = config.AUTO_DREAM_MIN_SESSIONS;

    beforeEach(() => {
        // Set configuration variables for test environment
        (config as any).AUTO_DREAM_ENABLED = true;
        (config as any).AUTO_DREAM_MIN_HOURS = 12;
        (config as any).AUTO_DREAM_MIN_SESSIONS = 1;

        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gravyclaw-autodream-"));
        setMemoryRootForTests(tempRoot);
        
        // Ensure consolidation lock does not exist
        const lockPath = getConsolidationLockPath();
        if (fs.existsSync(lockPath)) {
            fs.unlinkSync(lockPath);
        }

        // Clean up database memory rows for the test session
        db.prepare("DELETE FROM memory WHERE session_id = ?").run(sessionId);
    });

    afterEach(() => {
        // Restore original config values
        (config as any).AUTO_DREAM_ENABLED = originalEnabled;
        (config as any).AUTO_DREAM_MIN_HOURS = originalMinHours;
        (config as any).AUTO_DREAM_MIN_SESSIONS = originalMinSessions;

        resetMemoryRoot();
        if (tempRoot && fs.existsSync(tempRoot)) {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
        
        const lockPath = getConsolidationLockPath();
        if (fs.existsSync(lockPath)) {
            fs.unlinkSync(lockPath);
        }

        db.prepare("DELETE FROM memory WHERE session_id = ?").run(sessionId);
    });

    it("should acquire lock, write facts, and consolidate facts using the LLM mock", async () => {
        // 1. Create a session folder with 3+ facts to satisfy consolidation constraints
        saveFact(sessionId, "preferences", "Fact 1: likes dark mode");
        saveFact(sessionId, "preferences", "Fact 2: prefers concise answers");
        saveFact(sessionId, "preferences", "Fact 3: uses tab indentations");

        // 2. Insert at least one dummy record in the database so that listSessionsTouchedSince returns our session folder
        db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)").run(
            sessionId,
            JSON.stringify({ role: "user", content: "Hello claw" })
        );

        // Force lock creation time to be in the past to simulate 12+ hours elapsed
        const lockPath = getConsolidationLockPath();
        const pastTime = new Date(Date.now() - 13 * 60 * 60 * 1000); // 13 hours ago
        fs.writeFileSync(lockPath, "lock");
        fs.utimesSync(lockPath, pastTime, pastTime);

        // 3. Execute consolidation
        await executeAutoDream();

        const finalFacts = readAllFacts(sessionId);

        // 4. Confirm facts are consolidated
        expect(finalFacts.length).toBe(2);
        expect(finalFacts[0]?.category).toBe("preferences");
        expect(finalFacts[0]?.fact).toBe("Consolidated preference");
        expect(finalFacts[1]?.category).toBe("profile");
        expect(finalFacts[1]?.fact).toBe("Consolidated profile");
    });

    it("should skip consolidation if there are fewer than 3 facts in the session folder", async () => {
        saveFact(sessionId, "preferences", "Fact 1: likes dark mode");
        saveFact(sessionId, "preferences", "Fact 2: prefers concise answers");

        db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)").run(
            sessionId,
            JSON.stringify({ role: "user", content: "Hello claw" })
        );

        const lockPath = getConsolidationLockPath();
        const pastTime = new Date(Date.now() - 13 * 60 * 60 * 1000);
        fs.writeFileSync(lockPath, "lock");
        fs.utimesSync(lockPath, pastTime, pastTime);

        await executeAutoDream();

        const finalFacts = readAllFacts(sessionId);
        expect(finalFacts.length).toBe(2);
        expect(finalFacts[0]?.fact).toBe("Fact 1: likes dark mode");
    });

    it("should throttle execution if lock was updated less than 12 hours ago", async () => {
        saveFact(sessionId, "preferences", "Fact 1: likes dark mode");
        saveFact(sessionId, "preferences", "Fact 2: prefers concise answers");
        saveFact(sessionId, "preferences", "Fact 3: uses tab indentations");

        db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)").run(
            sessionId,
            JSON.stringify({ role: "user", content: "Hello claw" })
        );

        // Lock updated 1 hour ago
        const lockPath = getConsolidationLockPath();
        const pastTime = new Date(Date.now() - 1 * 60 * 60 * 1000);
        fs.writeFileSync(lockPath, "lock");
        fs.utimesSync(lockPath, pastTime, pastTime);

        await executeAutoDream();

        // No consolidation should have occurred due to throttling
        const finalFacts = readAllFacts(sessionId);
        expect(finalFacts.length).toBe(3);
    });

    it("should properly manage scheduler start and stop cycles", () => {
        const scheduler = startAutoDreamScheduler();
        expect(typeof scheduler.stop).toBe("function");
        scheduler.stop();
    });
});
