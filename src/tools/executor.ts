import Ajv from "ajv";
import { performance } from "perf_hooks";
import type { Tool } from "../types/tools.js";
import { createLogger, sanitizeForLogs } from "../logger.ts";
import { validateCommand } from "../security/command-validator.ts";
import { validatePathAccess } from "../security/path-validator.ts";
import { getSafeDirectories, config } from "../config.ts";
import { approvalGate } from "../middleware/approval.ts";
import { rateLimiter, createRateLimitErrorResponse } from "../middleware/rate-limit.ts";
import { withSpanAsync, SpanKind } from "../lib/telemetry/tracer.js";
import { recordToolCall } from "../lib/telemetry/metrics.js";

const log = createLogger("tool-executor");
const ajv = new Ajv();

export interface ToolExecutionContext {
  sessionId: string;
  userId?: string | undefined;
  platform?: string | undefined;
  groupId?: string | undefined;
  isGroup?: boolean | undefined;
  depth?: number | undefined;
  source?: "agent" | "api" | "websocket" | "scheduler" | "queue" | "mcp" | "plugin" | "test";
  correlationId?: string | undefined;
  signal?: AbortSignal | undefined;
}

export interface ToolExecutionApproval {
  approvedBy: string;
  reason?: string | undefined;
  approvalRequestId?: string | undefined;
}

export interface ToolExecutionRequest {
  toolName: string;
  input: Record<string, unknown>;
  context: ToolExecutionContext;
  approval?: ToolExecutionApproval | undefined;
  approvalRequestId?: string | undefined;
  timeoutMs?: number | undefined;
}

export interface ToolExecutionError {
  type:
    | "not_found"
    | "validation"
    | "approval_required"
    | "rate_limit"
    | "security_policy"
    | "timeout"
    | "cancelled"
    | "execution";
  message: string;
  details?: unknown;
}

export interface ToolExecutionResult {
  success: boolean;
  tool: string;
  result?: string;
  error?: ToolExecutionError;
  metadata: {
    durationMs: number;
    source: string;
    sessionId: string;
    approvedBy?: string;
  };
}

export interface ToolLookup {
  get(name: string): Tool | undefined;
}

function timeoutSignal(parent: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Tool timeout exceeded (${timeoutMs}ms)`)), timeoutMs);

  if (parent) {
    if (parent.aborted) {
      clearTimeout(timeout);
      controller.abort(parent.reason);
    } else {
      parent.addEventListener("abort", () => {
        clearTimeout(timeout);
        controller.abort(parent.reason);
      }, { once: true });
    }
  }

  controller.signal.addEventListener("abort", () => clearTimeout(timeout), { once: true });
  return controller.signal;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal, timeoutMs: number): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(signal.reason instanceof Error ? signal.reason : new Error("Tool execution cancelled"));
  }

  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      signal.addEventListener("abort", () => {
        const reason = signal.reason instanceof Error
          ? signal.reason
          : new Error(`Tool timeout exceeded (${timeoutMs}ms)`);
        reject(reason);
      }, { once: true });
    }),
  ]);
}

export class ToolExecutor {
  constructor(private readonly registry: ToolLookup) {}

  async execute(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    const start = performance.now();
    const source = request.context.source ?? "unknown";
    const timeoutMs = request.timeoutMs ?? config.AGENT_TOOL_TIMEOUT_MS;

    return withSpanAsync(
      `tool.${request.toolName}`,
      async (span) => {
        span.setAttribute("tool.name", request.toolName);
        span.setAttribute("tool.source", source);
        span.setAttribute("session.id", request.context.sessionId);

        const fail = (error: ToolExecutionError): ToolExecutionResult => {
          const durationMs = performance.now() - start;
          log.warn("Tool execution blocked or failed", {
            toolName: request.toolName,
            sessionId: request.context.sessionId,
            source,
            errorType: error.type,
            message: error.message,
          });
          recordToolCall(request.toolName, false);
          return {
            success: false,
            tool: request.toolName,
            error,
            metadata: {
              durationMs,
              source,
              sessionId: request.context.sessionId,
            },
          };
        };

        const tool = this.registry.get(request.toolName);
        if (!tool) {
          return fail({ type: "not_found", message: `Tool "${request.toolName}" not found.` });
        }

        const validation = this.validateInput(tool, request.input);
        if (!validation.valid) {
          return fail({
            type: "validation",
            message: "Tool input failed schema validation.",
            details: validation.errors,
          });
        }

        const rateLimit = rateLimiter.checkRateLimit(request.context.sessionId, tool.name);
        if (!rateLimit.allowed) {
          const error = createRateLimitErrorResponse(rateLimit);
          return fail({
            type: "rate_limit",
            message: error.message,
            details: { retryAfter: error.retryAfter },
          });
        }

        const approval = this.resolveApproval(tool, request);
        if (!approval.allowed) {
          return fail({
            type: "approval_required",
            message: approval.reason,
          });
        }

        const security = this.enforceSecurityPolicy(tool, request.input);
        if (!security.allowed) {
          return fail({
            type: "security_policy",
            message: security.reason,
            details: security.details,
          });
        }

        const signal = timeoutSignal(request.context.signal, timeoutMs);
        const injectedInput = {
          ...request.input,
          __sessionId: request.context.sessionId,
          __userId: request.context.userId,
          __platform: request.context.platform,
          __groupId: request.context.groupId,
          __isGroup: request.context.isGroup,
          __depth: request.context.depth,
          __signal: signal,
        };

        try {
          log.info("Executing tool", {
            toolName: tool.name,
            sessionId: request.context.sessionId,
            source,
            input: sanitizeForLogs(request.input),
          });

          const result = await abortable(tool.execute(injectedInput), signal, timeoutMs);
          const durationMs = performance.now() - start;
          recordToolCall(tool.name, true);
          const metadata: ToolExecutionResult["metadata"] = {
            durationMs,
            source,
            sessionId: request.context.sessionId,
          };
          if (approval.approvedBy) {
            metadata.approvedBy = approval.approvedBy;
          }

          return {
            success: true,
            tool: tool.name,
            result,
            metadata,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const isTimeout = message.toLowerCase().includes("timeout");
          const isCancelled = message.toLowerCase().includes("cancel");
          return fail({
            type: isTimeout ? "timeout" : isCancelled ? "cancelled" : "execution",
            message: isTimeout ? "Tool execution timed out" : message,
          });
        }
      },
      { tool_name: request.toolName, session_id: request.context.sessionId, source },
      SpanKind.CONSUMER
    );
  }

  private validateInput(tool: Tool, input: Record<string, unknown>): { valid: boolean; errors?: unknown } {
    const validate = ajv.compile(tool.inputSchema);
    const valid = validate(input);
    return {
      valid,
      errors: validate.errors,
    };
  }

  private resolveApproval(
    tool: Tool,
    request: ToolExecutionRequest
  ): { allowed: true; approvedBy?: string } | { allowed: false; reason: string } {
    if (!tool.requiresApproval && !approvalGate.isApprovalRequired(tool.name)) {
      return { allowed: true };
    }

    if (request.approval?.approvedBy) {
      return { allowed: true, approvedBy: request.approval.approvedBy };
    }

    const requestId = request.approvalRequestId;
    if (requestId) {
      const approval = approvalGate.getById(requestId);
      if (
        approval &&
        approval.status === "approved" &&
        approval.toolName === tool.name &&
        approval.sessionId === request.context.sessionId
      ) {
        return { allowed: true, approvedBy: approval.approver ?? "approval-gate" };
      }
    }

    return { allowed: false, reason: `Approval required for tool "${tool.name}".` };
  }

  private enforceSecurityPolicy(
    tool: Tool,
    input: Record<string, unknown>
  ): { allowed: true } | { allowed: false; reason: string; details?: unknown } {
    if (tool.name === "run_shell") {
      const command = String(input.command ?? "").trim();
      const validation = validateCommand(command);
      if (!validation.allowed) {
        return {
          allowed: false,
          reason: validation.reason ?? "Command blocked by security policy.",
          details: validation.parsed,
        };
      }

      if (input.cwd) {
        const cwd = String(input.cwd);
        const cwdValidation = validatePathAccess(cwd, {
          allowedPaths: getSafeDirectories(),
          action: "read",
          checkSymlinks: true,
          checkTraversal: true,
          logFailures: true,
        });
        if (!cwdValidation.allowed) {
          return {
            allowed: false,
            reason: `cwd denied: ${cwdValidation.reason}`,
          };
        }
      }
    }

    return { allowed: true };
  }
}
