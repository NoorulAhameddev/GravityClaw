import { Pipeline } from './types.ts';
import type { PipelineContext } from './types.ts';
import { InputValidatorStage } from './inputValidator.ts';
import { ContextBuilderStage } from './contextBuilder.ts';
import { ToolPickerStage } from './toolPicker.ts';
import { MemoryWriterStage } from './memoryWriter.ts';
import { addUserMessage, callClaude, addAssistantMessage, addToolResult } from '../llm/index.ts';
import {
  maybeCreateExecutionPlan,
  formatPlanForPrompt,
  updatePlanFromToolResult,
} from '../planning/index.ts';
import type { ExecutionPlan, PlanningMode } from '../planning/types.js';
import { rateLimiter } from '../middleware/rate-limit.ts';
import { checkSessionDailyLimits } from '../usage.ts';
import { performance } from 'perf_hooks';
import { createLogger } from '../logger.ts';
import {
  shouldPersist,
  persistToolResult,
  PERSISTED_OUTPUT_TAG,
  PERSISTED_OUTPUT_CLOSING_TAG,
} from '../lib/toolResultStorage.js';
import { DEFAULT_MAX_RESULT_SIZE_CHARS } from '../constants/toolLimits.ts';

const log = createLogger('pipeline-orchestrator');

export class Orchestrator {
  private pipeline = new Pipeline();

  constructor() {
    this.pipeline
      .addStage(new InputValidatorStage())
      .addStage(new ContextBuilderStage())
      .addStage(new ToolPickerStage());
  }

  async run(
    context: PipelineContext,
    message: string,
  ): Promise<{
    text: string;
    toolCallCount: number;
    hitLimit: boolean;
    toolCalls: Array<{
      name: string;
      input: Record<string, unknown>;
      result: string | undefined;
      success: boolean;
    }>;
  }> {
    const input = await this.pipeline.execute(context, { message });
    const orchestratorDeps = { db: context.db, config: context.config };

    addUserMessage(context.sessionId, message, orchestratorDeps);

    let executionPlan: ExecutionPlan | undefined;
    if (context.config.PLANNING_MODE !== 'off' && context.maxIterations > 1) {
      try {
        executionPlan =
          (await maybeCreateExecutionPlan(context.sessionId, message, {
            planningMode: context.config.PLANNING_MODE as PlanningMode,
            maxIterations: context.maxIterations,
            messageLengthThreshold: context.config.PLANNING_MESSAGE_LENGTH_THRESHOLD,
          })) ?? undefined;
        if (executionPlan) {
          log.info(
            `Planning created plan ${executionPlan.runId} with ${executionPlan.steps.length} steps`,
          );
        }
      } catch (err) {
        log.warn(`Planning failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    let planText = executionPlan ? formatPlanForPrompt(executionPlan) : undefined;

    let iteration = 0;
    let totalToolCalls = 0;
    let consecutiveNoProgress = 0;
    let hitToolLimit = false;
    const maxToolsPerIteration = context.config.AGENT_MAX_TOOLS_PER_ITERATION;
    const collectedText: string[] = [];
    const toolExecutionHistory: Array<{
      name: string;
      input: Record<string, unknown>;
      result: string | undefined;
      success: boolean;
    }> = [];

    while (iteration < context.maxIterations) {
      iteration++;
      if (
        !checkSessionDailyLimits(context.sessionId).allowed ||
        !rateLimiter.checkRateLimit(context.sessionId, 'llm_api_call').allowed
      ) {
        break;
      }

      const promptContext = {
        relevantMemories: input.memories ?? [],
        ...(planText ? { executionPlan: planText } : {}),
      };
      const response = await callClaude(
        context.sessionId,
        input.toolDefs ?? [],
        promptContext,
        orchestratorDeps,
        undefined,
      );
      if (response.text) collectedText.push(response.text);
      addAssistantMessage(
        context.sessionId,
        response.text,
        orchestratorDeps,
        response.toolCalls.length > 0 ? response.toolCalls : undefined,
        response.thought,
        response.thoughtSignature,
      );

      if (response.toolCalls.length === 0) break;

      let iterationProgressMade = false;
      const remainingTotal = context.maxTotalToolCalls - totalToolCalls;
      const batchSize = Math.max(0, Math.min(maxToolsPerIteration, remainingTotal));
      const parallelBatch = response.toolCalls.slice(0, batchSize);
      const results = await Promise.allSettled(
        parallelBatch.map(async (toolCall) => {
          totalToolCalls++;
          let parsedInput: Record<string, unknown> = {};
          try {
            parsedInput = JSON.parse(toolCall.function.arguments || '{}');
          } catch (err) {
            return {
              toolCall,
              execResult: {
                success: false,
                error: new Error(
                  `Invalid JSON arguments: ${err instanceof Error ? err.message : String(err)}`,
                ),
              },
              parsedInput,
            };
          }

          let execResult = await context.executor.execute({
            toolName: toolCall.function.name,
            input: parsedInput,
            context: {
              sessionId: context.sessionId,
              userId: context.userId,
              platform: context.platform,
              source: 'agent',
            },
          });

          if (
            !execResult.success &&
            execResult.error?.type === 'approval_required' &&
            context.requestConfirmation
          ) {
            const commandStr = parsedInput.command
              ? String(parsedInput.command)
              : toolCall.function.name;
            const approved = await context.requestConfirmation(commandStr);
            if (approved) {
              execResult = await context.executor.execute({
                toolName: toolCall.function.name,
                input: parsedInput,
                context: {
                  sessionId: context.sessionId,
                  userId: context.userId,
                  platform: context.platform,
                  source: 'agent',
                },
                approval: {
                  approvedBy: context.userId || 'user',
                  reason: 'User confirmed via channel',
                },
              });
            }
          }

          return { toolCall, execResult, parsedInput };
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { toolCall, execResult, parsedInput } = result.value;
          const rawResult = ((execResult as any).result ?? execResult.error?.message) as
            string | undefined;
          let fedBackContent: string = rawResult ?? '';
          if (
            execResult.success &&
            typeof rawResult === 'string' &&
            shouldPersist(rawResult, toolCall.function.name, DEFAULT_MAX_RESULT_SIZE_CHARS)
          ) {
            const persisted = await persistToolResult(
              context.sessionId,
              toolCall.function.name,
              rawResult,
              toolExecutionHistory.length,
            );
            if (!('error' in persisted)) {
              fedBackContent = `${PERSISTED_OUTPUT_TAG}${persisted.preview}${PERSISTED_OUTPUT_CLOSING_TAG}\nFull result saved to: ${persisted.filepath}`;
              log.debug(
                `Persisted large tool result for ${toolCall.function.name} (${persisted.originalSize} chars) to ${persisted.filepath}`,
              );
            }
          }
          addToolResult(
            context.sessionId,
            toolCall.id,
            JSON.stringify(
              execResult.success
                ? { success: true, data: fedBackContent }
                : { success: false, error: execResult.error },
            ),
            orchestratorDeps,
            toolCall.function.name,
          );
          toolExecutionHistory.push({
            name: toolCall.function.name,
            input: parsedInput,
            result: fedBackContent,
            success: execResult.success,
          });
          if (execResult.success) {
            iterationProgressMade = true;
            if (executionPlan) {
              executionPlan = updatePlanFromToolResult(executionPlan, toolCall.function.name, true);
              planText = formatPlanForPrompt(executionPlan);
            }
          }
        }
      }

      if (totalToolCalls >= context.maxTotalToolCalls) {
        hitToolLimit = true;
        break;
      }

      if (!iterationProgressMade && response.toolCalls.length > 0) {
        consecutiveNoProgress++;
      } else {
        consecutiveNoProgress = 0;
      }

      if (consecutiveNoProgress >= 2) {
        break;
      }
    }

    await new MemoryWriterStage().execute(context, { message: '' });
    return {
      text: collectedText.join('\n') || '(no response)',
      toolCallCount: totalToolCalls,
      hitLimit: hitToolLimit || iteration >= context.maxIterations || consecutiveNoProgress >= 2,
      toolCalls: toolExecutionHistory,
    };
  }
}
