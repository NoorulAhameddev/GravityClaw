import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { syncAgentSourcesToVault } from "../../scripts/agent-sync-lib.js";

const cleanupPaths: string[] = [];

function makeTempDir(prefix: string): string {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  cleanupPaths.push(target);
  return target;
}

function ensureVaultRoot(vaultRoot: string): void {
  fs.mkdirSync(path.join(vaultRoot, "9-Decisions", "sessions"), { recursive: true });
  fs.mkdirSync(path.join(vaultRoot, "9-Auto"), { recursive: true });
  fs.writeFileSync(path.join(vaultRoot, "vault-context.md"), "> Last sync: 2026-05-15 (old)\n", "utf8");
}

function seedOpenCodeDb(dbPath: string): void {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE session (
      id TEXT PRIMARY KEY,
      title TEXT,
      slug TEXT,
      directory TEXT,
      version TEXT,
      time_created INTEGER,
      time_updated INTEGER,
      summary_additions INTEGER,
      summary_deletions INTEGER,
      summary_files INTEGER,
      summary_diffs TEXT,
      project_id TEXT
    );
    CREATE TABLE message (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL
    );
    CREATE TABLE part (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL
    );
  `);

  db.prepare(`
    INSERT INTO session (
      id, title, slug, directory, version, time_created, time_updated,
      summary_additions, summary_deletions, summary_files, summary_diffs, project_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "oc-1",
    "OpenCode Session",
    "open-code-session",
    "D:/Projects/GravityClaw",
    "1.0.0",
    1715336400000,
    1715336700000,
    10,
    1,
    2,
    "[]",
    "gravityclaw"
  );

  db.prepare("INSERT INTO message (session_id) VALUES (?)").run("oc-1");
  db.prepare("INSERT INTO part (message_id) VALUES (?)").run(1);
  db.close();
}

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const target = cleanupPaths.pop();
    if (target && fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
});

describe("agent sync", () => {
  it("imports OpenCode, Claude JSONL, and Codex metadata into one vault state", () => {
    const root = makeTempDir("agent-sync-root-");
    const vaultRoot = path.join(root, "vault");
    const openCodeRoot = path.join(root, "opencode");
    const claudeProjectRoot = path.join(root, "claude", "projects", "D--Projects-GravityClaw");
    const codexRoot = path.join(root, "codex");

    ensureVaultRoot(vaultRoot);
    fs.mkdirSync(openCodeRoot, { recursive: true });
    fs.mkdirSync(claudeProjectRoot, { recursive: true });
    fs.mkdirSync(codexRoot, { recursive: true });

    seedOpenCodeDb(path.join(openCodeRoot, "opencode.db"));

    fs.writeFileSync(
      path.join(claudeProjectRoot, "claude-session.jsonl"),
      [
        JSON.stringify({ sessionId: "claude-1", cwd: "d:\\Projects\\GravityClaw", timestamp: "2026-05-10T11:22:52.442Z", type: "user", message: { role: "user", content: [{ type: "text", text: "Investigate bug" }] } }),
        JSON.stringify({ sessionId: "claude-1", cwd: "d:\\Projects\\GravityClaw", timestamp: "2026-05-10T11:22:57.850Z", type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Root cause found" }] } }),
      ].join("\n"),
      "utf8"
    );

    fs.writeFileSync(
      path.join(codexRoot, "session_index.jsonl"),
      `${JSON.stringify({ id: "codex-1", thread_name: "Codex Thread", updated_at: "2026-05-15T17:12:58.8803772Z" })}\n`,
      "utf8"
    );

    const result = syncAgentSourcesToVault({
      vaultRoot,
      openCode: {
        dbPath: path.join(openCodeRoot, "opencode.db"),
      },
      claude: {
        projectsRoot: path.join(root, "claude", "projects"),
      },
      codex: {
        root: codexRoot,
      },
      now: "2026-05-31T12:00:00.000Z",
    });

    expect(result.success).toBe(true);
    expect(result.importedCount).toBe(3);
    expect(result.latestEvent?.source).toBe("codex");

    const state = JSON.parse(fs.readFileSync(path.join(vaultRoot, "9-Auto", "agent-sync-state.json"), "utf8"));
    expect(state.records).toHaveLength(3);

    const archiveNames = fs.readdirSync(path.join(vaultRoot, "9-Decisions", "sessions"));
    expect(archiveNames).toContain("opencode-oc-1.md");
    expect(archiveNames).toContain("claude-claude-session.md");
    expect(archiveNames).toContain("codex-codex-1.md");
  });

  it("is idempotent across repeated runs", () => {
    const root = makeTempDir("agent-sync-root-");
    const vaultRoot = path.join(root, "vault");
    const openCodeRoot = path.join(root, "opencode");
    const claudeProjectRoot = path.join(root, "claude", "projects", "D--Projects-GravityClaw");
    const codexRoot = path.join(root, "codex");

    ensureVaultRoot(vaultRoot);
    fs.mkdirSync(openCodeRoot, { recursive: true });
    fs.mkdirSync(claudeProjectRoot, { recursive: true });
    fs.mkdirSync(codexRoot, { recursive: true });

    seedOpenCodeDb(path.join(openCodeRoot, "opencode.db"));
    fs.writeFileSync(
      path.join(claudeProjectRoot, "claude-session.jsonl"),
      `${JSON.stringify({ sessionId: "claude-2", cwd: "d:\\Projects\\GravityClaw", timestamp: "2026-05-10T11:22:52.442Z", type: "user", message: { role: "user", content: [{ type: "text", text: "Hi" }] } })}\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(codexRoot, "session_index.jsonl"),
      `${JSON.stringify({ id: "codex-2", thread_name: "Codex Thread 2", updated_at: "2026-05-15T17:12:58.8803772Z" })}\n`,
      "utf8"
    );

    const first = syncAgentSourcesToVault({
      vaultRoot,
      openCode: { dbPath: path.join(openCodeRoot, "opencode.db") },
      claude: { projectsRoot: path.join(root, "claude", "projects") },
      codex: { root: codexRoot },
      now: "2026-05-31T12:00:00.000Z",
    });

    const second = syncAgentSourcesToVault({
      vaultRoot,
      openCode: { dbPath: path.join(openCodeRoot, "opencode.db") },
      claude: { projectsRoot: path.join(root, "claude", "projects") },
      codex: { root: codexRoot },
      now: "2026-05-31T12:05:00.000Z",
    });

    expect(first.importedCount).toBe(3);
    expect(second.importedCount).toBe(0);

    const state = JSON.parse(fs.readFileSync(path.join(vaultRoot, "9-Auto", "agent-sync-state.json"), "utf8"));
    expect(state.records).toHaveLength(3);
  });
});
