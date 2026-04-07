import { db } from "../db.ts";
import type { ExecutionPlan, PlanStep } from "./types.js";
import { randomBytes } from "crypto";

function generateId(): string {
    return randomBytes(16).toString("hex");
}

export function persistPlan(plan: ExecutionPlan): void {
    db.prepare(`
        INSERT INTO execution_plans (id, session_id, run_id, goal, steps_json, current_step_index, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        generateId(),
        plan.sessionId,
        plan.runId,
        plan.goal,
        JSON.stringify(plan.steps),
        plan.currentStepIndex,
        "active",
        plan.createdAt,
        plan.updatedAt
    );
}

export function updatePlanProgress(
    runId: string,
    currentStepIndex: number,
    steps: PlanStep[]
): void {
    db.prepare(`
        UPDATE execution_plans
        SET current_step_index = ?, steps_json = ?, updated_at = ?
        WHERE run_id = ? AND status = 'active'
    `).run(
        currentStepIndex,
        JSON.stringify(steps),
        new Date().toISOString(),
        runId
    );
}

export function getPlanByRunId(runId: string): ExecutionPlan | null {
    const row = db.prepare(`
        SELECT * FROM execution_plans WHERE run_id = ? AND status = 'active'
    `).get(runId) as {
        id: string;
        session_id: string;
        run_id: string;
        goal: string;
        steps_json: string;
        current_step_index: number;
        status: string;
        created_at: string;
        updated_at: string;
    } | undefined;

    if (!row) return null;

    return {
        runId: row.run_id,
        sessionId: row.session_id,
        goal: row.goal,
        steps: JSON.parse(row.steps_json) as PlanStep[],
        finalResponseStyle: "conversational",
        currentStepIndex: row.current_step_index,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export function markPlanCompleted(runId: string): void {
    db.prepare(`
        UPDATE execution_plans SET status = 'completed', updated_at = ? WHERE run_id = ?
    `).run(new Date().toISOString(), runId);
}

export function markPlanFailed(runId: string): void {
    db.prepare(`
        UPDATE execution_plans SET status = 'failed', updated_at = ? WHERE run_id = ?
    `).run(new Date().toISOString(), runId);
}
