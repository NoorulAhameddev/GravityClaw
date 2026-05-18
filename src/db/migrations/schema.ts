export function initSchema(db: any): void {
    db.exec(`
        -- Memory System
        CREATE TABLE IF NOT EXISTS memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            message_json TEXT NOT NULL,
            settings TEXT DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_session_id ON memory(session_id);
        CREATE INDEX IF NOT EXISTS idx_memory_session_timestamp ON memory(session_id, timestamp DESC);

        -- Fact Stats
        CREATE TABLE IF NOT EXISTS fact_stats (
            session_id TEXT NOT NULL,
            fact_hash TEXT NOT NULL,
            fact_text TEXT NOT NULL,
            category TEXT NOT NULL,
            access_count INTEGER DEFAULT 0,
            last_accessed DATETIME,
            importance REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (session_id, fact_hash)
        );
        CREATE INDEX IF NOT EXISTS idx_fact_stats_session ON fact_stats(session_id);
        CREATE INDEX IF NOT EXISTS idx_fact_stats_last_accessed ON fact_stats(last_accessed);

        -- Graph Entities
        CREATE TABLE IF NOT EXISTS entities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            properties TEXT,
            access_count INTEGER DEFAULT 0,
            last_accessed DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(session_id, name)
        );
        CREATE INDEX IF NOT EXISTS idx_entities_session ON entities(session_id);

        -- Graph Relationships
        CREATE TABLE IF NOT EXISTS relationships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            from_id INTEGER NOT NULL,
            to_id INTEGER NOT NULL,
            relation_type TEXT NOT NULL,
            metadata TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(from_id) REFERENCES entities(id) ON DELETE CASCADE,
            FOREIGN KEY(to_id) REFERENCES entities(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_rel_session ON relationships(session_id);
        CREATE INDEX IF NOT EXISTS idx_rel_from ON relationships(from_id);
        CREATE INDEX IF NOT EXISTS idx_rel_to ON relationships(to_id);

        -- Attachments
        CREATE TABLE IF NOT EXISTS attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            type TEXT NOT NULL,
            url TEXT,
            base64_data TEXT,
            extracted_text TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_attachments_session ON attachments(session_id);
        CREATE INDEX IF NOT EXISTS idx_attachments_type ON attachments(type);
        CREATE INDEX IF NOT EXISTS idx_attachments_timestamp ON attachments(timestamp);

        -- Agent Swarms
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

        -- Workflows
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

        -- Workflow Tasks
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

        -- Sessions
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            allow_messages INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_allow_messages ON sessions(allow_messages);

        -- Messages
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

        -- Scheduled Tasks
        CREATE TABLE IF NOT EXISTS scheduled_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            cron_expression TEXT NOT NULL,
            session_id TEXT NOT NULL,
            prompt TEXT NOT NULL,
            enabled INTEGER DEFAULT 1,
            last_run DATETIME,
            next_run DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_session ON scheduled_tasks(session_id);
        CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_enabled ON scheduled_tasks(enabled);

        -- Heartbeat Tasks
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

        -- Secret Access Log
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

        -- File Access Log
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

        -- Permissions
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

        -- Execution Plans
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

        -- Background Tasks
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

        -- Usage
        CREATE TABLE IF NOT EXISTS usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            session_id TEXT NOT NULL,
            model TEXT NOT NULL,
            prompt_tokens INTEGER NOT NULL,
            completion_tokens INTEGER NOT NULL,
            total_tokens INTEGER NOT NULL,
            cost REAL NOT NULL,
            latency_ms INTEGER,
            provider TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_usage_session ON usage(session_id);
        CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage(timestamp);
        CREATE INDEX IF NOT EXISTS idx_usage_model ON usage(model);


        -- Recommendation Events
        CREATE TABLE IF NOT EXISTS recommendation_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            date_key TEXT NOT NULL,
            suggestions_json TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_recommendation_events_session ON recommendation_events(session_id);
        CREATE INDEX IF NOT EXISTS idx_recommendation_events_date ON recommendation_events(date_key);

        -- Metrics
        CREATE TABLE IF NOT EXISTS metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            value REAL NOT NULL,
            labels TEXT,
            timestamp INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_metrics_name_timestamp ON metrics(name, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_metrics_created_at ON metrics(created_at DESC);

        -- Rate Limits
        CREATE TABLE IF NOT EXISTS rate_limits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            identifier TEXT NOT NULL,
            tokens REAL NOT NULL,
            last_refill_time INTEGER NOT NULL,
            request_count INTEGER NOT NULL,
            hit_count INTEGER NOT NULL,
            last_hit_time INTEGER,
            custom_limit_rpm INTEGER,
            updated_at INTEGER NOT NULL,
            UNIQUE(session_id, identifier)
        );
        CREATE INDEX IF NOT EXISTS idx_rate_limits_session ON rate_limits(session_id);

        CREATE TABLE IF NOT EXISTS rate_limit_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL,
            session_id TEXT NOT NULL,
            tool_name TEXT NOT NULL,
            allowed INTEGER NOT NULL,
            tokens_available REAL NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_rate_limit_history_session ON rate_limit_history(session_id, timestamp);

        -- Group Settings
        CREATE TABLE IF NOT EXISTS group_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL,
            group_id TEXT NOT NULL,
            bot_username TEXT,
            voice_mode TEXT DEFAULT 'off',
            thinking_level TEXT DEFAULT 'medium',
            tts_provider TEXT DEFAULT 'openai',
            enabled_tools TEXT DEFAULT '[]',
            disabled_tools TEXT DEFAULT '[]',
            settings_json TEXT DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(platform, group_id)
        );
        CREATE INDEX IF NOT EXISTS idx_group_settings_platform_group ON group_settings(platform, group_id);

        -- Group Admins
        CREATE TABLE IF NOT EXISTS group_admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL,
            group_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            is_owner INTEGER DEFAULT 0,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(platform, group_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_group_admins_platform_group ON group_admins(platform, group_id);
        CREATE INDEX IF NOT EXISTS idx_group_admins_user ON group_admins(platform, group_id, user_id);

        -- Group Sessions
        CREATE TABLE IF NOT EXISTS group_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL,
            group_id TEXT NOT NULL,
            session_id TEXT NOT NULL UNIQUE,
            last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(platform, group_id)
        );
        CREATE INDEX IF NOT EXISTS idx_group_sessions_platform_group ON group_sessions(platform, group_id);
        CREATE INDEX IF NOT EXISTS idx_group_sessions_session_id ON group_sessions(session_id);

        -- Webhooks
        CREATE TABLE IF NOT EXISTS webhooks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            session_id TEXT NOT NULL,
            secret TEXT,
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(name, session_id)
        );
        CREATE INDEX IF NOT EXISTS idx_webhooks_session ON webhooks(session_id);
    `);
}
