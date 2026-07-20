import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error
import { bootstrapSharedMemory, syncSharedMemoryToVault } from "../../scripts/shared-memory-lib.js";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
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

describe("shared memory sync", () => {
  it("bootstraps shared memory contract files", () => {
    const workspaceRoot = makeTempDir("shared-memory-workspace-");
    const vaultRoot = makeTempDir("shared-memory-vault-");
    cleanupPaths.push(workspaceRoot, vaultRoot);

    const result = bootstrapSharedMemory({
      workspaceRoot,
      vaultRoot,
      now: "2026-07-12T08:00:00.000Z",
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(workspaceRoot, ".ai_memory", "registry.json"))).toBe(true);
    expect(fs.existsSync(path.join(workspaceRoot, ".ai_memory", "session-state.json"))).toBe(true);
    expect(fs.existsSync(path.join(workspaceRoot, ".ai_memory", "projects", "gravityclaw.json"))).toBe(true);
    expect(fs.existsSync(path.join(workspaceRoot, ".ai_memory", "projects", "aegis-ai.json"))).toBe(true);
  });

  it("mirrors session state into the Obsidian vault", () => {
    const workspaceRoot = makeTempDir("shared-memory-workspace-");
    const vaultRoot = makeTempDir("shared-memory-vault-");
    cleanupPaths.push(workspaceRoot, vaultRoot);

    bootstrapSharedMemory({
      workspaceRoot,
      vaultRoot,
      now: "2026-07-12T08:00:00.000Z",
    });

    const result = syncSharedMemoryToVault({
      workspaceRoot,
      vaultRoot,
      now: "2026-07-12T08:05:00.000Z",
    });

    expect(result.success).toBe(true);

    const sessionStatePath = path.join(vaultRoot, "0-Inbox", "session-state.md");
    const healthPath = path.join(vaultRoot, "9-Auto", "shared-memory-health.json");

    expect(fs.readFileSync(sessionStatePath, "utf8")).toContain("# Session State");
    expect(fs.readFileSync(sessionStatePath, "utf8")).toContain("Shared AI memory");
    expect(fs.existsSync(healthPath)).toBe(true);
  });
});
