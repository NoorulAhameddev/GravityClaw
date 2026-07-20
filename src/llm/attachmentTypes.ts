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
}

