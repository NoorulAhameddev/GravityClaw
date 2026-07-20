export interface Session {
    id: string;
    allowMessages?: boolean;
    createdAt: string;
    updatedAt: string;
    messageCount?: number;
}

export interface ChatResponse {
    success: boolean;
    data?: {
        message: string;
        sessionId: string;
    };
    error?: string;
}

export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties?: Record<string, unknown>;
        required?: string[];
    };
}

export interface MemoryResult {
    id: number;
    sessionId: string;
    message: string;
    timestamp: string;
    score?: number;
}

export interface UsageReport {
    allTime: {
        requests: number;
        tokens: number;
        cost: number;
    };
    models: Record<string, { calls: number; tokens: number; cost: number }>;
    avgLatency: number;
}

export interface StreamChunk {
    type: "text" | "tool_call" | "error" | "done";
    content?: string;
    toolCall?: Record<string, unknown>;
    error?: string;
}
