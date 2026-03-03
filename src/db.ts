import Database from "better-sqlite3";
import { createLogger } from "./logger.ts";
import path from "path";
import { fileURLToPath } from "url";

const log = createLogger("db");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "../gravity.db");

log.info(`Connecting to SQLite DB at ${dbPath}`);
export const db = new Database(dbPath);

// Enable WAL mode for better concurrency performance
db.pragma("journal_mode = WAL");

// Initialize memory table
db.exec(`
    CREATE TABLE IF NOT EXISTS memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        message_json TEXT NOT NULL,
        settings TEXT DEFAULT '{}' -- JSON column for per-session settings (model, provider, etc.)
    );
    CREATE INDEX IF NOT EXISTS idx_session_id ON memory(session_id);
`);

// Migrate existing rows to add settings column if not exists
try {
    db.exec(`ALTER TABLE memory ADD COLUMN settings TEXT DEFAULT '{}'`);
    log.info("Added settings column to memory table");
} catch (err) {
    // Column already exists, ignore
}

// Initialize agent swarms table for tracking multi-agent orchestration
db.exec(`
    CREATE TABLE IF NOT EXISTS agent_swarms (
        id TEXT PRIMARY KEY,
        parent_session TEXT NOT NULL,
        child_session TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'spawned',
        created_at TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_parent_session ON agent_swarms(parent_session);
    CREATE INDEX IF NOT EXISTS idx_child_session ON agent_swarms(child_session);
`);

// Initialize workflows table for mesh workflow execution tracking
db.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        goal TEXT NOT NULL,
        tasks_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        progress REAL NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL,
        completed_at TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_session ON workflows(session_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_status ON workflows(status);
`);

// Initialize workflow_tasks table for individual task execution tracking
db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_tasks (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        description TEXT NOT NULL,
        depends_on TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'pending',
        result TEXT,
        created_session_id TEXT,
        FOREIGN KEY (workflow_id) REFERENCES workflows(id)
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_task_id ON workflow_tasks(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_task_status ON workflow_tasks(status);
`);

// Initialize sessions table for agent-to-agent communication settings
db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        allow_messages INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_allow_messages ON sessions(allow_messages);
`);

// Initialize messages table for inter-agent communication
db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        from_session_id TEXT NOT NULL,
        to_session_id TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp DATETIME NOT NULL,
        FOREIGN KEY (from_session_id) REFERENCES sessions(id),
        FOREIGN KEY (to_session_id) REFERENCES sessions(id)
    );
    CREATE INDEX IF NOT EXISTS idx_messages_to_session ON messages(to_session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_from_session ON messages(from_session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
`);

// Initialize heartbeat tasks table for proactive periodic checks
// scheduled_task_id maps to scheduler.scheduled_tasks entries
// to keep heartbeat behavior integrated with the existing cron engine.
db.exec(`
    CREATE TABLE IF NOT EXISTS heartbeat_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        interval_minutes INTEGER NOT NULL CHECK(interval_minutes > 0),
        prompt TEXT NOT NULL,
        last_run DATETIME,
        scheduled_task_id INTEGER NOT NULL UNIQUE,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (scheduled_task_id) REFERENCES scheduled_tasks(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_heartbeat_session ON heartbeat_tasks(session_id);
    CREATE INDEX IF NOT EXISTS idx_heartbeat_enabled ON heartbeat_tasks(enabled);
    CREATE INDEX IF NOT EXISTS idx_heartbeat_scheduled_task ON heartbeat_tasks(scheduled_task_id);
`);

// Initialize permissions table for access control
db.exec(`
    CREATE TABLE IF NOT EXISTS permissions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        target_session_id TEXT NOT NULL,
        can_read INTEGER DEFAULT 0,
        can_write INTEGER DEFAULT 0,
        created_at DATETIME NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id),
        FOREIGN KEY (target_session_id) REFERENCES sessions(id),
        UNIQUE(session_id, target_session_id)
    );
    CREATE INDEX IF NOT EXISTS idx_permissions_session ON permissions(session_id);
    CREATE INDEX IF NOT EXISTS idx_permissions_target ON permissions(target_session_id);
`);

// Update agent_swarms table schema to use correct foreign key names
try {
    db.exec(`ALTER TABLE agent_swarms RENAME COLUMN parent_session TO parent_session_id`);
} catch (err) {
    // Column already renamed or doesn't exist, ignore
}

try {
    db.exec(`ALTER TABLE agent_swarms RENAME COLUMN child_session TO child_session_id`);
} catch (err) {
    // Column already renamed or doesn't exist, ignore
}

log.info("SQLite DB initialized");
