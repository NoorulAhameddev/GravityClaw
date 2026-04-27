import { WebClient, LogLevel } from "@slack/web-api";
import express, { type Request, type Response } from "express";
import { createHmac } from "crypto";
import { config } from "../config.ts";
import { createLogger } from "../logger.ts";
import { safeJsonParse } from "../utils/json.ts";
import { db } from "../db.ts";
import type { Channel, UnifiedMessage } from "../types/channels.js";
import { app } from "../server.ts";
import type { OrchestratorDependencies } from "../llm/orchestrator.ts";

const log = createLogger("slack");

const orchestratorDeps: OrchestratorDependencies = { db, config };

function verifySlackSignature(
    signingSecret: string,
    timestamp: string,
    body: string,
    signature: string
): boolean {
    const baseString = `v0:${timestamp}:${body}`;
    const hmac = createHmac("sha256", signingSecret);
    hmac.update(baseString);
    const mySignature = `v0=${hmac.digest("hex")}`;

    const timestampNum = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);

    if (Math.abs(now - timestampNum) > 300) {
        return false;
    }

    return mySignature === signature;
}

export class SlackChannel implements Channel {
    public id = "slack";
    public channelName = "Slack";
    private client: WebClient | null = null;
    private messageHandler: ((msg: UnifiedMessage) => Promise<void>) | null = null;
    private router: express.Router;
    private initialized = false;

    constructor() {
        this.router = express.Router();
    }

    static create(): SlackChannel | null {
        if (!config.SLACK_BOT_TOKEN || !config.SLACK_SIGNING_SECRET) {
            return null;
        }
        return new SlackChannel();
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        this.client = new WebClient(config.SLACK_BOT_TOKEN, {
            logLevel: LogLevel.WARN,
        });

        this.setupRoutes();
        this.initialized = true;
        log.info("Slack channel initialized");
    }

    private setupRoutes(): void {
        this.router.use(express.json());

        this.router.post("/slack/events", async (req: Request, res: Response) => {
            try {
                const signature = req.headers["x-slack-signature"] as string;
                const timestamp = req.headers["x-slack-request-timestamp"] as string;

                if (!signature || !timestamp) {
                    res.status(400).send("Missing signature or timestamp");
                    return;
                }

                const isValid = verifySlackSignature(
                    config.SLACK_SIGNING_SECRET!,
                    timestamp,
                    JSON.stringify(req.body),
                    signature
                );

                if (!isValid) {
                    res.status(401).send("Invalid signature");
                    return;
                }

                const type = req.body.type;

                if (type === "url_verification") {
                    res.status(200).json({ challenge: req.body.challenge });
                    return;
                }

                if (type === "event_callback") {
                    const event = req.body.event;

                    if (event.type === "app_mention") {
                        await this.handleAppMention(event);
                    } else if (event.type === "message") {
                        await this.handleMessage(event);
                    }

                    res.status(200).send();
                    return;
                }

                res.status(200).send();
            } catch (error) {
                log.error("Error handling Slack event:", error);
                res.status(500).send("Internal error");
            }
        });

        this.router.post("/slack/interactive", express.json(), async (req: Request, res: Response) => {
            try {
                const payloadResult = safeJsonParse<Record<string, unknown>>(req.body.payload || "{}", {} as Record<string, unknown>, "Slack interactive");
                const payload = payloadResult.success && payloadResult.data ? payloadResult.data : {};

                if (payload.type === "block_actions") {
                    await this.handleBlockActions(payload);
                } else if (payload.type === "view_submission") {
                    await this.handleViewSubmission(payload);
                }

                res.status(200).send();
            } catch (error) {
                log.error("Error handling Slack interactive payload:", error);
                res.status(500).send("Internal error");
            }
        });

        this.router.post("/slack/commands", express.urlencoded({ extended: false }), async (req: Request, res: Response) => {
            try {
                await this.handleSlashCommand(req, res);
            } catch (error) {
                log.error("Error handling Slack slash command:", error);
                res.status(500).send("Internal error");
            }
        });

        app.use(this.router);
    }

    private async handleAppMention(event: any): Promise<void> {
        if (!this.messageHandler) return;

        const userId = event.user;
        const channelId = event.channel;
        const text = event.text;
        const ts = event.ts;

        const msg: UnifiedMessage = {
            channelId: this.id,
            chatId: channelId,
            userId: userId,
            text: text,
            sessionId: `slack-${channelId}`,
            isGroup: event.channel_type === "channel" || event.channel_type === "group",
            platform: "slack",
            groupId: event.channel_type === "channel" || event.channel_type === "group" ? channelId : undefined,
        };

        await this.messageHandler(msg);
    }

    private async handleMessage(event: any): Promise<void> {
        if (!this.messageHandler) return;
        if (event.subtype === "bot_message") return;
        if (event.channel_type !== "im") return;

        const userId = event.user;
        const channelId = event.channel;
        const text = event.text;

        const msg: UnifiedMessage = {
            channelId: this.id,
            chatId: channelId,
            userId: userId,
            text: text,
            sessionId: `slack-${channelId}`,
            isGroup: false,
            platform: "slack",
        };

        await this.messageHandler(msg);
    }

    private async handleSlashCommand(req: Request, res: Response): Promise<void> {
        const command = req.body.command;
        const userId = req.body.user_id;
        const channelId = req.body.channel_id;
        const text = req.body.text;

        if (!this.messageHandler) {
            res.status(200).send("Bot not initialized");
            return;
        }

        if (command === "/chat") {
            const msg: UnifiedMessage = {
                channelId: this.id,
                chatId: channelId,
                userId: userId,
                text: text,
                sessionId: `slack-${channelId}`,
                isGroup: false,
                platform: "slack",
            };

            res.status(200).send("");
            await this.messageHandler(msg);
            return;
        }

        if (command === "/reset") {
            const { clearHistory } = await import("../llm/orchestrator.ts");
            clearHistory(`slack-${channelId}`, orchestratorDeps);

            res.status(200).send("🧹 Conversation history cleared!");
            return;
        }

        if (command === "/status") {
            res.status(200).send("📊 Use `/status` in your chat to see system status");
            return;
        }

        res.status(200).send(`Unknown command: ${command}`);
    }

    private async handleBlockActions(payload: any): Promise<void> {
        const action = payload.actions?.[0];
        if (!action) return;

        const userId = payload.user?.id;
        const channelId = payload.channel?.id;
        const conversationId = payload.container?.channel_id || channelId;

        if (action.action_id === "refresh_status") {
            await this.sendMessage(conversationId || "", "🔄 Refreshing status...");
        }
    }

    private async handleViewSubmission(payload: any): Promise<void> {
        log.info("View submission received:", payload.view?.id);
    }

    async start(onMessage: (msg: UnifiedMessage) => Promise<void>): Promise<void> {
        this.messageHandler = onMessage;
        await this.initialize();

        try {
            const authResult = await this.client?.auth.test();
            log.info(`✅ Slack Bot online — @${authResult?.user}`);
        } catch (error) {
            log.error("Failed to verify Slack bot:", error);
            throw error;
        }
    }

    async stop(): Promise<void> {
        log.info("Stopping Slack channel...");
        this.client = null;
        this.messageHandler = null;
    }

    async sendMessage(chatId: string, text: string): Promise<void> {
        if (!this.client) {
            log.error("Slack client not initialized");
            return;
        }

        try {
            const blocks = this.buildMessageBlocks(text);

            await this.client.chat.postMessage({
                channel: chatId,
                text: text,
                blocks: blocks,
            });
        } catch (error) {
            log.error(`Failed to send message to ${chatId}:`, error);
        }
    }

    private buildMessageBlocks(text: string): any[] {
        const blocks: any[] = [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: text,
                },
            },
        ];

        return blocks;
    }

    async sendTyping(chatId: string): Promise<void> {
        if (!this.client) return;

        try {
            await this.client.chat.postEphemeral({
                channel: chatId,
                user: chatId,
                text: "🤔 Thinking...",
            });
        } catch (error) {
            log.error(`Failed to send typing indicator to ${chatId}:`, error);
        }
    }

    getRouter(): express.Router {
        return this.router;
    }
}
