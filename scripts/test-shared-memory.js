import fs from "node:fs";
import path from "node:path";

const PASS = "\x1b[32mPASS\x1b[0m";
const FAIL = "\x1b[31mFAIL\x1b[0m";
const VAULT_ROOT = "D:\\Projects\\Zed";
const SHARED_ROOT = "D:\\Projects\\.ai_memory";

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${label}`);
    failed++;
  }
}

function fileExists(p) {
  return fs.existsSync(p);
}

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch { return null; }
}

function countLines(p) {
  if (!fileExists(p)) return 0;
  return fs.readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean).length;
}

console.log("");
console.log("=== Shared Memory System: End-to-End Test ===");
console.log(`Vault root: ${VAULT_ROOT}`);
console.log(`Shared root: ${SHARED_ROOT}`);
console.log("");

// ── T1: File Structure ──
console.log("T1: File Structure");
assert(fileExists(path.join(SHARED_ROOT, "registry.json")), "registry.json exists");
assert(fileExists(path.join(SHARED_ROOT, "session-state.json")), "session-state.json exists");
assert(fileExists(path.join(SHARED_ROOT, "handoffs.jsonl")), "handoffs.jsonl exists");
assert(fileExists(path.join(SHARED_ROOT, "decisions.jsonl")), "decisions.jsonl exists");
assert(fileExists(path.join(SHARED_ROOT, "README.md")), "README.md exists");
assert(fileExists(path.join(SHARED_ROOT, "projects", "gravityclaw.json")), "projects/gravityclaw.json exists");
assert(fileExists(path.join(SHARED_ROOT, "projects", "aegis-ai.json")), "projects/aegis-ai.json exists");
assert(fileExists(path.join(SHARED_ROOT, "logs")), "logs/ directory exists");
assert(fileExists(path.join(VAULT_ROOT, "0-Inbox", "session-state.md")), "vault mirror session-state.md exists");
assert(fileExists(path.join(VAULT_ROOT, "vault-context.md")), "vault-context.md exists");
assert(fileExists(path.join(VAULT_ROOT, "AGENTS.md")), "vault AGENTS.md exists");
assert(fileExists("D:\\Projects\\.gitignore"), "root .gitignore exists");
console.log("");

// ── T2: Registry Content ──
console.log("T2: Registry Content");
const registry = readJsonSafe(path.join(SHARED_ROOT, "registry.json"));
assert(registry !== null, "registry.json is valid JSON");
assert(registry?.schemaVersion === 1, "registry schemaVersion is 1");
assert(registry?.canonicalLongTermMemory?.vaultRoot === VAULT_ROOT, "registry vaultRoot matches");
assert(registry?.sharedOperationalMemory?.root === SHARED_ROOT, "registry sharedRoot matches");
assert(registry?.sharedOperationalMemory?.startupReads?.length === 3, "registry has 3 startupReads");
assert(registry?.sharedOperationalMemory?.requiredWrites?.length === 3, "registry has 3 requiredWrites");
assert(Array.isArray(registry?.agents) && registry.agents.length === 4, "registry registers all 4 agents");
assert(registry?.writeProtocol?.duringSession?.length >= 2, "registry has duringSession write protocol");
assert(registry?.writeProtocol?.endOfSession?.length >= 2, "registry has endOfSession write protocol");
const agentNames = registry.agents.map(a => a.name);
assert(agentNames.includes("Codex"), "Codex registered");
assert(agentNames.includes("OpenCode"), "OpenCode registered");
assert(agentNames.includes("Claude / Anti-Gravity IDE"), "Claude / Anti-Gravity IDE registered");
assert(agentNames.includes("GitHub Copilot"), "GitHub Copilot registered");
console.log("");

// ── T3: Session State ──
console.log("T3: Session State");
const state = readJsonSafe(path.join(SHARED_ROOT, "session-state.json"));
assert(state !== null, "session-state.json is valid JSON");
assert(state?.schemaVersion === 1, "session state schemaVersion is 1");
assert(state?.workspaceRoot === "D:\\Projects", "workspaceRoot is correct");
assert(state?.sharedMemoryRoot === SHARED_ROOT, "sharedMemoryRoot is correct");
assert(state?.activeAgent !== "unknown", "activeAgent is not 'unknown'");
assert(state?.activeAgent !== undefined, "activeAgent is defined");
assert(typeof state?.projects === "object" && state.projects !== null, "projects object exists");
assert("gravityclaw" in (state?.projects ?? {}), "gravityclaw project present");
assert("aegis-ai" in (state?.projects ?? {}), "aegis-ai project present");
assert(state?.projects?.gravityclaw?.status === "active", "gravityclaw status is active");
assert(state?.projects?.["aegis-ai"]?.status === "active", "aegis-ai status is active");
assert(typeof state?.currentWork === "object", "currentWork object exists");
assert(typeof state?.sources === "object", "sources object exists");
assert(state?.sources?.obsidianVault === VAULT_ROOT, "sources.obsidianVault matches");
console.log("");

// ── T4: Handoffs ──
console.log("T4: Handoffs");
const handoffCount = countLines(path.join(SHARED_ROOT, "handoffs.jsonl"));
assert(handoffCount >= 2, `handoffs.jsonl has ${handoffCount} entries (>= 2)`);
const handoffs = fs.readFileSync(path.join(SHARED_ROOT, "handoffs.jsonl"), "utf8").split(/\r?\n/).filter(Boolean);
for (let i = 0; i < handoffs.length; i++) {
  let parsed = null;
  try { parsed = JSON.parse(handoffs[i]); } catch {}
  assert(parsed !== null, `handoff[${i}] is valid JSON`);
  assert(typeof parsed?.agent === "string" && parsed.agent.length > 0, `handoff[${i}].agent is non-empty string`);
  assert(typeof parsed?.summary === "string" && parsed.summary.length > 0, `handoff[${i}].summary is non-empty`);
}
console.log("");

// ── T5: Decisions ──
console.log("T5: Decisions");
const decisionCount = countLines(path.join(SHARED_ROOT, "decisions.jsonl"));
assert(decisionCount >= 1, `decisions.jsonl has ${decisionCount} entries (>= 1)`);
const decisions = fs.readFileSync(path.join(SHARED_ROOT, "decisions.jsonl"), "utf8").split(/\r?\n/).filter(Boolean);
for (let i = 0; i < decisions.length; i++) {
  let parsed = null;
  try { parsed = JSON.parse(decisions[i]); } catch {}
  assert(parsed !== null, `decision[${i}] is valid JSON`);
  assert(typeof parsed?.decision === "string" && parsed.decision.length > 0, `decision[${i}].decision is non-empty`);
}
console.log("");

// ── T6: Vault Mirror Consistency ──
console.log("T6: Vault Mirror Consistency");
const vaultMd = fs.readFileSync(path.join(VAULT_ROOT, "0-Inbox", "session-state.md"), "utf8");
assert(vaultMd.includes("Session State"), "vault mirror has title");
assert(vaultMd.includes("Last Updated:"), "vault mirror has timestamp");
assert(vaultMd.includes("Active Agent:"), "vault mirror has agent");
assert(vaultMd.includes("## Current Work"), "vault mirror has Current Work section");
assert(vaultMd.includes("## Project States"), "vault mirror has Project States section");
assert(vaultMd.includes("### gravityclaw"), "vault mirror has gravityclaw section");
assert(vaultMd.includes("### aegis-ai"), "vault mirror has aegis-ai section");
const vaultTimestamp = vaultMd.match(/Last Updated:\s*(\S+)/)?.[1];
assert(vaultTimestamp !== null, "vault mirror has parseable timestamp");
assert(vaultTimestamp === state?.updatedAt, "vault mirror timestamp matches session-state.json updatedAt");
console.log("");

// ── T7: Vault Context Freshness ──
console.log("T7: Vault Context Freshness");
const ctxMd = fs.readFileSync(path.join(VAULT_ROOT, "vault-context.md"), "utf8");
assert(ctxMd.includes("Last updated: 2026-07-12"), "vault-context.md was refreshed on 2026-07-12");
assert(ctxMd.includes("685 sessions"), "vault-context.md shows updated session count");
assert(ctxMd.includes("Shared memory"), "vault-context.md mentions shared memory");
console.log("");

// ── T8: Daily Note ──
console.log("T8: Daily Note");
assert(fileExists(path.join(VAULT_ROOT, "1-Daily", "2026-07-12.md")), "today's daily note exists");
const dailyNote = fs.readFileSync(path.join(VAULT_ROOT, "1-Daily", "2026-07-12.md"), "utf8");
assert(dailyNote.includes("Shared memory"), "daily note mentions shared memory");
assert(dailyNote.includes("vault-context.md"), "daily notes mentions work done");
console.log("");

// ── T9: Project Files ──
console.log("T9: Project Files");
const gravityProj = readJsonSafe(path.join(SHARED_ROOT, "projects", "gravityclaw.json"));
assert(gravityProj !== null, "gravityclaw.json is valid JSON");
assert(gravityProj?.project === "gravityclaw", "gravityclaw.json project name correct");
assert(Array.isArray(gravityProj?.startupChecklist), "gravityclaw.json has startupChecklist");
const aegisProj = readJsonSafe(path.join(SHARED_ROOT, "projects", "aegis-ai.json"));
assert(aegisProj !== null, "aegis-ai.json is valid JSON");
assert(aegisProj?.project === "aegis-ai", "aegis-ai.json project name correct");
assert(Array.isArray(aegisProj?.startupChecklist), "aegis-ai.json has startupChecklist");
console.log("");

// ── T10: Root .gitignore ──
console.log("T10: Root .gitignore");
const gi = fs.readFileSync("D:\\Projects\\.gitignore", "utf8");
assert(gi.includes(".ai_memory/"), ".gitignore excludes .ai_memory/");
assert(gi.includes("nul"), ".gitignore excludes nul");
console.log("");

// ── Summary ──
console.log("─".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log("─".repeat(50));
console.log("");

process.exit(failed > 0 ? 1 : 0);
