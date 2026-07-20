import { createLogger } from "../logger.ts";
import { config as appConfig } from "../config.ts";

const log = createLogger("approval");

export interface ApprovalRequest {
    id: string;
    toolName: string;
    parameters: Record<string, unknown>;
    userId: string;
    sessionId: string;
    channel: string;
    timestamp: Date;
    status: "pending" | "approved" | "denied" | "expired";
    expiresAt: Date;
    approver?: string;
    resolvedAt?: Date;
}

export interface ApprovalConfig {
    timeoutMinutes: number;
    enabled: boolean;
    requiredTools: Set<string>;
}

function parseApprovalTools(): Set<string> {
    if (!appConfig.APPROVAL_REQUIRED_TOOLS) {
        return new Set(["run_shell", "file_delete", "http_request", "execute_code"]);
    }
    return new Set(appConfig.APPROVAL_REQUIRED_TOOLS.split(",").map(t => t.trim()));
}

export class ApprovalGate {
    private pendingApprovals = new Map<string, ApprovalRequest>();
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
        if (!this.config.enabled) return false;
        return this.config.requiredTools.has(toolName);
    }

    async createApprovalRequest(
        toolName: string,
        parameters: Record<string, unknown>,
        context: { userId: string; sessionId: string; channel: string }
    ): Promise<ApprovalRequest> {
        const id = this.generateId();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + this.config.timeoutMinutes * 60 * 1000);

        const request: ApprovalRequest = {
            id,
            toolName,
            parameters: this.sanitizeParameters(parameters),
            userId: context.userId,
            sessionId: context.sessionId,
            channel: context.channel,
            timestamp: now,
            status: "pending",
            expiresAt,
        };

        this.pendingApprovals.set(id, request);
        log.info(`Created approval request ${id} for tool ${toolName}`);

        this.notifyApprovalCallbacks(request);

        return request;
    }

    async approve(
        id: string,
        approver: string
    ): Promise<{ success: boolean; request?: ApprovalRequest; error?: string }> {
        const request = this.pendingApprovals.get(id);
        
        if (!request) {
            return { success: false, error: "Approval request not found" };
        }

        if (request.status !== "pending") {
            return { success: false, error: `Request already ${request.status}` };
        }

        if (new Date() > request.expiresAt) {
            request.status = "expired";
            return { success: false, error: "Approval request has expired" };
        }

        request.status = "approved";
        request.approver = approver;
        request.resolvedAt = new Date();

        log.info(`Approved request ${id} by ${approver}`);

        return { success: true, request };
    }

    async deny(
        id: string,
        approver: string
    ): Promise<{ success: boolean; request?: ApprovalRequest; error?: string }> {
        const request = this.pendingApprovals.get(id);
        
        if (!request) {
            return { success: false, error: "Approval request not found" };
        }

        if (request.status !== "pending") {
            return { success: false, error: `Request already ${request.status}` };
        }

        request.status = "denied";
        request.approver = approver;
        request.resolvedAt = new Date();

        log.info(`Denied request ${id} by ${approver}`);

        return { success: true, request };
    }

    getPending(): ApprovalRequest[] {
        return Array.from(this.pendingApprovals.values()).filter(
            (r) => r.status === "pending" && new Date() <= r.expiresAt
        );
    }

    getById(id: string): ApprovalRequest | undefined {
        return this.pendingApprovals.get(id);
    }

    getBySession(sessionId: string): ApprovalRequest[] {
        return Array.from(this.pendingApprovals.values()).filter(
            (r) => r.sessionId === sessionId && r.status === "pending"
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
                log.error("Error in approval callback", err);
            }
        }
    }

    private sanitizeParameters(parameters: Record<string, unknown>): Record<string, unknown> {
        const sanitized: Record<string, unknown> = {};
        const sensitiveKeys = ["password", "token", "apiKey", "secret", "key"];
        
        for (const [key, value] of Object.entries(parameters)) {
            if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk.toLowerCase()))) {
                sanitized[key] = "[REDACTED]";
            } else if (typeof value === "object" && value !== null) {
                sanitized[key] = this.sanitizeParameters(value as Record<string, unknown>);
            } else {
                sanitized[key] = value;
            }
        }
        
        return sanitized;
    }

    private generateId(): string {
        return `approval_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
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
                if (request.status === "pending" && now > request.expiresAt) {
                    request.status = "expired";
                    log.info(`Expired approval request ${id}`);
                    this.pendingApprovals.delete(id);
                }
            }
        }, 30000);
    }
}

export const approvalGate = new ApprovalGate();
