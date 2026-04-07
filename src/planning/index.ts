import { getProvider } from "../llm/index.ts";
import { addUserMessage, getHistory, clearHistory, type OrchestratorDependencies } from "../llm/orchestrator.ts";
import { config } from "../config.ts";
import { db } from "../db.ts";
import type { ExecutionPlan, PlanJSON, PlanningMode, PlanningOptions, PlanStep } from "./types.js";
import { persistPlan, updatePlanProgress } from "./storage.js";
import { createLogger } from "../logger.ts";
import { randomBytes } from "crypto";

const orchestratorDeps: OrchestratorDependencies = { db, config };

const log = createLogger("planning");

function generateRunId(): string {
    return `run_${randomBytes(8).toString("hex")}`;
}

function generateStepId(index: number): string {
    return `step-${index + 1}`;
}

function shouldTriggerPlanning(message: string, options: PlanningOptions): boolean {
    if (options.planningMode === "force") return true;
    if (options.planningMode === "off") return false;

    if (message.length > options.messageLengthThreshold) {
        return true;
    }

    const actionPatterns = [
        /\b(create|build|make|write|implement|develop)\b/i,
        /\b(search|find|lookup|query)\b.*\b(for|with|using)\b/i,
        /\b(multiple|several|many)\b.*\b(task|step|action|thing)\b/i,
        /\b(first|then|next|after|before)\b/i,
        /\b(and|also|plus)\b.*\b(and|also|plus)\b/i,
        /\b(process|handle|manage)\b.*\b(data|file|request)\b/i,
        /\bexport\b/i,
        /\bbackup\b/i,
        /\bbrowse\b/i,
        /\bscrape\b/i,
    ];

    const patternMatches = actionPatterns.filter(pattern => pattern.test(message));
    if (patternMatches.length >= 2) {
        return true;
    }

    return false;
}

export function formatPlanForPrompt(plan: ExecutionPlan): string {
    let content = `Goal: ${plan.goal}\n\nSteps:\n`;

    for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i]!;
        const statusIcon = step.status === "completed" ? "[x]" :
            step.status === "active" ? "[>]" : "[ ]";
        content += `${statusIcon} ${step.id}: ${step.description}`;
        if (step.suggestedTools && step.suggestedTools.length > 0) {
            content += ` (tools: ${step.suggestedTools.join(", ")})`;
        }
        content += "\n";
    }

    return content;
}

function parsePlanJson(text: string): PlanJSON | null {
    try {
        const cleaned = text
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();

        const parsed = JSON.parse(cleaned);
        return parsed as PlanJSON;
    } catch {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]!) as PlanJSON;
            } catch {
                return null;
            }
        }
        return null;
    }
}

export async function maybeCreateExecutionPlan(
    sessionId: string,
    latestUserMessage: string,
    options: PlanningOptions
): Promise<ExecutionPlan | null> {
    if (!shouldTriggerPlanning(latestUserMessage, options)) {
        log.debug("Planning not triggered for this message");
        return null;
    }

    if (options.maxIterations <= 1) {
        log.debug("Skipping planner - max iterations too low");
        return null;
    }

    log.info("Creating execution plan...");

    const planningSessionId = `planning:${sessionId}`;
    clearHistory(planningSessionId, orchestratorDeps);

    const plannerPrompt = `You are a task planning expert. Analyze the user's request and create a detailed execution plan.

User request: "${latestUserMessage}"

Respond with a JSON object containing:
{
  "shouldPlan": true,
  "goal": "A clear, user-visible restatement of the goal",
  "steps": [
    {
      "id": "step-1",
      "description": "Clear description of what this step accomplishes",
      "suggestedTools": ["tool_name1", "tool_name2"]
    }
  ],
  "finalResponseStyle": "concise summary" | "detailed" | "conversational"
}

Guidelines:
- Break complex goals into 3-7 actionable steps
- Each step should be specific and verifiable
- Use available tool names when you know them
- Consider dependencies between steps
- Respond ONLY with valid JSON, no additional text`;

    addUserMessage(planningSessionId, plannerPrompt, orchestratorDeps);

    try {
        const provider = getProvider();
        const history = getHistory(planningSessionId, orchestratorDeps);

        const response = await provider.chat(
            [
                { role: "system", content: "You are a JSON-generating planning system. Always respond with valid JSON only." },
                ...history
            ],
            []
        );

        const parsed = parsePlanJson(response.text);

        if (!parsed || !parsed.shouldPlan) {
            log.debug("Planner decided not to create a plan");
            return null;
        }

        const runId = generateRunId();
        const now = new Date().toISOString();

        const steps: PlanStep[] = (parsed.steps || []).map((step, index) => ({
            id: step.id || generateStepId(index),
            description: step.description,
            suggestedTools: step.suggestedTools || [],
            status: "pending" as const,
        }));

        const plan: ExecutionPlan = {
            runId,
            sessionId,
            goal: parsed.goal || latestUserMessage,
            steps,
            finalResponseStyle: (parsed.finalResponseStyle as ExecutionPlan["finalResponseStyle"]) || "conversational",
            currentStepIndex: 0,
            createdAt: now,
            updatedAt: now,
        };

        persistPlan(plan);
        log.info(`Execution plan created with ${steps.length} steps`);

        return plan;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error("Failed to create execution plan", msg);
        return null;
    }
}

export function updatePlanFromToolResult(
    plan: ExecutionPlan,
    toolName: string,
    toolSuccess: boolean
): ExecutionPlan {
    const updatedSteps = [...plan.steps];
    let currentIdx = plan.currentStepIndex;

    for (let i = currentIdx; i < updatedSteps.length; i++) {
        const step = updatedSteps[i]!;
        if (step.status === "pending" || step.status === "active") {
            const suggestedTools = step.suggestedTools || [];
            if (suggestedTools.includes(toolName) || toolSuccess) {
                step.status = "completed";
                currentIdx = i + 1;
                break;
            }
        }
    }

    if (currentIdx < updatedSteps.length && updatedSteps[currentIdx]) {
        updatedSteps[currentIdx]!.status = "active";
    }

    const updatedPlan: ExecutionPlan = {
        ...plan,
        steps: updatedSteps,
        currentStepIndex: currentIdx,
        updatedAt: new Date().toISOString(),
    };

    updatePlanProgress(plan.runId, currentIdx, updatedSteps);

    return updatedPlan;
}
