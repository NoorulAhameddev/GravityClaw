import { createHash, randomUUID } from 'crypto';
import { createLogger } from '../logger.ts';
import { config as appConfig } from '../config.ts';

const log = createLogger('approval');

export interface ApprovalRequest {
  id: string;
  toolName: string;
  parameters: Record<string, unknown>;
  userId: string;
  sessionId: string;
  channel: string;
  timestamp: Date;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  expiresAt: Date;
  requestedBy: string;
  approver?: string;
  approvedBy?: string;
  deniedBy?: string;
  resolutionChannel?: string;
  resolvedAt?: Date;
}

export interface ApprovalConfig {
  timeoutMinutes: number;
  enabled: boolean;
  requiredTools: Set<string>;
}

function parseApprovalTools(): Set<string> {
  if (!appConfig.APPROVAL_REQUIRED_TOOLS) {
    return new Set(['run_shell', 'delete_file', 'file_delete', 'http_request', 'execute_code']);
  }
  const set = new Set(appConfig.APPROVAL_REQUIRED_TOOLS.split(',').map((t) => t.trim()));
  if (set.has('file_delete')) set.add('delete_file');
  if (set.has('delete_file')) set.add('file_delete');
  return set;
}

function canonicalizeForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeForHash);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalizeForHash(record[key])]),
    );
  }
  return value;
}

function hashParameters(parameters: Record<string, unknown>): string {
  const canonical = JSON.stringify(canonicalizeForHash(parameters)) ?? 'undefined';
  return createHash('sha256').update(canonical).digest('hex');
}

export function sanitizeParameters(parameters: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  const sensitiveKeys = ['password', 'token', 'apiKey', 'secret', 'key'];

  for (const [key, value] of Object.entries(parameters)) {
    if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeParameters(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export class ApprovalGate {
  private pendingApprovals = new Map<string, ApprovalRequest>();
  private readonly parameterHashes = new WeakMap<ApprovalRequest, string>();
  private config: ApprovalConfig;
  private approvalCallbacks: ((request: ApprovalRequest) => void)[] = [];

  constructor(config?: Partial<ApprovalConfig>) {
    this.config = {
      timeoutMinutes: config?.timeoutMinutes ?? appConfig.APPROVAL_TIMEOUT_MINUTES ?? 5,
      enabled: config?.enabled ?? appConfig.APPROVAL_ENABLED ?? true,
      requiredTools: config?.requiredTools ?? parseApprovalTools(),
    };
    this.startExpirationChecker();
  }

  setConfig(config: Partial<ApprovalConfig>): void {
    if (config.timeoutMinutes !== undefined) {
      this.config.timeoutMinutes = config.timeoutMinutes;
    }
    if (config.enabled !== undefined) {
      this.config.enabled = config.enabled;
    }
    if (config.requiredTools) {
      this.config.requiredTools = config.requiredTools;
    }
  }

  isApprovalRequired(toolName: string): boolean {
    if (appConfig.UNRESTRICTED_ACCESS || !this.config.enabled || !appConfig.APPROVAL_ENABLED) {
      return false;
    }
    if (toolName === 'delete_file' && this.config.requiredTools.has('file_delete')) {
      return true;
    }
    if (toolName === 'file_delete' && this.config.requiredTools.has('delete_file')) {
      return true;
    }
    return this.config.requiredTools.has(toolName);
  }

  async createApprovalRequest(
    toolName: string,
    parameters: Record<string, unknown>,
    context: { userId: string; sessionId: string; channel: string },
  ): Promise<ApprovalRequest> {
    const id = this.generateId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.timeoutMinutes * 60 * 1000);

    const request: ApprovalRequest = {
      id,
      toolName,
      parameters: sanitizeParameters(parameters),
      userId: context.userId,
      sessionId: context.sessionId,
      channel: context.channel,
      timestamp: now,
      status: 'pending',
      expiresAt,
      requestedBy: context.userId || context.sessionId || context.channel || 'unknown',
    };

    this.parameterHashes.set(request, hashParameters(parameters));
    this.pendingApprovals.set(id, request);
    log.info(`Created approval request ${id} for tool ${toolName}`);

    this.notifyApprovalCallbacks(request);

    return request;
  }

  async approve(
    id: string,
    approver: string,
  ): Promise<{ success: boolean; request?: ApprovalRequest; error?: string }> {
    const request = this.pendingApprovals.get(id);

    if (!request) {
      return { success: false, error: 'Approval request not found' };
    }

    if (request.status !== 'pending') {
      return { success: false, error: `Request already ${request.status}` };
    }

    if (new Date() > request.expiresAt) {
      request.status = 'expired';
      return { success: false, error: 'Approval request has expired' };
    }

    request.status = 'approved';
    request.approver = approver;
    request.approvedBy = approver;
    request.resolutionChannel = 'api';
    request.resolvedAt = new Date();

    log.info(`Approved request ${id} by ${approver}`);

    return { success: true, request };
  }

  async deny(
    id: string,
    approver: string,
  ): Promise<{ success: boolean; request?: ApprovalRequest; error?: string }> {
    const request = this.pendingApprovals.get(id);

    if (!request) {
      return { success: false, error: 'Approval request not found' };
    }

    if (request.status !== 'pending') {
      return { success: false, error: `Request already ${request.status}` };
    }

    request.status = 'denied';
    request.approver = approver;
    request.deniedBy = approver;
    request.resolutionChannel = 'api';
    request.resolvedAt = new Date();

    log.info(`Denied request ${id} by ${approver}`);

    return { success: true, request };
  }

  getPending(): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values()).filter(
      (r) => r.status === 'pending' && new Date() <= r.expiresAt,
    );
  }

  getById(id: string): ApprovalRequest | undefined {
    return this.pendingApprovals.get(id);
  }

  /**
   * Atomically authorize one execution and consume its approval. Reusing an
   * approved request is rejected, even when tool/session/parameters match.
   */
  consumeApproved(
    id: string,
    toolName: string,
    sessionId: string,
    parameters: Record<string, unknown>,
  ): { allowed: true; approvedBy: string } | { allowed: false } {
    const request = this.pendingApprovals.get(id);
    if (
      !request ||
      request.status !== 'approved' ||
      request.toolName !== toolName ||
      request.sessionId !== sessionId ||
      this.parameterHashes.get(request) !== hashParameters(parameters)
    ) {
      return { allowed: false };
    }

    // Delete synchronously so concurrent calls cannot reuse this approval.
    this.pendingApprovals.delete(id);
    return { allowed: true, approvedBy: request.approver ?? 'approval-gate' };
  }

  /** Verify that an approval covers the exact parameters (for diagnostics/tests). */
  matchesParameters(id: string, parameters: Record<string, unknown>): boolean {
    const request = this.pendingApprovals.get(id);
    return Boolean(
      request && this.parameterHashes.get(request) === hashParameters(parameters),
    );
  }

  getBySession(sessionId: string): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values()).filter(
      (r) => r.sessionId === sessionId && r.status === 'pending',
    );
  }

  onApprovalRequest(callback: (request: ApprovalRequest) => void): void {
    this.approvalCallbacks.push(callback);
  }

  private notifyApprovalCallbacks(request: ApprovalRequest): void {
    for (const callback of this.approvalCallbacks) {
      try {
        callback(request);
      } catch (err) {
        log.error('Error in approval callback', err);
      }
    }
  }

  private generateId(): string {
    return `approval_${randomUUID()}`;
  }

  private expirationTimer: ReturnType<typeof setInterval> | null = null;

  stopExpirationChecker(): void {
    if (this.expirationTimer) {
      clearInterval(this.expirationTimer);
      this.expirationTimer = null;
    }
  }

  private startExpirationChecker(): void {
    this.expirationTimer = setInterval(() => {
      const now = new Date();
      for (const [id, request] of this.pendingApprovals.entries()) {
        if (request.status === 'pending' && now > request.expiresAt) {
          request.status = 'expired';
          log.info(`Expired approval request ${id}`);
          this.pendingApprovals.delete(id);
        }
      }
    }, 30000);
  }
}

export const approvalGate = new ApprovalGate();
