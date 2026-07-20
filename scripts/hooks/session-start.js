import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const HOOKS_STATE_FILE = path.join(process.cwd(), ".hooks-state.json");
const DB_PATH = path.join(process.cwd(), "data", "gravity.db");

function loadState() {
  try {
    if (fs.existsSync(HOOKS_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(HOOKS_STATE_FILE, "utf-8"));
    }
  } catch (e) {
    // Ignore errors
  }
  return { lastSessionId: null, toolCallCount: 0, lastCompaction: 0 };
}

function saveState(state) {
  fs.writeFileSync(HOOKS_STATE_FILE, JSON.stringify(state, null, 2));
}

function getLastSession() {
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const row = db.prepare(`
      SELECT session_id, timestamp
      FROM memory 
      ORDER BY timestamp DESC, id DESC
      LIMIT 1
    `).get();
    db.close();
    return row;
  } catch (e) {
    return null;
  }
}

function loadSessionContext(sessionId) {
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const messages = db.prepare(`
      SELECT content, role 
      FROM memory 
      WHERE session_id = ? 
      ORDER BY timestamp ASC, id ASC
    `).all(sessionId);
    db.close();
    return messages;
  } catch (e) {
    return [];
  }
}

let input = "";
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  const state = loadState();
  const lastSession = getLastSession();
  
  if (lastSession && lastSession.session_id !== state.lastSessionId) {
    const messages = loadSessionContext(lastSession.session_id);
    
    console.error("[SessionStart] Loaded previous session context");
    console.error(`[SessionStart] Session: ${lastSession.session_id.slice(0, 8)}...`);
    console.error(`[SessionStart] Messages: ${messages.length}`);
    
    state.lastSessionId = lastSession.session_id;
    saveState(state);
  } else {
    console.error("[SessionStart] No previous session found or same session");
  }
  
  console.log(input);
});
