import Database from "better-sqlite3";
import { createLogger } from "./logger.ts";
import path from "path";
import { fileURLToPath } from "url";
import { PostgresDB, runMigrations } from "./db/postgres.ts";

const log = createLogger("db");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const databaseUrl = process.env.DATABASE_URL;

interface DBInterface {
    prepare(sql: string): { all: (...params: unknown[]) => unknown[]; get: (...params: unknown[]) => unknown; run: (...params: unknown[]) => { changes: number; lastInsertRowid: number } };
    exec(sql: string): void;
    transaction<T>(fn: () => T): () => T;
    pragma(pragma: string, options?: { simple: true }): void | number;
}

let db: DBInterface;

if (databaseUrl) {
    log.info(`Using PostgreSQL database: ${databaseUrl.replace(/:[^:@]+@/, ":****@")}`);
    const pgDb = new PostgresDB(databaseUrl);
    
    db = pgDb as unknown as DBInterface;
    
    runMigrations(databaseUrl).catch((err) => {
        log.error("Migration failed", err);
        process.exit(1);
    });
} else {
    const dbPath = path.join(__dirname, "../gravity.db");
    log.info(`Connecting to SQLite DB at ${dbPath}`);
    const sqliteDb = new Database(dbPath);
    
    sqliteDb.pragma("journal_mode = WAL");
    
    db = sqliteDb as unknown as DBInterface;

    db.exec(`
        CREATE TABLE IF NOT EXISTS memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            message_json TEXT NOT NULL,
            settings TEXT DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_session_id ON memory(session_id);
    `);

    try {
        db.exec(`ALTER TABLE memory ADD COLUMN settings TEXT DEFAULT '{}'`);
        log.info("Added settings column to memory table");
    } catch (err) {
        log.debug("Settings column already exists or migration skipped");
    }

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

    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            allow_messages INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_allow_messages ON sessions(allow_messages);
    `);

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

    db.exec(`
        CREATE TABLE IF NOT EXISTS secret_access_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            secret_name TEXT NOT NULL,
            action TEXT NOT NULL CHECK(action IN ('read', 'write', 'rotate', 'delete')),
            user TEXT DEFAULT 'system',
            status TEXT NOT NULL CHECK(status IN ('success', 'failed')),
            error TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_secret_access_timestamp ON secret_access_log(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_secret_access_name ON secret_access_log(secret_name);
        CREATE INDEX IF NOT EXISTS idx_secret_access_action ON secret_access_log(action);
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS file_access_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            path TEXT NOT NULL,
            action TEXT NOT NULL CHECK(action IN ('read', 'write', 'delete', 'list')),
            size_bytes INTEGER,
            duration_ms INTEGER,
            user TEXT DEFAULT 'system',
            status TEXT NOT NULL CHECK(status IN ('success', 'denied', 'error')),
            error TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_file_access_timestamp ON file_access_log(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_file_access_path ON file_access_log(path);
        CREATE INDEX IF NOT EXISTS idx_file_access_action ON file_access_log(action);
        CREATE INDEX IF NOT EXISTS idx_file_access_user ON file_access_log(user);
    `);

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

    try {
        db.exec(`ALTER TABLE agent_swarms RENAME COLUMN parent_session TO parent_session_id`);
    } catch (err) {
        log.debug("Column parent_session_id may already exist or migration skipped");
    }

    try {
        db.exec(`ALTER TABLE agent_swarms RENAME COLUMN child_session TO child_session_id`);
    } catch (err) {
        log.debug("Column child_session_id may already exist or migration skipped");
    }

    db.exec(`
        CREATE TABLE IF NOT EXISTS execution_plans (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            run_id TEXT NOT NULL,
            goal TEXT NOT NULL,
            steps_json TEXT NOT NULL,
            current_step_index INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'active',
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_execution_plans_run_id ON execution_plans(run_id);
        CREATE INDEX IF NOT EXISTS idx_execution_plans_session ON execution_plans(session_id);
        CREATE INDEX IF NOT EXISTS idx_execution_plans_status ON execution_plans(status);
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS background_tasks (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            run_id TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'agent',
            tool_name TEXT NOT NULL,
            input_json TEXT NOT NULL,
            user_id TEXT,
            platform TEXT,
            group_id TEXT,
            is_group INTEGER DEFAULT 0,
            attempt INTEGER NOT NULL DEFAULT 0,
            max_retries INTEGER NOT NULL DEFAULT 3,
            status TEXT NOT NULL DEFAULT 'queued',
            result_json TEXT,
            error TEXT,
            workflow_id TEXT,
            workflow_task_id TEXT,
            available_at DATETIME NOT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_background_tasks_session ON background_tasks(session_id);
        CREATE INDEX IF NOT EXISTS idx_background_tasks_status ON background_tasks(status);
        CREATE INDEX IF NOT EXISTS idx_background_tasks_workflow ON background_tasks(workflow_id, workflow_task_id);
    `);

    log.info("SQLite DB initialized");
}

export { db };
export type DB = Database.Database | PostgresDB;
