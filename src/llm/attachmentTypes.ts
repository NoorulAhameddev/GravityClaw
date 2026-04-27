export interface Attachment {
    type: string;
    content: string;
    priority?: number;
}

export interface AttachmentContext {
    sessionId: string;
    userId: string;
    platform?: string;
    groupId?: string;
    isGroup?: boolean;
}

export interface AttachmentOptions {
    includeTokenUsage?: boolean;
    includeDiagnostics?: boolean;
    includeDateChange?: boolean;
    includeMCPResources?: boolean;
}

export type AttachmentBuilder = (
    context: AttachmentContext,
    options?: AttachmentOptions
) => Promise<Attachment[]>;

export const ATTACHMENT_TYPES = {
    IDE_SELECTION: "ide_selection",
    IDE_OPENED_FILE: "ide_opened_file",
    TOKEN_USAGE: "token_usage",
    BUDGET_USD: "budget_usd",
    OUTPUT_TOKEN_USAGE: "output_token_usage",
    DATE_CHANGE: "date_change",
    DIAGNOSTICS: "diagnostics",
    LSP_DIAGNOSTICS: "lsp_diagnostics",
    MCP_RESOURCES: "mcp_resources",
    QUEUED_COMMANDS: "queued_commands",
    AT_MENTIONED_FILES: "at_mentioned_files",
    TODO_REMINDERS: "todo_reminders",
    TASK_REMINDERS: "task_reminders",
    PLAN_MODE: "plan_mode",
    AUTO_MODE: "auto_mode",
} as const;

export type AttachmentType = (typeof ATTACHMENT_TYPES)[keyof typeof ATTACHMENT_TYPES];

export function getAttachmentPriority(type: AttachmentType): number {
    const priorities: Record<AttachmentType, number> = {
        [ATTACHMENT_TYPES.DATE_CHANGE]: 100,
        [ATTACHMENT_TYPES.TOKEN_USAGE]: 90,
        [ATTACHMENT_TYPES.BUDGET_USD]: 85,
        [ATTACHMENT_TYPES.IDE_SELECTION]: 80,
        [ATTACHMENT_TYPES.IDE_OPENED_FILE]: 70,
        [ATTACHMENT_TYPES.AT_MENTIONED_FILES]: 60,
        [ATTACHMENT_TYPES.MCP_RESOURCES]: 50,
        [ATTACHMENT_TYPES.DIAGNOSTICS]: 40,
        [ATTACHMENT_TYPES.LSP_DIAGNOSTICS]: 35,
        [ATTACHMENT_TYPES.TODO_REMINDERS]: 30,
        [ATTACHMENT_TYPES.TASK_REMINDERS]: 25,
        [ATTACHMENT_TYPES.QUEUED_COMMANDS]: 20,
        [ATTACHMENT_TYPES.OUTPUT_TOKEN_USAGE]: 15,
        [ATTACHMENT_TYPES.PLAN_MODE]: 10,
        [ATTACHMENT_TYPES.AUTO_MODE]: 10,
    };
    return priorities[type] ?? 0;
}