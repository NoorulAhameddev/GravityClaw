import type { Session, ChatResponse, ToolDefinition, MemoryResult, UsageReport, StreamChunk } from "./types.js";
import { GravityClawError } from "./errors.js";
import { parseStream } from "./streaming.js";

interface ClientConfig {
    baseUrl: string;
    apiKey: string;
}

export class GravityClawClient {
    private baseUrl: string;
    private apiKey: string;

    constructor(config: ClientConfig) {
        this.baseUrl = config.baseUrl.replace(/\/$/, "");
        this.apiKey = config.apiKey;
    }

    private async request<T>(method: string, path: string, body?: any): Promise<T> {
        const res = await fetch(`${this.baseUrl}/api${path}`, {
            method,
            headers: {
                "Content-Type": "application/json",
                "X-Api-Key": this.apiKey,
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!res.ok) {
            const error = await res.json().catch(() => ({ error: res.statusText }));
            throw new GravityClawError(res.status, error.error || "Unknown error");
        }

        return res.json();
    }

    async createSession(config?: Record<string, unknown>): Promise<Session> {
        return this.request("POST", "/sessions", config);
    }

    async listSessions(): Promise<Session[]> {
        const result = await this.request<{ success: boolean; data: Session[] }>("GET", "/sessions");
        return result.data;
    }

    async chat(sessionId: string, message: string): Promise<ChatResponse> {
        return this.request("POST", `/sessions/${sessionId}/chat`, { message });
    }

    async *chatStream(sessionId: string, message: string): AsyncGenerator<StreamChunk> {
        const res = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/chat/stream`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Api-Key": this.apiKey,
            },
            body: JSON.stringify({ message }),
        });

        if (!res.ok || !res.body) {
            throw new GravityClawError(res.status, "Stream request failed");
        }

        yield* parseStream(res);
    }

    async listTools(): Promise<ToolDefinition[]> {
        const result = await this.request<{ success: boolean; data: ToolDefinition[] }>("GET", "/tools");
        return result.data;
    }

    async executeTool(name: string, args: Record<string, unknown>): Promise<any> {
        return this.request("POST", "/tools/execute", { name, args });
    }

    async searchMemory(sessionId: string, query: string): Promise<MemoryResult[]> {
        return this.request("GET", `/sessions/${sessionId}/memory/search`, { query });
    }

    async getUsage(period: string = "24h"): Promise<UsageReport> {
        return this.request("GET", `/admin/usage?period=${period}`);
    }
}

export { GravityClawError } from "./errors.js";
export type * from "./types.js";
