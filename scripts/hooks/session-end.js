import fs from "node:fs";
import path from "node:path";
import { syncLatestSessionToVault } from "./vault-sync.js";

const HOOKS_STATE_FILE = path.join(process.cwd(), ".hooks-state.json");

function loadState() {
  try {
    if (fs.existsSync(HOOKS_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(HOOKS_STATE_FILE, "utf-8"));
    }
  } catch (e) {
    // Ignore errors
  }
  return { toolCallCount: 0, lastCompaction: 0, pendingPatterns: [] };
}

function saveState(state) {
  fs.writeFileSync(HOOKS_STATE_FILE, JSON.stringify(state, null, 2));
}

let input = "";
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  const state = loadState();
  
  console.error(`[SessionEnd] Session completed with ${state.toolCallCount} tool calls`);
  console.error("[SessionEnd] State saved to hooks state file");
  
  saveState({ ...state, lastSessionId: null });

  const syncResult = syncLatestSessionToVault({ workspaceRoot: process.cwd() });
  if (syncResult.success) {
    console.error(`[SessionEnd] Vault synced: ${syncResult.archivePath}`);
  } else {
    console.error(`[SessionEnd] Vault sync skipped: ${syncResult.reason ?? "unknown"}${syncResult.error ? ` (${syncResult.error})` : ""}`);
  }
  
  console.log(input);
});
