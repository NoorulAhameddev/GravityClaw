import fs from "node:fs";
import path from "node:path";

const DEFAULT_VAULT_ROOT = "D:\\Projects\\Zed";
const DEFAULT_WORKSPACE_ROOT = path.resolve(process.cwd(), "..");
const SHARED_DIR_NAME = ".ai_memory";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureTextFile(filePath, content) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content, "utf8");
  }
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

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function detectActiveAgent() {
  const envName = process.env.AI_AGENT_NAME;
  if (envName) return envName;

  const args = process.argv.join(" ");
  if (args.includes("opencode")) return "OpenCode";
  if (args.includes("codex")) return "Codex";
  if (args.includes("claude")) return "Claude / Anti-Gravity IDE";
  if (process.env.COPILOT_ENABLED || process.env.GITHUB_COPILOT) return "GitHub Copilot";
  if (process.env.CODEX_API_KEY) return "Codex";

  return "unknown";
}

function parseTimestampFromMarkdown(mdContent) {
  const match = mdContent.match(/Last Updated:\s*(\S+)/);
  return match ? match[1] : null;
}

function parseMarkdownSessionState(mdContent) {
  const activeAgent = mdContent.match(/Active Agent:\s*(.+)/)?.[1]?.trim() ?? null;
  const project = mdContent.match(/-\s*Project:\s*(.+)/)?.[1]?.trim() ?? null;
  const objective = mdContent.match(/-\s*Objective:\s*(.+)/)?.[1]?.trim() ?? null;
  const blockers = mdContent.match(/-\s*Blockers:\s*(.+)/)?.[1]?.trim() ?? null;
  const nextAction = mdContent.match(/-\s*Next Recommended Action:\s*(.+)/)?.[1]?.trim() ?? null;

  const projects = {};
  const projectSection = mdContent.split("## Project States")[1];
  if (projectSection) {
    const slugMatch = projectSection.matchAll(/### (.+?)\n/g);
    for (const match of slugMatch) {
      const slug = match[1].trim();
      const status = projectSection.match(new RegExp(`- Status:\\s*(.+?)\\n`))?.[1]?.trim();
      const priority = projectSection.match(new RegExp(`- Priority:\\s*(.+?)\\n`))?.[1]?.trim();
      const focus = projectSection.match(new RegExp(`- Current focus:\\s*(.+?)\\n`))?.[1]?.trim();
      const next = projectSection.match(new RegExp(`- Next action:\\s*(.+?)\\n`))?.[1]?.trim();
      const block = projectSection.match(new RegExp(`- Blockers:\\s*(.+?)\\n`))?.[1]?.trim();
      if (slug) {
        projects[slug] = {
          status: status ?? "unknown",
          priority: priority ?? "unknown",
          currentFocus: focus ?? "unspecified",
          nextAction: next ?? "unspecified",
          blockers: block && block !== "none" ? [block] : [],
        };
      }
    }
  }

  return { activeAgent, project, objective, blockers, nextAction, projects };
}

function isoNow(now) {
  return (now instanceof Date ? now : new Date(now ?? Date.now())).toISOString();
}

function getPaths(options = {}) {
  const workspaceRoot = options.workspaceRoot ?? DEFAULT_WORKSPACE_ROOT;
  const sharedRoot = options.sharedRoot ?? path.join(workspaceRoot, SHARED_DIR_NAME);
  const vaultRoot = options.vaultRoot ?? process.env.ZED_VAULT_ROOT ?? DEFAULT_VAULT_ROOT;

  return {
    workspaceRoot,
    sharedRoot,
    vaultRoot,
    registryPath: path.join(sharedRoot, "registry.json"),
    sessionStatePath: path.join(sharedRoot, "session-state.json"),
    handoffsPath: path.join(sharedRoot, "handoffs.jsonl"),
    decisionsPath: path.join(sharedRoot, "decisions.jsonl"),
    projectsDir: path.join(sharedRoot, "projects"),
    logsDir: path.join(sharedRoot, "logs"),
    gravityProjectPath: path.join(sharedRoot, "projects", "gravityclaw.json"),
    aegisProjectPath: path.join(sharedRoot, "projects", "aegis-ai.json"),
    readmePath: path.join(sharedRoot, "README.md"),
    vaultSessionStatePath: path.join(vaultRoot, "0-Inbox", "session-state.md"),
    vaultHealthPath: path.join(vaultRoot, "9-Auto", "shared-memory-health.json"),
  };
}

function buildRegistry(paths, timestamp) {
  return {
    schemaVersion: 1,
    updatedAt: timestamp,
    canonicalLongTermMemory: {
      type: "obsidian-vault",
      vaultRoot: paths.vaultRoot,
      bootstrapFiles: [
        "vault-context.md",
        "0-Inbox/session-state.md",
      ],
      projectFiles: [
        "2-Projects/gravityclaw.md",
        "2-Projects/aegis-ai.md",
      ],
    },
    sharedOperationalMemory: {
      root: paths.sharedRoot,
      startupReads: [
        "registry.json",
        "session-state.json",
        "handoffs.jsonl:last=10",
      ],
      requiredWrites: [
        "session-state.json",
        "handoffs.jsonl",
        "decisions.jsonl",
      ],
    },
    agents: [
      {
        name: "Codex",
        protocol: "Read Obsidian bootstrap, then .ai_memory registry and session state, then latest handoffs.",
      },
      {
        name: "OpenCode",
        protocol: "Read Obsidian bootstrap, then .ai_memory registry and session state, then latest handoffs.",
      },
      {
        name: "Claude / Anti-Gravity IDE",
        protocol: "Read Obsidian bootstrap, then .ai_memory registry and session state, then latest handoffs.",
      },
      {
        name: "GitHub Copilot",
        protocol: "Read Obsidian bootstrap, then .ai_memory registry and session state, then latest handoffs.",
      },
    ],
    writeProtocol: {
      duringSession: [
        "Update session-state.json after meaningful progress.",
        "Append durable decisions to decisions.jsonl.",
      ],
      endOfSession: [
        "Append one compact handoff entry to handoffs.jsonl.",
        "Mirror session-state.json into Obsidian 0-Inbox/session-state.md.",
      ],
    },
  };
}

function buildSessionState(timestamp, paths) {
  return {
    schemaVersion: 1,
    updatedAt: timestamp,
    activeAgent: detectActiveAgent(),
    workspaceRoot: paths.workspaceRoot,
    sharedMemoryRoot: paths.sharedRoot,
    projects: {
      gravityclaw: {
        status: "active",
        priority: "high",
        currentFocus: "Shared AI memory contract and Obsidian integration",
        nextAction: "Read latest handoffs before making code changes.",
        blockers: [],
      },
      "aegis-ai": {
        status: "active",
        priority: "high",
        currentFocus: "Awaiting active handoff for this session.",
        nextAction: "Use project-specific context when work shifts into Aegis AI.",
        blockers: [],
      },
    },
    currentWork: {
      project: "shared",
      objective: "Keep all four AI agents synchronized through Obsidian plus repo-local operational memory.",
      filesTouched: [],
      decisionsMade: [],
      blockers: [],
      nextRecommendedAction: "Read registry.json and the latest handoffs before continuing.",
    },
    sources: {
      obsidianVault: paths.vaultRoot,
      sessionStateMirror: "0-Inbox/session-state.md",
      durableProjects: [
        "2-Projects/gravityclaw.md",
        "2-Projects/aegis-ai.md",
      ],
    },
  };
}

function buildProjectState(project, timestamp) {
  if (project === "gravityclaw") {
    return {
      schemaVersion: 1,
      updatedAt: timestamp,
      project: "gravityclaw",
      title: "GravityClaw",
      status: "active",
      memoryRole: "Owns the shared-memory automation and vault sync implementation.",
      startupChecklist: [
        "Read 2-Projects/gravityclaw.md",
        "Read .ai_memory/session-state.json",
        "Read recent handoffs from .ai_memory/handoffs.jsonl",
      ],
      keyPaths: [
        "GravityClaw/scripts/shared-memory-lib.js",
        "GravityClaw/scripts/shared-memory-daemon.js",
        "GravityClaw/scripts/agent-sync-lib.js",
      ],
    };
  }

  return {
    schemaVersion: 1,
    updatedAt: timestamp,
    project: "aegis-ai",
    title: "Aegis AI",
    status: "active",
    memoryRole: "Consumes shared agent context and project-specific handoffs.",
    startupChecklist: [
      "Read 2-Projects/aegis-ai.md",
      "Read .ai_memory/session-state.json",
      "Read recent handoffs from .ai_memory/handoffs.jsonl",
    ],
    keyPaths: [
      "Aegis-Ai/apps/web/src/ai/memory/memory.ts",
      "Aegis-Ai/apps/web/src/services/ai/memory-extractor.ts",
    ],
  };
}

function buildReadme() {
  return [
    "# Shared AI Memory",
    "",
    "This folder is the machine-readable contract shared by Codex, OpenCode, Claude-family tools, and GitHub Copilot sessions.",
    "",
    "## Read Order",
    "",
    "1. `registry.json`",
    "2. `session-state.json`",
    "3. Last 10 lines of `handoffs.jsonl`",
    "4. Relevant file in `projects/`",
    "",
    "## Write Order",
    "",
    "1. Update `session-state.json` during meaningful progress",
    "2. Append durable decisions to `decisions.jsonl`",
    "3. Append one handoff entry to `handoffs.jsonl` at session end",
    "",
    "Obsidian remains the canonical long-term memory. This folder is the shared operational layer.",
    "",
  ].join("\n");
}

function buildSessionStateMarkdown(state) {
  const currentWork = state.currentWork ?? {};
  const projectStates = state.projects ?? {};
  const projectLines = Object.entries(projectStates).map(([slug, project]) => {
    const blockers = Array.isArray(project.blockers) && project.blockers.length > 0
      ? project.blockers.join("; ")
      : "none";
    return [
      `### ${slug}`,
      `- Status: ${project.status ?? "unknown"}`,
      `- Priority: ${project.priority ?? "unknown"}`,
      `- Current focus: ${project.currentFocus ?? "unspecified"}`,
      `- Next action: ${project.nextAction ?? "unspecified"}`,
      `- Blockers: ${blockers}`,
      "",
    ].join("\n");
  });

  return [
    "# Session State",
    "",
    `Last Updated: ${state.updatedAt ?? "unknown"}`,
    `Active Agent: ${state.activeAgent ?? "unknown"}`,
    `Workspace: ${state.workspaceRoot ?? "unknown"}`,
    "",
    "## Current Work",
    "",
    `- Project: ${currentWork.project ?? "unknown"}`,
    `- Objective: ${currentWork.objective ?? "unspecified"}`,
    `- Files Touched: ${(currentWork.filesTouched ?? []).join(", ") || "none"}`,
    `- Decisions: ${(currentWork.decisionsMade ?? []).join("; ") || "none"}`,
    `- Blockers: ${(currentWork.blockers ?? []).join("; ") || "none"}`,
    `- Next Recommended Action: ${currentWork.nextRecommendedAction ?? "unspecified"}`,
    "",
    "## Project States",
    "",
    ...projectLines,
  ].join("\n");
}

function countJsonlLines(filePath) {
  if (!fs.existsSync(filePath)) {
    return 0;
  }
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean).length;
}

function rotateJsonlIfNeeded(filePath, vaultRoot, archiveName, maxLines) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length > maxLines) {
    const archivePath = path.join(vaultRoot, "9-Auto", archiveName);
    ensureDir(path.dirname(archivePath));
    fs.appendFileSync(archivePath, lines.join("\n") + "\n", "utf8");
    fs.writeFileSync(filePath, "", "utf8");
  }
}

export function bootstrapSharedMemory(options = {}) {
  const timestamp = isoNow(options.now);
  const paths = getPaths(options);

  ensureDir(paths.sharedRoot);
  ensureDir(paths.projectsDir);
  ensureDir(paths.logsDir);

  const registry = buildRegistry(paths, timestamp);
  let sessionState = readJson(paths.sessionStatePath, null);

  if (sessionState) {
    sessionState.updatedAt = timestamp;
    sessionState.activeAgent = detectActiveAgent();
    sessionState.workspaceRoot = paths.workspaceRoot;
    sessionState.sharedMemoryRoot = paths.sharedRoot;
  } else {
    sessionState = buildSessionState(timestamp, paths);
  }

  writeJson(paths.registryPath, registry);
  writeJson(paths.sessionStatePath, sessionState);
  writeJson(paths.gravityProjectPath, buildProjectState("gravityclaw", timestamp));
  writeJson(paths.aegisProjectPath, buildProjectState("aegis-ai", timestamp));
  ensureTextFile(paths.handoffsPath, "");
  ensureTextFile(paths.decisionsPath, "");
  ensureTextFile(paths.readmePath, buildReadme());

  return {
    success: true,
    paths,
    registryPath: paths.registryPath,
    sessionStatePath: paths.sessionStatePath,
  };
}

export function syncSharedMemoryToVault(options = {}) {
  const timestamp = isoNow(options.now);
  const paths = getPaths(options);
  let state = readJson(paths.sessionStatePath, null);

  if (!state) {
    return {
      success: false,
      reason: "missing-session-state",
      paths,
    };
  }

  try {
    ensureDir(path.dirname(paths.vaultSessionStatePath));
    ensureDir(path.dirname(paths.vaultHealthPath));

    // Rotate JSONL files to prevent Copilot context bloat
    rotateJsonlIfNeeded(paths.handoffsPath, paths.vaultRoot, "handoffs-archive.jsonl", 50);
    rotateJsonlIfNeeded(paths.decisionsPath, paths.vaultRoot, "decisions-archive.jsonl", 50);

    const vaultMd = String(state.updatedAt ?? "");

    if (fs.existsSync(paths.vaultSessionStatePath)) {
      const vaultContent = fs.readFileSync(paths.vaultSessionStatePath, "utf8");
      const vaultTimestamp = parseTimestampFromMarkdown(vaultContent);

      if (vaultTimestamp && vaultTimestamp > vaultMd) {
        const parsed = parseMarkdownSessionState(vaultContent);
        if (parsed.activeAgent) state.activeAgent = parsed.activeAgent;
        if (parsed.project) state.currentWork.project = parsed.project;
        if (parsed.objective) state.currentWork.objective = parsed.objective;
        if (parsed.nextAction) state.currentWork.nextRecommendedAction = parsed.nextAction;
        if (parsed.blockers && parsed.blockers !== "none") {
          state.currentWork.blockers = parsed.blockers.split("; ").filter(Boolean);
        }
        if (parsed.projects && Object.keys(parsed.projects).length > 0) {
          for (const [slug, ps] of Object.entries(parsed.projects)) {
            if (state.projects[slug]) {
              if (ps.currentFocus !== "unspecified") state.projects[slug].currentFocus = ps.currentFocus;
              if (ps.nextAction !== "unspecified") state.projects[slug].nextAction = ps.nextAction;
              if (ps.blockers.length > 0) state.projects[slug].blockers = ps.blockers;
            }
          }
        }
        state.updatedAt = timestamp;
        writeJson(paths.sessionStatePath, state);
      }
    }

    fs.writeFileSync(paths.vaultSessionStatePath, buildSessionStateMarkdown(state), "utf8");
    writeJson(paths.vaultHealthPath, {
      schemaVersion: 1,
      updatedAt: timestamp,
      sharedRoot: paths.sharedRoot,
      sessionStatePath: paths.sessionStatePath,
      handoffCount: countJsonlLines(paths.handoffsPath),
      decisionCount: countJsonlLines(paths.decisionsPath),
      vaultMirrorPresent: fs.existsSync(paths.vaultSessionStatePath),
    });

    return {
      success: true,
      paths,
      sessionStateMirrorPath: paths.vaultSessionStatePath,
      healthPath: paths.vaultHealthPath,
      syncedFrom: fs.existsSync(paths.vaultSessionStatePath) ? "bidirectional" : "write-only",
    };
  } catch (error) {
    return {
      success: false,
      reason: "write-failed",
      error: error instanceof Error ? error.message : String(error),
      paths,
    };
  }
}
