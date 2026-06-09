import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { syncLatestSessionToVault } from "./hooks/vault-sync.js";

const DEFAULT_VAULT_ROOT = "C:\\Users\\Noorul_Ahamed\\OneDrive\\Documents\\Zed";
const DEFAULT_OPENCODE_DB = "C:\\Users\\Noorul_Ahamed\\.local\\share\\opencode\\opencode.db";
const DEFAULT_CLAUDE_PROJECTS = "C:\\Users\\Noorul_Ahamed\\.claude\\projects";
const DEFAULT_CODEX_ROOT = "C:\\Users\\Noorul_Ahamed\\.codex";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function slugify(value) {
  return String(value ?? "session")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "session";
}

function truncate(value, maxLength = 140) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function collectFiles(rootDir, predicate, result = []) {
  if (!fs.existsSync(rootDir)) {
    return result;
  }

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, predicate, result);
      continue;
    }
    if (predicate(fullPath)) {
      result.push(fullPath);
    }
  }

  return result;
}

function normalizeTextContent(content) {
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }
        if (entry?.type === "text" && typeof entry.text === "string") {
          return entry.text;
        }
        if (typeof entry?.content === "string") {
          return entry.content;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

function formatDailyEntry(parts, archiveName, title, source) {
  return `- ${parts.time} [[9-Decisions/sessions/${archiveName.replace(/\.md$/i, "")}]] - [${source}] ${truncate(title, 140)}`;
}

function isoDateParts(date) {
  const iso = date.toISOString();
  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 16),
    timestamp: iso,
  };
}

function ensureDailyNote(dailyNotePath, dateLabel) {
  if (fs.existsSync(dailyNotePath)) {
    return;
  }

  const template = [
    `# ${dateLabel}`,
    "",
    "## Rapid Log",
    "",
    "## Sessions Today",
    "",
    "## Tasks Completed",
    "",
    "## Tasks Created",
    "",
    "## Decisions",
    "",
  ].join("\n");

  fs.writeFileSync(dailyNotePath, template, "utf8");
}

function appendDailyEntry(dailyNotePath, entry, linkTarget) {
  const content = fs.readFileSync(dailyNotePath, "utf8");
  if (content.includes(linkTarget)) {
    return false;
  }

  const header = "## Sessions Today";
  if (!content.includes(header)) {
    fs.appendFileSync(dailyNotePath, `\n${header}\n${entry}\n`, "utf8");
    return true;
  }

  fs.writeFileSync(dailyNotePath, content.replace(header, `${header}\n${entry}`), "utf8");
  return true;
}

function upsertVaultContext(vaultContextPath, latestEvent) {
  if (!fs.existsSync(vaultContextPath) || !latestEvent) {
    return false;
  }

  const content = fs.readFileSync(vaultContextPath, "utf8");
  const replacement = `> Last sync: ${latestEvent.importedDate} (${latestEvent.source} session sync)`;
  const updated = content.replace(/^> Last sync:.*$/m, replacement);

  if (updated === content) {
    return false;
  }

  fs.writeFileSync(vaultContextPath, updated, "utf8");
  return true;
}

function createArchiveIfMissing(archivePath, content) {
  if (fs.existsSync(archivePath)) {
    return false;
  }
  fs.writeFileSync(archivePath, content, "utf8");
  return true;
}

function loadState(statePath) {
  return readJson(statePath, {
    version: 1,
    lastSyncAt: null,
    latestEvent: null,
    records: [],
  });
}

function saveState(statePath, state) {
  writeJson(statePath, state);
}

function recordExists(state, sourceId, contentSha256) {
  return state.records.some((record) => record.sourceId === sourceId && record.contentSha256 === contentSha256);
}

function addRecord(state, record) {
  state.records.push(record);
  state.latestEvent = {
    source: record.source,
    sourceId: record.sourceId,
    title: record.title,
    archiveName: record.archiveName,
    importedAt: record.importedAt,
    importedDate: record.importedAt.slice(0, 10),
    updatedAt: record.updatedAt,
  };
}

function buildOpenCodeArchive(session) {
  return [
    "---",
    'source: "opencode"',
    `session_id: "${session.id}"`,
    `slug: "${session.slug}"`,
    `directory: "${session.directory}"`,
    `updated_at: "${session.updatedAt}"`,
    "---",
    "",
    `# ${session.title}`,
    "",
    "- Agent: OpenCode",
    `- Session ID: \`${session.id}\``,
    `- Directory: \`${session.directory}\``,
    `- Updated: ${session.updatedAt}`,
    `- Messages: ${session.messageCount}`,
    `- Parts: ${session.partCount}`,
    `- Files Changed: ${session.summaryFiles}`,
    `- Lines Added: ${session.summaryAdditions}`,
    `- Lines Deleted: ${session.summaryDeletions}`,
    "",
    "## Notes",
    "",
    "Imported from the local OpenCode SQLite session store.",
    "",
  ].join("\n");
}

function collectOpenCodeSessions(dbPath) {
  if (!fs.existsSync(dbPath)) {
    return [];
  }

  const db = new Database(dbPath, { readonly: true });
  try {
    const sessions = db.prepare(`
      SELECT id, title, slug, directory, version, time_created, time_updated,
             summary_additions, summary_deletions, summary_files, summary_diffs
      FROM session
      ORDER BY time_updated ASC
    `).all();

    const messageCounts = new Map(
      db.prepare("SELECT session_id, COUNT(*) AS count FROM message GROUP BY session_id")
        .all()
        .map((row) => [row.session_id, row.count])
    );

    const partCounts = new Map(
      db.prepare(`
        SELECT m.session_id, COUNT(*) AS count
        FROM part p
        JOIN message m ON m.id = p.message_id
        GROUP BY m.session_id
      `).all().map((row) => [row.session_id, row.count])
    );

    return sessions.map((session) => {
      const normalized = JSON.stringify(session);
      return {
        source: "opencode",
        sourceId: `opencode:${session.id}`,
        title: session.title || "Untitled OpenCode Session",
        updatedAt: new Date(session.time_updated).toISOString(),
        contentSha256: sha256(normalized),
        archiveName: `opencode-${slugify(session.id)}.md`,
        content: buildOpenCodeArchive({
          id: session.id,
          slug: session.slug || "",
          directory: session.directory || "unknown",
          title: session.title || "Untitled OpenCode Session",
          updatedAt: new Date(session.time_updated).toISOString(),
          messageCount: messageCounts.get(session.id) || 0,
          partCount: partCounts.get(session.id) || 0,
          summaryFiles: session.summary_files ?? "N/A",
          summaryAdditions: session.summary_additions ?? "N/A",
          summaryDeletions: session.summary_deletions ?? "N/A",
        }),
      };
    });
  } finally {
    db.close();
  }
}

function buildClaudeArchive(entry) {
  const transcript = entry.messages
    .map((message) => `## ${message.role} (${message.timestamp})\n\n${message.content || "[empty]"}`)
    .join("\n\n");

  return [
    "---",
    'source: "claude"',
    `session_id: "${entry.sessionId}"`,
    `source_path: "${entry.sourcePath}"`,
    `updated_at: "${entry.updatedAt}"`,
    "---",
    "",
    `# ${entry.title}`,
    "",
    "- Agent: Claude-family / JSONL",
    `- Session ID: \`${entry.sessionId}\``,
    `- Updated: ${entry.updatedAt}`,
    `- Source Path: \`${entry.sourcePath}\``,
    "",
    "## Transcript",
    "",
    transcript,
    "",
  ].join("\n");
}

function collectClaudeSessions(projectsRoot) {
  const files = collectFiles(projectsRoot, (fullPath) => fullPath.endsWith(".jsonl"));
  const sessions = [];

  for (const filePath of files) {
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) {
      continue;
    }

    const lines = raw.split(/\r?\n/);
    const parsed = [];
    for (const line of lines) {
      try {
        parsed.push(JSON.parse(line));
      } catch {
        // Skip malformed lines
      }
    }

    if (parsed.length === 0) {
      continue;
    }

    const sessionId = parsed.find((entry) => entry.sessionId)?.sessionId
      ?? parsed.find((entry) => entry.message?.role)?.uuid
      ?? path.basename(filePath, ".jsonl");
    const fileSlug = path.basename(filePath, ".jsonl");

    const cwd = parsed.find((entry) => typeof entry.cwd === "string")?.cwd ?? "unknown";
    const messages = parsed
      .filter((entry) => entry.message?.role)
      .map((entry) => ({
        role: entry.message.role,
        timestamp: entry.timestamp ?? "unknown",
        content: normalizeTextContent(entry.message.content),
      }))
      .filter((message) => message.content.length > 0);

    const updatedAt = parsed
      .map((entry) => entry.timestamp)
      .filter(Boolean)
      .sort()
      .at(-1) ?? new Date(fs.statSync(filePath).mtimeMs).toISOString();

    const title = messages.find((message) => message.role === "user")?.content
      ?? path.basename(filePath, ".jsonl");

    const contentSha256 = sha256(raw);
    sessions.push({
      source: "claude",
      sourceId: `claude:${filePath}`,
      title,
      updatedAt,
      contentSha256,
      archiveName: `claude-${slugify(fileSlug)}.md`,
      content: buildClaudeArchive({
        sessionId,
        sourcePath: filePath,
        updatedAt,
        title,
        messages,
      }),
    });
  }

  return sessions.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}

function buildCodexArchive(entry) {
  return [
    "---",
    'source: "codex"',
    `thread_id: "${entry.id}"`,
    `updated_at: "${entry.updatedAt}"`,
    "---",
    "",
    `# ${entry.title}`,
    "",
    "- Agent: Codex",
    `- Thread ID: \`${entry.id}\``,
    `- Updated: ${entry.updatedAt}`,
    "",
    "## Notes",
    "",
    "Imported from Codex session metadata.",
    "",
  ].join("\n");
}

function collectCodexSessions(codexRoot) {
  const sessionIndexPath = path.join(codexRoot, "session_index.jsonl");
  if (!fs.existsSync(sessionIndexPath)) {
    return [];
  }

  const lines = fs.readFileSync(sessionIndexPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean);

  return lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .map((entry) => {
      const normalized = JSON.stringify(entry);
      return {
        source: "codex",
        sourceId: `codex:${entry.id}`,
        title: entry.thread_name || "Untitled Codex Thread",
        updatedAt: entry.updated_at || "unknown",
        contentSha256: sha256(normalized),
        archiveName: `codex-${slugify(entry.id)}.md`,
        content: buildCodexArchive({
          id: entry.id,
          title: entry.thread_name || "Untitled Codex Thread",
          updatedAt: entry.updated_at || "unknown",
        }),
      };
    })
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}

function importRecordsToVault(records, options) {
  const vaultRoot = options.vaultRoot ?? DEFAULT_VAULT_ROOT;
  const now = options.now ? new Date(options.now) : new Date();
  const parts = isoDateParts(now);
  const archiveDir = path.join(vaultRoot, "9-Decisions", "sessions");
  const autoDir = path.join(vaultRoot, "9-Auto");
  const dailyDir = path.join(vaultRoot, "1-Daily");
  const statePath = path.join(autoDir, "agent-sync-state.json");
  const healthPath = path.join(autoDir, "agent-sync-health.json");
  const vaultContextPath = path.join(vaultRoot, "vault-context.md");

  try {
    ensureDir(archiveDir);
    ensureDir(autoDir);
    ensureDir(dailyDir);

    const state = loadState(statePath);
    const dailyNotePath = path.join(dailyDir, `${parts.date}.md`);
    ensureDailyNote(dailyNotePath, parts.date);

    const imported = [];
    for (const record of records) {
      if (recordExists(state, record.sourceId, record.contentSha256)) {
        continue;
      }

      const archivePath = path.join(archiveDir, record.archiveName);
      createArchiveIfMissing(archivePath, record.content);

      const importedAt = parts.timestamp;
      const linkTarget = `[[9-Decisions/sessions/${record.archiveName.replace(/\.md$/i, "")}]]`;
      appendDailyEntry(
        dailyNotePath,
        formatDailyEntry(parts, record.archiveName, record.title, record.source),
        linkTarget
      );

      const stateRecord = {
        source: record.source,
        sourceId: record.sourceId,
        title: record.title,
        archiveName: record.archiveName,
        contentSha256: record.contentSha256,
        updatedAt: record.updatedAt,
        importedAt,
      };

      addRecord(state, stateRecord);
      imported.push(stateRecord);
    }

    state.lastSyncAt = parts.timestamp;
    saveState(statePath, state);
    upsertVaultContext(vaultContextPath, state.latestEvent);

    const health = {
      lastSyncAt: state.lastSyncAt,
      latestEvent: state.latestEvent,
      importedCount: imported.length,
      totalRecords: state.records.length,
      sources: {
        opencode: records.filter((record) => record.source === "opencode").length,
        claude: records.filter((record) => record.source === "claude").length,
        codex: records.filter((record) => record.source === "codex").length,
      },
    };
    writeJson(healthPath, health);

    return {
      success: true,
      importedCount: imported.length,
      latestEvent: state.latestEvent,
      statePath,
      healthPath,
      imported,
    };
  } catch (error) {
    return {
      success: false,
      importedCount: 0,
      latestEvent: null,
      statePath,
      healthPath,
      imported: [],
      reason: "write-failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function syncAgentSourcesToVault(options = {}) {
  const openCodeDbPath = options.openCode?.dbPath ?? DEFAULT_OPENCODE_DB;
  const claudeProjectsRoot = options.claude?.projectsRoot ?? DEFAULT_CLAUDE_PROJECTS;
  const codexRoot = options.codex?.root ?? DEFAULT_CODEX_ROOT;

  const records = [
    ...collectOpenCodeSessions(openCodeDbPath),
    ...collectClaudeSessions(claudeProjectsRoot),
    ...collectCodexSessions(codexRoot),
  ].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

  return importRecordsToVault(records, options);
}

export function syncEverythingToVault(options = {}) {
  const gravityResult = syncLatestSessionToVault(options.gravityClaw ?? {});
  const agentResult = syncAgentSourcesToVault({
    vaultRoot: options.vaultRoot,
    openCode: options.openCode,
    claude: options.claude,
    codex: options.codex,
    now: options.now,
  });

  return {
    success: gravityResult.success || agentResult.success,
    gravityResult,
    agentResult,
    latestEvent: agentResult.latestEvent ?? null,
  };
}
