import pg from "pg";
import { createLogger } from "../logger.ts";

const log = createLogger("db:postgres");

const { Pool } = pg;

export class PostgresDB {
    pool: pg.Pool;
    private _inTransaction = false;

    constructor(connectionString: string) {
        this.pool = new Pool({
            connectionString,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });

        this.pool.on("error", (err) => {
            log.error("Unexpected pool error", err);
        });

        log.info("PostgreSQL connection pool created");
    }

    pragma(pragma: string, options?: { simple: true }): void | number {
        if (options?.simple) {
            return 0;
        }
        log.debug(`Pragma not supported in PostgreSQL: ${pragma}`);
        return;
    }

    async close(): Promise<void> {
        await this.pool.end();
    }

    prepare(sql: string): PreparedStatement {
        return new PreparedStatement(this.pool, sql);
    }

    exec(sql: string): void {
        this.pool.query(sql).catch((err) => {
            log.error("Exec error", err);
            throw err;
        });
    }

    async execAsync(sql: string): Promise<void> {
        await this.pool.query(sql);
    }

    transaction<T>(fn: () => T): () => T {
        return () => {
            return fn();
        };
    }

    async begin(): Promise<void> {
        await this.pool.query("BEGIN");
        this._inTransaction = true;
    }

    async commit(): Promise<void> {
        await this.pool.query("COMMIT");
        this._inTransaction = false;
    }

    async rollback(): Promise<void> {
        await this.pool.query("ROLLBACK");
        this._inTransaction = false;
    }

    get inTransaction(): boolean {
        return this._inTransaction;
    }
}

export class PreparedStatement {
    private pool: pg.Pool;
    private sql: string;

    constructor(pool: pg.Pool, sql: string) {
        this.pool = pool;
        this.sql = sql;
    }

    all(...params: unknown[]): unknown[] {
        let output: unknown[] = [];
        this.pool.query(this.sql, params as any[]).then((result) => {
            output = result.rows as unknown[];
        }).catch((err) => {
            throw err;
        });
        return output;
    }

    get(...params: unknown[]): unknown {
        let output: unknown = undefined;
        this.pool.query(this.sql, params as any[]).then((result) => {
            output = result.rows[0];
        }).catch((err) => {
            throw err;
        });
        return output;
    }

    run(...params: unknown[]): { changes: number; lastInsertRowid: number } {
        let output = { changes: 0, lastInsertRowid: 0 };
        this.pool.query(this.sql, params as any[]).then((result) => {
            output = {
                changes: result.rowCount || 0,
                lastInsertRowid: 0,
            };
        }).catch((err) => {
            throw err;
        });
        return output;
    }
}

export async function runMigrations(connectionString: string): Promise<void> {
    const db = new PostgresDB(connectionString);
    const client = await db.pool.connect();

    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        const migrations: Record<string, string> = {
            memory: `
                CREATE TABLE IF NOT EXISTS memory (
                    id SERIAL PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    message_json TEXT NOT NULL,
                    settings TEXT DEFAULT '{}'
                );
                CREATE INDEX IF NOT EXISTS idx_session_id ON memory(session_id);
            `,
            agent_swarms: `
                CREATE TABLE IF NOT EXISTS agent_swarms (
                    id TEXT PRIMARY KEY,
                    parent_session_id TEXT NOT NULL,
                    child_session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'spawned',
                    created_at TIMESTAMP NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_parent_session ON agent_swarms(parent_session_id);
                CREATE INDEX IF NOT EXISTS idx_child_session ON agent_swarms(child_session_id);
            `,
            workflows: `
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
            `,
            workflow_tasks: `
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
            `,
            sessions: `
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    allow_messages INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_sessions_allow_messages ON sessions(allow_messages);
            `,
            messages: `
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    from_session_id TEXT NOT NULL,
                    to_session_id TEXT NOT NULL,
                    content TEXT NOT NULL,
                    timestamp TIMESTAMP NOT NULL,
                    FOREIGN KEY (from_session_id) REFERENCES sessions(id),
                    FOREIGN KEY (to_session_id) REFERENCES sessions(id)
                );
                CREATE INDEX IF NOT EXISTS idx_messages_to_session ON messages(to_session_id);
                CREATE INDEX IF NOT EXISTS idx_messages_from_session ON messages(from_session_id);
                CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
            `,
            heartbeat_tasks: `
                CREATE TABLE IF NOT EXISTS heartbeat_tasks (
                    id SERIAL PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    interval_minutes INTEGER NOT NULL CHECK(interval_minutes > 0),
                    prompt TEXT NOT NULL,
                    last_run TIMESTAMP,
                    scheduled_task_id INTEGER NOT NULL UNIQUE,
                    enabled INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (scheduled_task_id) REFERENCES scheduled_tasks(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_heartbeat_session ON heartbeat_tasks(session_id);
                CREATE INDEX IF NOT EXISTS idx_heartbeat_enabled ON heartbeat_tasks(enabled);
                CREATE INDEX IF NOT EXISTS idx_heartbeat_scheduled_task ON heartbeat_tasks(scheduled_task_id);
            `,
            secret_access_log: `
                CREATE TABLE IF NOT EXISTS secret_access_log (
                    id SERIAL PRIMARY KEY,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    secret_name TEXT NOT NULL,
                    action TEXT NOT NULL CHECK(action IN ('read', 'write', 'rotate', 'delete')),
                    user TEXT DEFAULT 'system',
                    status TEXT NOT NULL CHECK(status IN ('success', 'failed')),
                    error TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_secret_access_timestamp ON secret_access_log(timestamp DESC);
                CREATE INDEX IF NOT EXISTS idx_secret_access_name ON secret_access_log(secret_name);
                CREATE INDEX IF NOT EXISTS idx_secret_access_action ON secret_access_log(action);
            `,
            file_access_log: `
                CREATE TABLE IF NOT EXISTS file_access_log (
                    id SERIAL PRIMARY KEY,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
            `,
            permissions: `
                CREATE TABLE IF NOT EXISTS permissions (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    target_session_id TEXT NOT NULL,
                    can_read INTEGER DEFAULT 0,
                    can_write INTEGER DEFAULT 0,
                    created_at TIMESTAMP NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES sessions(id),
                    FOREIGN KEY (target_session_id) REFERENCES sessions(id),
                    UNIQUE(session_id, target_session_id)
                );
                CREATE INDEX IF NOT EXISTS idx_permissions_session ON permissions(session_id);
                CREATE INDEX IF NOT EXISTS idx_permissions_target ON permissions(target_session_id);
            `,
            scheduled_tasks: `
                CREATE TABLE IF NOT EXISTS scheduled_tasks (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    expression TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    enabled INTEGER DEFAULT 1,
                    last_run TIMESTAMP,
                    next_run TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_scheduled_enabled ON scheduled_tasks(enabled);
                CREATE INDEX IF NOT EXISTS idx_scheduled_next_run ON scheduled_tasks(next_run);
            `,
            usage: `
                CREATE TABLE IF NOT EXISTS usage (
                    id SERIAL PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    model TEXT,
                    input_tokens INTEGER DEFAULT 0,
                    output_tokens INTEGER DEFAULT 0,
                    input_cost_cents INTEGER DEFAULT 0,
                    output_cost_cents INTEGER DEFAULT 0,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    metadata TEXT DEFAULT '{}'
                );
                CREATE INDEX IF NOT EXISTS idx_usage_session ON usage(session_id);
                CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage(timestamp DESC);
            `,
            webhooks: `
                CREATE TABLE IF NOT EXISTS webhooks (
                    id TEXT PRIMARY KEY,
                    url TEXT NOT NULL,
                    events TEXT NOT NULL,
                    secret TEXT,
                    enabled INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled);
            `,
            recommendation_events: `
                CREATE TABLE IF NOT EXISTS recommendation_events (
                    id SERIAL PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    recommendation_id TEXT,
                    score REAL,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_recommendation_session ON recommendation_events(session_id);
                CREATE INDEX IF NOT EXISTS idx_recommendation_timestamp ON recommendation_events(timestamp DESC);
            `,
            group_settings: `
                CREATE TABLE IF NOT EXISTS group_settings (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    settings_json TEXT NOT NULL DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `,
            group_admins: `
                CREATE TABLE IF NOT EXISTS group_admins (
                    id SERIAL PRIMARY KEY,
                    group_id TEXT NOT NULL,
                    session_id TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (group_id) REFERENCES group_settings(id),
                    FOREIGN KEY (session_id) REFERENCES sessions(id),
                    UNIQUE(group_id, session_id)
                );
            `,
            group_sessions: `
                CREATE TABLE IF NOT EXISTS group_sessions (
                    id SERIAL PRIMARY KEY,
                    group_id TEXT NOT NULL,
                    session_id TEXT NOT NULL,
                    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (group_id) REFERENCES group_settings(id),
                    FOREIGN KEY (session_id) REFERENCES sessions(id),
                    UNIQUE(group_id, session_id)
                );
            `,
            fact_stats: `
                CREATE TABLE IF NOT EXISTS fact_stats (
                    id SERIAL PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    fact_count INTEGER DEFAULT 0,
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_fact_stats_session ON fact_stats(session_id);
            `,
            entities: `
                CREATE TABLE IF NOT EXISTS entities (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL,
                    properties_json TEXT NOT NULL DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_entities_session ON entities(session_id);
                CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
                CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
            `,
            relationships: `
                CREATE TABLE IF NOT EXISTS relationships (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    from_entity TEXT NOT NULL,
                    to_entity TEXT NOT NULL,
                    type TEXT NOT NULL,
                    properties_json TEXT NOT NULL DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_relationships_session ON relationships(session_id);
                CREATE INDEX IF NOT EXISTS idx_relationships_from ON relationships(from_entity);
                CREATE INDEX IF NOT EXISTS idx_relationships_to ON relationships(to_entity);
            `,
            attachments: `
                CREATE TABLE IF NOT EXISTS attachments (
                    id SERIAL PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    message_id TEXT NOT NULL,
                    file_name TEXT NOT NULL,
                    mime_type TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    file_size INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_attachments_session ON attachments(session_id);
                CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);
            `,
            rate_limits: `
                CREATE TABLE IF NOT EXISTS rate_limits (
                    id SERIAL PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    limit_count INTEGER NOT NULL,
                    window_ms INTEGER NOT NULL,
                    current_count INTEGER DEFAULT 0,
                    reset_at TIMESTAMP NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(session_id, window_ms)
                );
                CREATE INDEX IF NOT EXISTS idx_rate_limits_session ON rate_limits(session_id);
            `,
            rate_limit_history: `
                CREATE TABLE IF NOT EXISTS rate_limit_history (
                    id SERIAL PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    allowed INTEGER NOT NULL,
                    limit_count INTEGER NOT NULL,
                    window_ms INTEGER NOT NULL,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_rate_limit_history_session ON rate_limit_history(session_id);
                CREATE INDEX IF NOT EXISTS idx_rate_limit_history_timestamp ON rate_limit_history(timestamp DESC);
            `,
            metrics: `
                CREATE TABLE IF NOT EXISTS metrics (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    value REAL NOT NULL,
                    tags TEXT DEFAULT '{}',
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(name);
                CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp DESC);
            `,
        };

        for (const [name, sql] of Object.entries(migrations)) {
            const checkResult = await client.query(
                "SELECT id FROM schema_migrations WHERE name = $1",
                [name]
            );

            if (checkResult.rows.length === 0) {
                log.info(`Running migration: ${name}`);
                await client.query("BEGIN");
                try {
                    await client.query(sql);
                    await client.query(
                        "INSERT INTO schema_migrations (name) VALUES ($1)",
                        [name]
                    );
                    await client.query("COMMIT");
                    log.info(`Migration completed: ${name}`);
                } catch (err) {
                    await client.query("ROLLBACK");
                    throw err;
                }
            }
        }

        log.info("All migrations completed");
    } finally {
        client.release();
        await db.close();
    }
}
