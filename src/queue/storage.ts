import { db } from "../db.ts";
import type { BackgroundTask, TaskStatus, TaskSource } from "./types.js";
import { randomBytes } from "crypto";

function generateId(): string {
    return randomBytes(16).toString("hex");
}

function rowToTask(row: {
    id: string;
    session_id: string;
    run_id: string;
    source: string;
    tool_name: string;
    input_json: string;
    user_id: string | null;
    platform: string | null;
    group_id: string | null;
    is_group: number;
    attempt: number;
    max_retries: number;
    status: string;
    result_json: string | null;
    error: string | null;
    workflow_id: string | null;
    workflow_task_id: string | null;
    available_at: string;
    created_at: string;
    updated_at: string;
}): BackgroundTask {
    return {
        id: row.id,
        sessionId: row.session_id,
        runId: row.run_id,
        source: row.source as TaskSource,
        toolName: row.tool_name,
        input: JSON.parse(row.input_json),
        userId: row.user_id ?? undefined,
        platform: row.platform ?? undefined,
        groupId: row.group_id ?? undefined,
        isGroup: row.is_group === 1,
        attempt: row.attempt,
        maxRetries: row.max_retries,
        status: row.status as TaskStatus,
        resultJson: row.result_json ?? undefined,
        error: row.error ?? undefined,
        workflowId: row.workflow_id ?? undefined,
        workflowTaskId: row.workflow_task_id ?? undefined,
        availableAt: row.available_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export function createTask(task: {
    sessionId: string;
    runId: string;
    source: TaskSource;
    toolName: string;
    input: Record<string, unknown>;
    userId: string | undefined;
    platform: string | undefined;
    groupId: string | undefined;
    isGroup: boolean;
    attempt: number;
    maxRetries: number;
    status: TaskStatus;
    workflowId: string | undefined;
    workflowTaskId: string | undefined;
    availableAt: string;
}): BackgroundTask {
    const id = generateId();
    const now = new Date().toISOString();

    db.prepare(`
        INSERT INTO background_tasks (
            id, session_id, run_id, source, tool_name, input_json,
            user_id, platform, group_id, is_group,
            attempt, max_retries, status, workflow_id, workflow_task_id,
            available_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        task.sessionId,
        task.runId,
        task.source,
        task.toolName,
        JSON.stringify(task.input),
        task.userId ?? null,
        task.platform ?? null,
        task.groupId ?? null,
        task.isGroup ? 1 : 0,
        task.attempt,
        task.maxRetries,
        task.status,
        task.workflowId ?? null,
        task.workflowTaskId ?? null,
        task.availableAt,
        now,
        now
    );

    return {
        id,
        sessionId: task.sessionId,
        runId: task.runId,
        source: task.source,
        toolName: task.toolName,
        input: task.input,
        userId: task.userId,
        platform: task.platform,
        groupId: task.groupId,
        isGroup: task.isGroup,
        attempt: task.attempt,
        maxRetries: task.maxRetries,
        status: task.status,
        resultJson: undefined,
        error: undefined,
        workflowId: task.workflowId,
        workflowTaskId: task.workflowTaskId,
        availableAt: task.availableAt,
        createdAt: now,
        updatedAt: now,
    };
}

export function claimTask(sessionId?: string): BackgroundTask | null {
    return db.transaction(() => {
        const now = new Date().toISOString();

        let query = `
            SELECT * FROM background_tasks
            WHERE status = 'queued' AND available_at <= ?
        `;
        const params: unknown[] = [now];

        if (sessionId) {
            query += ` AND session_id = ?`;
            params.push(sessionId);
        }

        query += ` ORDER BY created_at ASC LIMIT 1`;

        const row = db.prepare(query).get(...params) as {
            id: string;
            session_id: string;
            run_id: string;
            source: string;
            tool_name: string;
            input_json: string;
            user_id: string | null;
            platform: string | null;
            group_id: string | null;
            is_group: number;
            attempt: number;
            max_retries: number;
            status: string;
            result_json: string | null;
            error: string | null;
            workflow_id: string | null;
            workflow_task_id: string | null;
            available_at: string;
            created_at: string;
            updated_at: string;
        } | undefined;

        if (!row) return null;

        const update = db.prepare(`
            UPDATE background_tasks
            SET status = 'processing', updated_at = ?
            WHERE id = ? AND status = 'queued'
        `).run(now, row.id);

        if (update.changes !== 1) return null;

        return rowToTask({ ...row, status: "processing", updated_at: now });
    })();
}

export function completeTask(taskId: string, result: unknown): void {
    const now = new Date().toISOString();
    db.prepare(`
        UPDATE background_tasks
        SET status = 'completed', result_json = ?, updated_at = ?
        WHERE id = ?
    `).run(JSON.stringify(result), now, taskId);
}

export function failTask(taskId: string, error: string): void {
    const now = new Date().toISOString();
    db.prepare(`
        UPDATE background_tasks
        SET status = 'failed', error = ?, updated_at = ?
        WHERE id = ?
    `).run(error, now, taskId);
}

export function rescheduleTask(taskId: string, availableAt: string): void {
    const now = new Date().toISOString();
    db.prepare(`
        UPDATE background_tasks
        SET available_at = ?, status = 'queued', updated_at = ?
        WHERE id = ?
    `).run(availableAt, now, taskId);
}

export function incrementAttempt(taskId: string): void {
    const now = new Date().toISOString();
    db.prepare(`
        UPDATE background_tasks
        SET attempt = attempt + 1, status = 'queued', updated_at = ?
        WHERE id = ?
    `).run(now, taskId);
}

export function getTaskById(taskId: string): BackgroundTask | null {
    const row = db.prepare(`SELECT * FROM background_tasks WHERE id = ?`).get(taskId) as {
        id: string;
        session_id: string;
        run_id: string;
        source: string;
        tool_name: string;
        input_json: string;
        user_id: string | null;
        platform: string | null;
        group_id: string | null;
        is_group: number;
        attempt: number;
        max_retries: number;
        status: string;
        result_json: string | null;
        error: string | null;
        workflow_id: string | null;
        workflow_task_id: string | null;
        available_at: string;
        created_at: string;
        updated_at: string;
    } | undefined;

    if (!row) return null;
    return rowToTask(row);
}

export function getPendingTasks(sessionId?: string): BackgroundTask[] {
    let query = `SELECT * FROM background_tasks WHERE status IN ('queued', 'processing')`;
    const params: unknown[] = [];

    if (sessionId) {
        query += ` AND session_id = ?`;
        params.push(sessionId);
    }

    query += ` ORDER BY created_at ASC`;

    const rows = db.prepare(query).all(...params) as Array<{
        id: string;
        session_id: string;
        run_id: string;
        source: string;
        tool_name: string;
        input_json: string;
        user_id: string | null;
        platform: string | null;
        group_id: string | null;
        is_group: number;
        attempt: number;
        max_retries: number;
        status: string;
        result_json: string | null;
        error: string | null;
        workflow_id: string | null;
        workflow_task_id: string | null;
        available_at: string;
        created_at: string;
        updated_at: string;
    }>;

    return rows.map(rowToTask);
}

export function updateTaskStatus(taskId: string, status: TaskStatus): void {
    const now = new Date().toISOString();
    db.prepare(`UPDATE background_tasks SET status = ?, updated_at = ? WHERE id = ?`)
        .run(status, now, taskId);
}
