export interface PlanStep {
    id: string;
    description: string;
    suggestedTools: string[];
    status: "pending" | "active" | "completed" | "failed";
}

export interface ExecutionPlan {
    runId: string;
    sessionId: string;
    goal: string;
    steps: PlanStep[];
    finalResponseStyle: "concise summary" | "detailed" | "conversational";
    currentStepIndex: number;
    createdAt: string;
    updatedAt: string;
}

export interface PlanJSON {
    shouldPlan: boolean;
    goal?: string;
    steps?: Array<{
        id: string;
        description: string;
        suggestedTools?: string[];
        status?: string;
    }>;
    finalResponseStyle?: string;
}

export type PlanningMode = "off" | "auto" | "force";

export interface PlanningOptions {
    planningMode: PlanningMode;
    maxIterations: number;
    messageLengthThreshold: number;
}
