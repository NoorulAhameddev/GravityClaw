import fs from "node:fs";
import path from "node:path";

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
  
  state.toolCallCount++;
  
  if (state.toolCallCount % 50 === 0) {
    console.error("[PreCompact] 50 tool calls reached - consider manual compaction");
  }
  
  if (state.toolCallCount % 100 === 0) {
    console.error("[PreCompact] 100 tool calls - STRONGLY recommend /compact");
  }
  
  state.lastCompaction = state.toolCallCount;
  saveState(state);
  
  console.log(input);
});
