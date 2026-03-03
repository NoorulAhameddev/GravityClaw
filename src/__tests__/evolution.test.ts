import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../db.ts";
import {
  saveFact,
  recallFacts,
  readAllFacts,
  getFactStats,
  rewriteSessionFacts,
} from "../memory/markdown.ts";
import { saveEntity, getEntityByName, saveRelationship, queryGraph } from "../memory/graph.ts";
import { runMemoryEvolution, getEvolutionLogPath } from "../memory/evolution.ts";
import * as fs from "node:fs";

const SESSION_ID = "evolution:test";

describe("Self-Evolving Memory", () => {
  beforeEach(() => {
    db.prepare("DELETE FROM fact_stats WHERE session_id = ?").run(SESSION_ID);
    db.prepare("DELETE FROM relationships WHERE session_id = ?").run(SESSION_ID);
    db.prepare("DELETE FROM entities WHERE session_id = ?").run(SESSION_ID);

    rewriteSessionFacts(SESSION_ID, []);
  });

  afterEach(() => {
    db.prepare("DELETE FROM fact_stats WHERE session_id = ?").run(SESSION_ID);
    db.prepare("DELETE FROM relationships WHERE session_id = ?").run(SESSION_ID);
    db.prepare("DELETE FROM entities WHERE session_id = ?").run(SESSION_ID);
    rewriteSessionFacts(SESSION_ID, []);
  });

  it("tracks fact access patterns via save and recall", () => {
    saveFact(SESSION_ID, "preferences", "Use concise responses");
    recallFacts(SESSION_ID, "concise", 10);

    const stats = getFactStats(SESSION_ID);
    expect(stats.length).toBe(1);
    expect(stats[0]?.accessCount).toBeGreaterThanOrEqual(2);
    expect(stats[0]?.lastAccessed).toBeTruthy();
  });

  it("tracks entity access patterns through reads and graph queries", () => {
    saveEntity(SESSION_ID, "GravityClaw", "project", { lang: "ts" });
    saveRelationship(SESSION_ID, "Noor", "works_on", "GravityClaw");

    getEntityByName(SESSION_ID, "GravityClaw");
    queryGraph(SESSION_ID, "Noor", 2);

    const row = db
      .prepare("SELECT access_count FROM entities WHERE session_id = ? AND name = ?")
      .get(SESSION_ID, "GravityClaw") as { access_count: number } | undefined;

    expect(row).toBeDefined();
    expect((row?.access_count ?? 0)).toBeGreaterThan(0);
  });

  it("merges near-duplicate facts during evolution", async () => {
    saveFact(SESSION_ID, "project", "The API gateway handles authentication and routing");
    saveFact(SESSION_ID, "project", "API gateway handles auth and routing");
    saveFact(SESSION_ID, "project", "Daily standup at 9 AM");

    const report = await runMemoryEvolution(SESSION_ID, {
      config: {
        duplicateSimilarityThreshold: 0.4,
        staleDays: 9999,
      },
    });

    const factsAfter = readAllFacts(SESSION_ID);
    expect(report.mergedFacts).toBeGreaterThanOrEqual(1);
    expect(factsAfter.length).toBeLessThan(3);
  });

  it("removes stale low-importance facts", async () => {
    saveFact(SESSION_ID, "notes", "Old temporary note");
    saveFact(SESSION_ID, "notes", "Active important note");

    db.prepare(
      "UPDATE fact_stats SET last_accessed = datetime('now', '-120 days'), importance = 0 WHERE session_id = ? AND fact_text LIKE ?"
    ).run(SESSION_ID, "%old temporary note%");

    db.prepare(
      "UPDATE fact_stats SET last_accessed = datetime('now'), importance = 5 WHERE session_id = ? AND fact_text LIKE ?"
    ).run(SESSION_ID, "%active important note%");

    const report = await runMemoryEvolution(SESSION_ID, {
      config: {
        staleDays: 90,
        lowImportanceThreshold: 1,
      },
    });

    const factsAfter = readAllFacts(SESSION_ID).map((f) => f.fact.toLowerCase());
    expect(report.removedFacts).toBeGreaterThanOrEqual(1);
    expect(factsAfter.some((f) => f.includes("old temporary note"))).toBe(false);
    expect(factsAfter.some((f) => f.includes("active important note"))).toBe(true);
  });

  it("reorganizes categories using organizer callback", async () => {
    saveFact(SESSION_ID, "preferences", "Use markdown bullets");
    saveFact(SESSION_ID, "preferences", "Prefer concise summaries");

    const report = await runMemoryEvolution(SESSION_ID, {
      categoryOrganizer: async (groups) => {
        const output: Record<string, string> = {};
        for (const group of groups) {
          if (group.category === "preferences") {
            output[group.category] = "style";
          }
        }
        return output;
      },
      config: {
        staleDays: 9999,
      },
    });

    const updatedFacts = readAllFacts(SESSION_ID);
    expect(report.categoryChanges).toBeGreaterThan(0);
    expect(updatedFacts.every((f) => f.category === "style")).toBe(true);
  });

  it("writes evolution reports to log file", async () => {
    saveFact(SESSION_ID, "notes", "Log test fact");

    const logPath = getEvolutionLogPath();
    const beforeExists = fs.existsSync(logPath);
    const before = beforeExists ? fs.readFileSync(logPath, "utf8") : "";

    await runMemoryEvolution(SESSION_ID, {
      config: { staleDays: 9999 },
    });

    const after = fs.readFileSync(logPath, "utf8");
    expect(after.length).toBeGreaterThan(before.length);
    expect(after).toContain(SESSION_ID);
  });
});
