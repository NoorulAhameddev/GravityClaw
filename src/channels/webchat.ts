import { WebSocket } from "ws";
import { createLogger } from "../logger.ts";
import type { Channel, UnifiedMessage } from "../types/channels.js";
import { wss, startServer } from "../server.ts";
import { rateLimiter, createRateLimitErrorResponse } from "../middleware/rate-limit.ts";

const log = createLogger("webchat");

interface WebChatMessage {
    type: "message" | "typing";
    text?: string;
}

export class WebChatChannel implements Channel {
    public id = "webchat";
    public preferredFormat: "markdown" = "markdown";
    private clients: Set<WebSocket> = new Set();
    private onMessageCb?: (msg: UnifiedMessage) => Promise<void>;

    async start(onMessage: (msg: UnifiedMessage) => Promise<void>): Promise<void> {
        this.onMessageCb = onMessage;

        // Ensure the HTTP/WS server is started
        await startServer();

        wss.on("connection", (ws) => {
            log.info(`📡 [WebChat] New WebSocket client connected (total: ${this.clients.size + 1})`);
            this.clients.add(ws);

            // Initialize keep-alive tracking for pong handler
            (ws as any).isAlive = true;
            ws.on("pong", () => {
              (ws as any).isAlive = true;
            });

            ws.on("message", async (data) => {
                try {
                    const parsed: WebChatMessage = JSON.parse(data.toString());
                    log.debug(`📥 [WebChat] Message received - type: ${parsed.type}`);

                    if (parsed.type === "message" && parsed.text && this.onMessageCb) {
                        log.debug(`📨 [WebChat] Chat message: ${parsed.text.substring(0, 50)}...`);
                        const unifiedMsg: UnifiedMessage = {
                            channelId: this.id,
                            chatId: "webchat-session", // Single global session for now
                            userId: "web-user",
                            text: parsed.text,
                        };

                        await this.onMessageCb(unifiedMsg);
                    } else if ((parsed as any).type === "tool_call") {
                        const { id, tool: toolName, args, sessionId } = parsed as any;
                        const { registry } = await import("../tools/index.ts");

                        log.info(`🔧 [WebChat] Tool call: ${toolName} (id: ${id})`);

                        // Check rate limit
                        const rateLimitStatus = rateLimiter.checkRateLimit(sessionId || "webchat-session", toolName);
                        if (!rateLimitStatus.allowed) {
                            log.warn(`⚠️ [WebChat] Rate limit exceeded for tool '${toolName}'`);
                            const errorResponse = createRateLimitErrorResponse(rateLimitStatus);
                            ws.send(JSON.stringify({
                                type: "tool_response",
                                id,
                                error: errorResponse.error,
                                retryAfter: errorResponse.retryAfter,
                                message: errorResponse.message,
                            }));
                            return;
                        }

                        const tool = registry.get(toolName);
                        if (!tool) {
                            log.warn(`⚠️ [WebChat] Tool not found: ${toolName}`);
                            ws.send(JSON.stringify({
                                type: "tool_response",
                                id,
                                error: `Tool not found: ${toolName}`
                            }));
                            return;
                        }

                        try {
                            const effectiveSessionId = sessionId || "webchat-session";
                            const toolArgs = {
                                ...args,
                                // Inject both session ID formats for compatibility
                                sessionId: effectiveSessionId,
                                __sessionId: effectiveSessionId
                            };
                            const resultStr = await tool.execute(toolArgs);
                            const result = JSON.parse(resultStr);
                            log.debug(`✅ [WebChat] Tool executed: ${toolName}`);

                            ws.send(JSON.stringify({
                                type: "tool_response",
                                id,
                                result
                            }));
                        } catch (err: any) {
                            log.error(`❌ [WebChat] Tool execution failed: ${toolName}`, err);
                            ws.send(JSON.stringify({
                                type: "tool_response",
                                id,
                                error: err.message || "Execution failed"
                            }));
                        }
                    }
                } catch (err) {
                    log.error(`❌ [WebChat] Failed to parse message`, err);
                }
            });

            ws.on("close", () => {
                log.info(`🔌 [WebChat] Client disconnected (remaining: ${this.clients.size - 1})`);
                this.clients.delete(ws);
            });

            ws.on("error", (err) => {
                log.error(`⚠️ [WebChat] WebSocket error`, err);
            });
        });
    }

    async stop(): Promise<void> {
        log.info("Stopping WebChat channel…");
        for (const client of this.clients) {
            client.close();
        }
        this.clients.clear();
    }

    async sendMessage(chatId: string, text: string): Promise<void> {
        const { OutputFormatter } = await import("./formatter.ts");
        const formattedText = OutputFormatter.format(text, this.preferredFormat);

        const payload = JSON.stringify({
            type: "message",
            text: formattedText,
            isBot: true
        });

        for (const client of this.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        }
    }

    async sendTyping(chatId: string): Promise<void> {
        const payload = JSON.stringify({ type: "typing" });
        for (const client of this.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        }
    }
}
