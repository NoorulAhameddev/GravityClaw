import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { syncLatestSessionToVault } from "../../scripts/hooks/vault-sync.js";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function seedDb(dbPath: string, sessionId: string): void {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      message_json TEXT NOT NULL,
      settings TEXT DEFAULT '{}'
    );
  `);

  db.prepare("INSERT INTO memory (session_id, timestamp, message_json) VALUES (?, ?, ?)")
    .run(sessionId, "2026-05-31T10:00:00.000Z", JSON.stringify({ role: "user", content: "Investigate vault sync drift" }));
  db.prepare("INSERT INTO memory (session_id, timestamp, message_json) VALUES (?, ?, ?)")
    .run(sessionId, "2026-05-31T10:05:00.000Z", JSON.stringify({ role: "assistant", content: "Root cause identified and sync path fixed." }));
  db.close();
}

const cleanupPaths: string[] = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const target = cleanupPaths.pop();
    if (target && fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
});

describe("vault sync", () => {
  it("writes the latest session into the vault", () => {
    const workspaceRoot = makeTempDir("gravityclaw-workspace-");
    const vaultRoot = makeTempDir("gravityclaw-vault-");
    cleanupPaths.push(workspaceRoot, vaultRoot);

    fs.mkdirSync(path.join(workspaceRoot, "data"), { recursive: true });
    fs.mkdirSync(path.join(vaultRoot, "9-Decisions"), { recursive: true });
    fs.writeFileSync(path.join(vaultRoot, "vault-context.md"), "> Last sync: 2026-05-15 (old)\n", "utf8");

    seedDb(path.join(workspaceRoot, "data", "gravity.db"), "test:session:1");

    const result = syncLatestSessionToVault({
      workspaceRoot,
      vaultRoot,
      now: "2026-05-31T12:00:00.000Z",
    });

    expect(result.success).toBe(true);
    expect(result.archiveCreated).toBe(true);
    expect(result.dailyUpdated).toBe(true);
    expect(result.contextUpdated).toBe(true);

    const dailyNote = fs.readFileSync(path.join(vaultRoot, "1-Daily", "2026-05-31.md"), "utf8");
    const archive = fs.readFileSync(path.join(vaultRoot, "9-Decisions", "sessions", "gravityclaw-test-session-1.md"), "utf8");
    const vaultContext = fs.readFileSync(path.join(vaultRoot, "vault-context.md"), "utf8");

    expect(dailyNote).toContain("[[9-Decisions/sessions/gravityclaw-test-session-1]]");
    expect(archive).toContain("test:session:1");
    expect(archive).toContain("Root cause identified and sync path fixed.");
    expect(vaultContext).toContain("Last sync: 2026-05-31 (GravityClaw session sync)");
  });

  it("does not duplicate the same session entry on repeated sync", () => {
    const workspaceRoot = makeTempDir("gravityclaw-workspace-");
    const vaultRoot = makeTempDir("gravityclaw-vault-");
    cleanupPaths.push(workspaceRoot, vaultRoot);

    fs.mkdirSync(path.join(workspaceRoot, "data"), { recursive: true });
    fs.mkdirSync(path.join(vaultRoot, "9-Decisions"), { recursive: true });
    fs.writeFileSync(path.join(vaultRoot, "vault-context.md"), "> Last sync: 2026-05-15 (old)\n", "utf8");

    seedDb(path.join(workspaceRoot, "data", "gravity.db"), "test:session:repeat");

    syncLatestSessionToVault({
      workspaceRoot,
      vaultRoot,
      now: "2026-05-31T12:00:00.000Z",
    });

    const second = syncLatestSessionToVault({
      workspaceRoot,
      vaultRoot,
      now: "2026-05-31T12:01:00.000Z",
    });

    const dailyNote = fs.readFileSync(path.join(vaultRoot, "1-Daily", "2026-05-31.md"), "utf8");
    const occurrences = dailyNote.match(/\[\[9-Decisions\/sessions\/gravityclaw-test-session-repeat\]\]/g) ?? [];

    expect(second.success).toBe(true);
    expect(second.archiveCreated).toBe(false);
    expect(second.dailyUpdated).toBe(false);
    expect(occurrences).toHaveLength(1);
  });
});
