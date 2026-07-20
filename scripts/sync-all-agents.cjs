#!/usr/bin/env node
/**
 * Multi-Agent Session Sync Daemon
 *
 * Syncs sessions from Codex CLI, Gemini Antigravity, Hermes, Qwen CLI,
 * and other AI agents into the Obsidian vault at:
 *   D:\Projects\Zed\9-Decisions\sessions\
 *
 * Run manually:   node sync-all-agents.js [--once]
 * Run as daemon:  node sync-all-agents.js [--interval-minutes 10]
 *
 * Designed to be registered as a Windows Scheduled Task running every 10min.
 *
 * Architecture mirrors OpenCode's capture-sessions.js:
 * - Each agent has a scanner module
 * - Common vault writer for markdown file creation
 * - State tracking JSON to avoid reprocessing
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Config ────────────────────────────────────────────────────────────────
const CONFIG = {
  vaultDir: path.resolve(__dirname, '..', '..', 'Zed', '9-Decisions', 'sessions'),
  stateFile: path.resolve(__dirname, '..', '..', '.ai_memory', 'sync-all-agents-state.json'),
  logFile: path.resolve(__dirname, '..', '..', '.ai_memory', 'sync-all-agents.log'),
  sessionIndexFile: path.resolve(__dirname, '..', '..', 'Zed', '9-Decisions', 'sessions', 'session-index.md'),
};

// Agent-specific data sources
const AGENTS = {
  codex: {
    prefix: 'codex-ses-',
    label: 'Codex CLI',
    sqliteDb: path.join(process.env.USERPROFILE || '', '.codex', 'state_5.sqlite'),
    rolloutDir: path.join(process.env.USERPROFILE || '', '.codex'),
  },
  gemini: {
    prefix: 'gemini-ses-',
    label: 'Gemini Antigravity',
    summariesPb: path.join(process.env.USERPROFILE || '', '.gemini', 'antigravity', 'agyhub_summaries_proto.pb'),
    convDir: path.join(process.env.USERPROFILE || '', '.gemini', 'antigravity', 'conversations'),
    convDirIde: path.join(process.env.USERPROFILE || '', '.gemini', 'antigravity-ide', 'conversations'),
  },
  hermes: {
    prefix: 'hermes-ses-',
    label: 'Hermes',
    sqliteDb: path.join(process.env.LOCALAPPDATA || '', 'hermes', 'state.db'),
  },
  qwen: {
    prefix: 'qwen-ses-',
    label: 'Qwen CLI',
    chatsDir: path.join(process.env.USERPROFILE || '', '.qwen', 'projects', 'c--users-noorul-ahamed', 'chats'),
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    fs.mkdirSync(path.dirname(CONFIG.logFile), { recursive: true });
    fs.appendFileSync(CONFIG.logFile, line + '\n');
  } catch {}
}

function loadState() {
  try {
    if (fs.existsSync(CONFIG.stateFile)) {
      return JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf-8'));
    }
  } catch (e) { log(`State load error: ${e.message}`); }
  return { tracked: {}, lastRun: null };
}

function saveState(state) {
  state.lastRun = new Date().toISOString();
  fs.mkdirSync(path.dirname(CONFIG.stateFile), { recursive: true });
  fs.writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2));
}

function sqliteQuery(dbPath, query) {
  try {
    if (!fs.existsSync(dbPath)) return [];
    const result = execSync(`sqlite3 "${dbPath}" "${query.replace(/"/g, '""')}"`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim().split('\n').filter(Boolean);
  } catch { return []; }
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80) || 'untitled';
}

function getOutPath(session) {
  const prefix = AGENTS[session.agent]?.prefix || 'agent-ses-';
  return path.join(CONFIG.vaultDir, `${prefix}${session.sessionId}.md`);
}

function writeSessionFile(session) {
  const outPath = getOutPath(session);
  const prefix = AGENTS[session.agent]?.prefix || 'agent-ses-';
  const agentLabel = AGENTS[session.agent]?.label || session.agent;
  const slug = slugify(session.title);

  // Skip if file already exists
  if (fs.existsSync(outPath)) return outPath;

  let content = '---\n';
  content += `source: "${session.source || session.agent}"\n`;
  content += `session_id: "${session.sessionId}"\n`;
  content += `slug: "${slug}"\n`;
  content += `directory: "${session.directory || ''}"\n`;
  content += `updated_at: "${session.updatedAt || new Date().toISOString()}"\n`;
  content += '---\n\n';
  content += `# ${session.title || agentLabel + ' Session'}\n\n`;
  content += `- Agent: ${agentLabel}\n`;
  content += `- Session ID: \`${session.sessionId}\`\n`;

  if (session.extraFields) {
    for (const [k, v] of Object.entries(session.extraFields)) {
      if (v) content += `- ${k}: ${v}\n`;
    }
  }

  content += `\n## Summary\n\n${session.summary || 'No summary available.'}\n`;

  fs.mkdirSync(CONFIG.vaultDir, { recursive: true });
  fs.writeFileSync(outPath, content, 'utf-8');
  return outPath;
}

function isAlreadyTracked(state, agent, sessionId) {
  // Check state file first
  const key = `${agent}::${sessionId}`;
  if (state.tracked[key]) return true;
  // Fallback: check if vault file exists
  const prefix = AGENTS[agent]?.prefix || 'agent-ses-';
  const outPath = path.join(CONFIG.vaultDir, `${prefix}${sessionId}.md`);
  return fs.existsSync(outPath);
}

function markTracked(state, agent, sessionId, info = {}) {
  const key = `${agent}::${sessionId}`;
  state.tracked[key] = { ...info, trackedAt: new Date().toISOString() };
}

// Bootstrap state from existing vault files on first run
function bootstrapState(state) {
  if (!fs.existsSync(CONFIG.vaultDir)) return;
  const files = fs.readdirSync(CONFIG.vaultDir).filter(f => f.endsWith('.md'));
  for (const file of files) {
    for (const [agentKey, agentCfg] of Object.entries(AGENTS)) {
      if (file.startsWith(agentCfg.prefix)) {
        const sessionId = file.slice(agentCfg.prefix.length, -3);
        const key = `${agentKey}::${sessionId}`;
        if (!state.tracked[key]) {
          state.tracked[key] = { bootstrapped: true, trackedAt: new Date().toISOString() };
        }
        break;
      }
    }
  }
}

// ─── Extracting printable strings from binary protobuf ────────────────────

function extractStringsFromPb(filePath, minLen = 4) {
  try {
    const data = fs.readFileSync(filePath);
    const strings = [];
    let current = '';
    for (const b of data) {
      if (b >= 32 && b <= 126) {
        current += String.fromCharCode(b);
      } else {
        if (current.length >= minLen) strings.push(current);
        current = '';
      }
    }
    if (current.length >= minLen) strings.push(current);
    return strings;
  } catch { return []; }
}

// ─── Agent Scanners ────────────────────────────────────────────────────────

/**
 * Codex CLI Scanner
 * Sources: state_5.sqlite (thread metadata) + rollout-*.jsonl (conversations)
 */
async function scanCodex(state) {
  const db = AGENTS.codex.sqliteDb;
  if (!fs.existsSync(db)) { log('Codex: DB not found, skipping'); return 0; }

  const rows = sqliteQuery(db,
    `SELECT id, coalesce(nullif(title,''), first_user_message, preview, 'Codex Session') as title,
            model, cwd, datetime(created_at_ms/1000,'unixepoch') as created,
            datetime(updated_at_ms/1000,'unixepoch') as updated,
            tokens_used, coalesce(nullif(first_user_message,''), preview, '') as preview
     FROM threads
     ORDER BY created_at_ms DESC`
  );

  let count = 0;
  for (const row of rows) {
    const parts = row.split('|');
    if (parts.length < 4) continue;
    const [id, title, model, cwd, created, updated, tokens, preview] = parts;

    if (isAlreadyTracked(state, 'codex', id)) continue;

    writeSessionFile({
      sessionId: id,
      agent: 'codex',
      title: title || 'Codex Session',
      summary: (preview || title || '').substring(0, 300) || 'Codex CLI session',
      source: 'codex',
      directory: cwd || '',
      updatedAt: updated || created || new Date().toISOString(),
      extraFields: {
        Model: model || '',
        'Tokens Used': tokens || '',
        Created: created || '',
      },
    });
    markTracked(state, 'codex', id, { title });
    count++;
  }

  // Also check for new rollout-*.jsonl files not matching threads
  // These are legacy conversation logs
  if (fs.existsSync(AGENTS.codex.rolloutDir)) {
    const files = fs.readdirSync(AGENTS.codex.rolloutDir)
      .filter(f => f.startsWith('rollout-') && f.endsWith('.jsonl'));
    for (const file of files) {
      if (isAlreadyTracked(state, 'codex-rollout', file)) continue;
      // Just mark as tracked — content already covered by thread export
      markTracked(state, 'codex-rollout', file, { file });
    }
  }

  if (count > 0) log(`Codex: ${count} new session(s)`);
  return count;
}

/**
 * Gemini Antigravity Scanner
 * Sources: agyhub_summaries_proto.pb (session metadata)
 * Note: Full conversation content is in .pb protobuf files (not decodable without schema)
 */
async function scanGemini(state) {
  const pbPath = AGENTS.gemini.summariesPb;
  if (!fs.existsSync(pbPath)) { log('Gemini: summaries file not found, skipping'); return 0; }

  // Build set of known .pb conversation files
  const pbFiles = new Set();
  for (const dir of [AGENTS.gemini.convDir, AGENTS.gemini.convDirIde]) {
    try {
      for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.pb'))) {
        pbFiles.add(path.basename(f, '.pb'));
      }
    } catch {}
  }

  const strings = extractStringsFromPb(pbPath, 4);
  const uuidRx = /^\$([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/;

  let count = 0;
  let i = 0;
  while (i < strings.length) {
    const match = strings[i].match(uuidRx);
    if (!match) { i++; continue; }
    const sessionId = match[1];

    // Find title (next non-metadata string)
    let title = '';
    let firstMsg = '';
    let convUuid = '';
    let j;
    for (j = i + 1; j < strings.length && j < i + 30; j++) {
      const s = strings[j];
      if (s.startsWith('file://') || s.startsWith('http') || s.startsWith('main') ||
          s.startsWith('"$') || s.startsWith('$') || s.length < 4) continue;
      if (s.includes('/') && !s.includes(' ')) continue;
      title = s.replace(/^["'$()\s]+|["'$()\s]+$/g, '').substring(0, 100);
      break;
    }

    // Find conversation UUID and first message deeper in block
    for (let k = i + 1; k < strings.length && k < i + 40; k++) {
      const s = strings[k];
      const cuMatch = s.match(/^\$([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/);
      if (cuMatch) {
        const cu = cuMatch[1];
        if (pbFiles.has(cu)) convUuid = cu;
        else if (!convUuid) convUuid = cu;
        continue;
      }
      if (s.length > 12 && !firstMsg && !s.startsWith('$') && !s.startsWith('"$') &&
          !s.startsWith('file://') && !s.startsWith('http')) {
        firstMsg = s.replace(/^["'$()\s]+|["'$()\s]+$/g, '').substring(0, 300);
      }
    }

    if (isAlreadyTracked(state, 'gemini', sessionId)) { i = j || (i + 1); continue; }

    const hasPb = pbFiles.has(convUuid);
    const summary = firstMsg || 'Session metadata from agyhub_summaries_proto.pb';

    writeSessionFile({
      sessionId,
      agent: 'gemini',
      title: title || 'Gemini Session',
      summary: summary + (hasPb ? '' : ' (no matching .pb conversation file)'),
      source: 'gemini',
      directory: '',
      updatedAt: new Date().toISOString(),
      extraFields: {
        'Conversation UUID': convUuid ? `\`${convUuid}\`` : '',
        'PB File': hasPb ? 'available' : 'not found',
        'Note': hasPb ? 'Full content in .pb (requires Antigravity schema)' : '',
      },
    });
    markTracked(state, 'gemini', sessionId, { title, convUuid });
    count++;

    i = (j && j > i) ? j : (i + 1);
  }

  if (count > 0) log(`Gemini: ${count} new session(s)`);
  return count;
}

/**
 * Hermes Scanner
 * Sources: state.db (sessions + messages tables)
 */
async function scanHermes(state) {
  const db = AGENTS.hermes.sqliteDb;
  if (!fs.existsSync(db)) { log('Hermes: DB not found, skipping'); return 0; }

  const rows = sqliteQuery(db,
    `SELECT id, title, model, started_at, ended_at, message_count, tool_call_count,
            input_tokens, output_tokens, cwd, archived
     FROM sessions ORDER BY started_at DESC`
  );

  let count = 0;
  for (const row of rows) {
    const parts = row.split('|');
    if (parts.length < 4) continue;
    const [id, title, model, startedAt, endedAt, msgCount, toolCount, inTokens, outTokens, cwd, archived] = parts;

    if (isAlreadyTracked(state, 'hermes', id)) continue;

    const firstMsgRow = sqliteQuery(db,
      `SELECT substr(content,1,300) FROM messages WHERE session_id='${id}' AND role='user' ORDER BY rowid LIMIT 1`
    );
    const firstMsg = firstMsgRow[0] || '';

    const startDate = startedAt && startedAt !== '0'
      ? new Date(parseInt(startedAt) * 1000).toISOString()
      : new Date().toISOString();

    writeSessionFile({
      sessionId: id,
      agent: 'hermes',
      title: title || 'Hermes Session',
      summary: (firstMsg || 'Hermes local AI agent session').substring(0, 300),
      source: 'hermes',
      directory: cwd || '',
      updatedAt: startDate,
      extraFields: {
        Model: model || '',
        Messages: msgCount || '',
        'Tool Calls': toolCount || '',
        'Tokens In': inTokens || '',
        'Tokens Out': outTokens || '',
        Archived: archived === '1' ? 'yes' : 'no',
      },
    });
    markTracked(state, 'hermes', id, { title });
    count++;
  }

  if (count > 0) log(`Hermes: ${count} new session(s)`);
  return count;
}

/**
 * Qwen CLI Scanner
 * Sources: chats/*.jsonl
 */
async function scanQwen(state) {
  const dir = AGENTS.qwen.chatsDir;
  if (!fs.existsSync(dir)) { log('Qwen: chats dir not found, skipping'); return 0; }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
  let count = 0;

  for (const file of files) {
    const sessionId = path.basename(file, '.jsonl');
    if (isAlreadyTracked(state, 'qwen', sessionId)) continue;

    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    // Read first line for summary
    let firstMsg = 'Qwen CLI session';
    let title = 'Qwen Session';
    try {
      const firstLine = fs.readFileSync(filePath, 'utf-8').split('\n')[0];
      if (firstLine) {
        const parsed = JSON.parse(firstLine);
        if (parsed.role === 'user' && parsed.content) {
          firstMsg = String(parsed.content).substring(0, 300);
        }
        if (parsed.content && typeof parsed.content === 'string') {
          title = parsed.content.substring(0, 60);
        }
      }
    } catch {}

    writeSessionFile({
      sessionId,
      agent: 'qwen',
      title: title,
      summary: firstMsg,
      source: 'qwen',
      directory: dir,
      updatedAt: stat.mtime.toISOString(),
      extraFields: {
        'File Size': `${(stat.size / 1024).toFixed(1)} KB`,
      },
    });
    markTracked(state, 'qwen', sessionId, { file });
    count++;
  }

  if (count > 0) log(`Qwen: ${count} new session(s)`);
  return count;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const once = args.includes('--once');
  const intervalMinutes = parseInt(
    args.find(a => a.startsWith('--interval-minutes'))?.split('=')[1] ||
    args[args.indexOf('--interval-minutes') + 1] ||
    '10',
    10
  );

  log('=== Agent Sync Daemon Starting ===');
  if (once) log('Mode: one-shot');
  else log(`Mode: daemon (every ${intervalMinutes} minutes)`);

  do {
    const state = loadState();
    bootstrapState(state);
    let total = 0;

    try { total += await scanCodex(state); } catch (e) { log(`Codex error: ${e.message}`); }
    try { total += await scanGemini(state); } catch (e) { log(`Gemini error: ${e.message}`); }
    try { total += await scanHermes(state); } catch (e) { log(`Hermes error: ${e.message}`); }
    try { total += await scanQwen(state); } catch (e) { log(`Qwen error: ${e.message}`); }

    saveState(state);

    const totalFiles = fs.existsSync(CONFIG.vaultDir)
      ? fs.readdirSync(CONFIG.vaultDir).filter(f => f.endsWith('.md')).length
      : 0;

    if (total > 0) {
      log(`Total new: ${total} session(s). Vault now has ${totalFiles} files.`);
    } else {
      log(`No new sessions. Vault: ${totalFiles} files.`);
    }

    if (once) break;

    log(`Sleeping ${intervalMinutes} minutes...`);
    await new Promise(r => setTimeout(r, intervalMinutes * 60 * 1000));
  } while (true);
}

main().catch(e => {
  log(`Fatal error: ${e.message}`);
  process.exit(1);
});
