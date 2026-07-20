import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DEFAULT_VAULT_ROOT = "D:\\Projects\\Zed";
const DEFAULT_PROJECT_SLUG = "gravityclaw";
const DEFAULT_PROJECT_NAME = "GravityClaw";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "session";
}

function truncate(value, maxLength = 120) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function isoDateParts(date) {
  const iso = date.toISOString();
  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 16),
    timestamp: iso,
  };
}

function getDbPath(workspaceRoot, explicitDbPath) {
  if (explicitDbPath) {
    return explicitDbPath;
  }
  return path.join(workspaceRoot, "data", "gravity.db");
}

function getLatestSession(dbPath) {
  if (!fs.existsSync(dbPath)) {
    return null;
  }

  const db = new Database(dbPath, { readonly: true });

  try {
    const latest = db.prepare(`
      SELECT session_id, MAX(timestamp) AS last_timestamp, COUNT(*) AS message_count
      FROM memory
      GROUP BY session_id
      ORDER BY last_timestamp DESC, session_id DESC
      LIMIT 1
    `).get();

    if (!latest?.session_id) {
      return null;
    }

    const rows = db.prepare(`
      SELECT timestamp, message_json
      FROM memory
      WHERE session_id = ?
      ORDER BY timestamp ASC, id ASC
    `).all(latest.session_id);

    const messages = rows.map((row) => {
      let parsed;
      try {
        parsed = JSON.parse(row.message_json);
      } catch {
        parsed = { role: "unknown", content: row.message_json };
      }

      return {
        timestamp: row.timestamp,
        role: parsed?.role ?? "unknown",
        content: typeof parsed?.content === "string" ? parsed.content : JSON.stringify(parsed?.content ?? ""),
      };
    });

    return {
      sessionId: latest.session_id,
      lastTimestamp: latest.last_timestamp,
      messageCount: latest.message_count,
      messages,
    };
  } finally {
    db.close();
  }
}

function buildSummary(session) {
  const firstUser = session.messages.find((message) => message.role === "user" && message.content.trim().length > 0);
  const lastAssistant = [...session.messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.content.trim().length > 0);

  if (lastAssistant) {
    return truncate(lastAssistant.content, 140);
  }

  if (firstUser) {
    return truncate(firstUser.content, 140);
  }

  return `Session ${session.sessionId} with ${session.messageCount} messages`;
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

function appendDailyEntry(dailyNotePath, entry, archiveLink) {
  const content = fs.readFileSync(dailyNotePath, "utf8");
  if (content.includes(archiveLink)) {
    return false;
  }

  const sessionsHeader = "## Sessions Today";
  if (!content.includes(sessionsHeader)) {
    fs.appendFileSync(dailyNotePath, `\n${sessionsHeader}\n\n${entry}\n`, "utf8");
    return true;
  }

  const updated = content.replace(sessionsHeader, `${sessionsHeader}\n${entry}`);
  fs.writeFileSync(dailyNotePath, updated, "utf8");
  return true;
}

function writeArchive(archivePath, session, summary, timestamp, projectName) {
  if (fs.existsSync(archivePath)) {
    return false;
  }

  const transcript = session.messages
    .map((message) => `## ${message.role} (${message.timestamp})\n\n${message.content || "[empty]"}`)
    .join("\n\n");

  const archive = [
    "---",
    `project: "${projectName}"`,
    `session_id: "${session.sessionId}"`,
    `synced_at: "${timestamp}"`,
    `message_count: ${session.messageCount}`,
    "---",
    "",
    `# ${summary}`,
    "",
    `- Project: ${projectName}`,
    `- Session ID: \`${session.sessionId}\``,
    `- Synced: ${timestamp}`,
    `- Messages: ${session.messageCount}`,
    "",
    "## Transcript",
    "",
    transcript,
    "",
  ].join("\n");

  fs.writeFileSync(archivePath, archive, "utf8");
  return true;
}

function updateVaultContext(vaultContextPath, dateLabel, projectName) {
  if (!fs.existsSync(vaultContextPath)) {
    return false;
  }

  const content = fs.readFileSync(vaultContextPath, "utf8");
  const updated = content.replace(
    /^> Last sync:.*$/m,
    `> Last sync: ${dateLabel} (${projectName} session sync)`
  );

  if (updated === content) {
    return false;
  }

  fs.writeFileSync(vaultContextPath, updated, "utf8");
  return true;
}

export function syncLatestSessionToVault(options = {}) {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const vaultRoot = options.vaultRoot ?? process.env.ZED_VAULT_ROOT ?? DEFAULT_VAULT_ROOT;
  const projectSlug = options.projectSlug ?? DEFAULT_PROJECT_SLUG;
  const projectName = options.projectName ?? DEFAULT_PROJECT_NAME;
  const now = options.now ? new Date(options.now) : new Date();
  const dbPath = getDbPath(workspaceRoot, options.dbPath);

  const session = getLatestSession(dbPath);
  if (!session) {
    return { success: false, reason: "no-session", dbPath };
  }

  const parts = isoDateParts(now);
  const summary = buildSummary(session);
  const archiveSlug = `${projectSlug}-${slugify(session.sessionId)}`;

  const dailyDir = path.join(vaultRoot, "1-Daily");
  const archiveDir = path.join(vaultRoot, "9-Decisions", "sessions");
  const dailyNotePath = path.join(dailyDir, `${parts.date}.md`);
  const archivePath = path.join(archiveDir, `${archiveSlug}.md`);
  const vaultContextPath = path.join(vaultRoot, "vault-context.md");
  const archiveLink = `[[9-Decisions/sessions/${archiveSlug}]]`;
  const dailyEntry = `- ${parts.time} ${archiveLink} - ${summary}`;

  try {
    ensureDir(dailyDir);
    ensureDir(archiveDir);
    ensureDailyNote(dailyNotePath, parts.date);

    const archiveCreated = writeArchive(archivePath, session, summary, parts.timestamp, projectName);
    const dailyUpdated = appendDailyEntry(dailyNotePath, dailyEntry, archiveLink);
    const contextUpdated = updateVaultContext(vaultContextPath, parts.date, projectName);

    return {
      success: true,
      dbPath,
      sessionId: session.sessionId,
      archivePath,
      dailyNotePath,
      archiveCreated,
      dailyUpdated,
      contextUpdated,
      summary,
    };
  } catch (error) {
    return {
      success: false,
      reason: "write-failed",
      dbPath,
      sessionId: session.sessionId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
