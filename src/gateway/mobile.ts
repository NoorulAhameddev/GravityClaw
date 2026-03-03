import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import { createLogger } from "../logger.ts";
import type { UnifiedMessage } from "../channels/base.ts";

const log = createLogger("mobile-gateway");

export interface MobileState {
    location?: {
        latitude: number;
        longitude: number;
        accuracy?: number;
        timestamp: number;
    };
    batteryLevel?: number;
    isCharging?: boolean;
}

/**
 * The MobileGateway serves as the bridge between the Gravity Claw agent 
 * and the iOS/Android companion apps.
 */
export class MobileGateway {
    private app = express();
    private wss: WebSocketServer | null = null;
    private clients: Map<string, WebSocket> = new Map();
    private mobileStates: Map<string, MobileState> = new Map();
    private onMessageCb?: (msg: UnifiedMessage) => Promise<void>;

    constructor() {
        this.app.use(express.json());
        this.setupRoutes();
    }

    private setupRoutes() {
        // GPS Endpoint for mobile to POST periodic updates
        this.app.post("/mobile/location", (req, res) => {
            const { userId, latitude, longitude, accuracy } = req.body;
            if (!userId || latitude === undefined || longitude === undefined) {
                return res.status(400).send("Missing parameters");
            }

            this.mobileStates.set(userId, {
                ...this.mobileStates.get(userId),
                location: {
                    latitude,
                    longitude,
                    accuracy,
                    timestamp: Date.now()
                }
            });

            log.debug(`Received location update for ${userId}: ${latitude}, ${longitude}`);
            res.sendStatus(200);
        });

        // Get mobile status (for internal use)
        this.app.get("/mobile/status/:userId", (req, res) => {
            const state = this.mobileStates.get(req.params.userId);
            if (!state) return res.status(404).send("User status unknown");
            res.json(state);
        });
    }

    public attach(server: any, onMessage: (msg: UnifiedMessage) => Promise<void>) {
        this.onMessageCb = onMessage;
        this.wss = new WebSocketServer({ noServer: true });

        this.wss.on("connection", (ws: WebSocket, request) => {
            // Extract user ID from URL or headers in a real implementation
            const userId = "default-user";
            this.clients.set(userId, ws);
            log.info(`📱 Mobile companion connected: ${userId}`);

            ws.on("message", async (data) => {
                try {
                    const payload = JSON.parse(data.toString());
                    if (payload.type === "message") {
                        const unifiedMsg: UnifiedMessage = {
                            channelId: "mobile",
                            chatId: userId,
                            userId: userId,
                            text: payload.text,
                            sessionId: `mobile-${userId}`,
                            isGroup: false,
                            platform: "mobile"
                        };
                        if (this.onMessageCb) await this.onMessageCb(unifiedMsg);
                    }
                } catch (err) {
                    log.error("Failed to parse mobile message", err);
                }
            });

            ws.on("close", () => {
                this.clients.delete(userId);
                log.info(`📱 Mobile companion disconnected: ${userId}`);
            });
        });

        // Wire upgrade event
        server.on("upgrade", (request: any, socket: any, head: any) => {
            const pathname = new URL(request.url || "", `http://${request.headers.host}`).pathname;
            if (pathname === "/mobile") {
                this.wss?.handleUpgrade(request, socket, head, (ws) => {
                    this.wss?.emit("connection", ws, request);
                });
            }
        });
    }

    public async sendMessage(userId: string, text: string) {
        const client = this.clients.get(userId);
        if (client && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "message", text }));
        }
    }

    public getMobileState(userId: string): MobileState | undefined {
        return this.mobileStates.get(userId);
    }

    /**
     * Request a specialized action from the mobile client
     */
    public async requestAction(userId: string, action: "camera" | "record" | "gps_refresh") {
        const client = this.clients.get(userId);
        if (client && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "action", action }));
            return true;
        }
        return false;
    }
}

export const mobileGateway = new MobileGateway();
