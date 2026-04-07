import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import { createLogger } from "../logger.ts";
import type { UnifiedMessage } from "../channels/base.ts";
import { config } from "../config.ts";
import path from "path";
import fs from "fs";

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
    deviceInfo?: {
        platform: "ios" | "android";
        osVersion: string;
        appVersion: string;
        model: string;
    };
    lastCameraCapture?: {
        filename: string;
        timestamp: number;
        path: string;
    };
    lastScreenRecording?: {
        filename: string;
        timestamp: number;
        duration: number;
        path: string;
    };
}

export interface PushNotificationPayload {
    title: string;
    body: string;
    data?: Record<string, string>;
    priority?: "high" | "normal";
    badge?: number;
}

export class MobileGateway {
    private app = express();
    private wss: WebSocketServer | null = null;
    private clients: Map<string, WebSocket> = new Map();
    private mobileStates: Map<string, MobileState> = new Map();
    private onMessageCb?: (msg: UnifiedMessage) => Promise<void>;
    private uploadDir: string;

    constructor() {
        this.uploadDir = path.join(process.cwd(), "data", "mobile-uploads");
        if (!fs.existsSync(this.uploadDir)) {
            fs.mkdirSync(this.uploadDir, { recursive: true });
        }
        
        this.app.use(express.json({ limit: "50mb" }));
        this.app.use(express.urlencoded({ extended: true, limit: "50mb" }));
        this.setupRoutes();
    }

    private setupRoutes() {
        this.app.post("/mobile/location", (req, res) => {
            const { userId, latitude, longitude, accuracy } = req.body;
            if (!userId || latitude === undefined || longitude === undefined) {
                return res.status(400).json({ error: "Missing parameters" });
            }

            const currentState = this.mobileStates.get(userId) || {};
            this.mobileStates.set(userId, {
                ...currentState,
                location: {
                    latitude,
                    longitude,
                    accuracy,
                    timestamp: Date.now()
                }
            });

            log.debug(`Received location update for ${userId}: ${latitude}, ${longitude}`);
            res.json({ success: true });
        });

        this.app.get("/mobile/status/:userId", (req, res) => {
            const state = this.mobileStates.get(req.params.userId);
            if (!state) return res.status(404).json({ error: "User status unknown" });
            res.json(state);
        });

        this.app.post("/mobile/device-info", (req, res) => {
            const { userId, platform, osVersion, appVersion, model } = req.body;
            if (!userId || !platform) {
                return res.status(400).json({ error: "Missing device info" });
            }

            const currentState = this.mobileStates.get(userId) || {};
            this.mobileStates.set(userId, {
                ...currentState,
                deviceInfo: {
                    platform: platform as "ios" | "android",
                    osVersion: osVersion || "unknown",
                    appVersion: appVersion || "unknown",
                    model: model || "unknown"
                }
            });

            log.info(`📱 Device info updated for ${userId}: ${platform} ${model}`);
            res.json({ success: true });
        });

        this.app.post("/mobile/battery", (req, res) => {
            const { userId, level, isCharging } = req.body;
            if (!userId) {
                return res.status(400).json({ error: "Missing userId" });
            }

            const currentState = this.mobileStates.get(userId) || {};
            this.mobileStates.set(userId, {
                ...currentState,
                batteryLevel: level,
                isCharging: isCharging
            });

            log.debug(`Battery update for ${userId}: ${level}%${isCharging ? " (charging)" : ""}`);
            res.json({ success: true });
        });

        this.app.post("/mobile/upload/camera", (req, res) => {
            const { userId, image, filename } = req.body;
            if (!userId || !image) {
                return res.status(400).json({ error: "Missing image data" });
            }

            try {
                const buffer = Buffer.from(image, "base64");
                const safeFilename = `${userId}_camera_${Date.now()}_${filename || "capture.jpg"}`;
                const filepath = path.join(this.uploadDir, safeFilename);
                
                fs.writeFileSync(filepath, buffer);
                
                const currentState = this.mobileStates.get(userId) || {};
                this.mobileStates.set(userId, {
                    ...currentState,
                    lastCameraCapture: {
                        filename: safeFilename,
                        timestamp: Date.now(),
                        path: filepath
                    }
                });

                log.info(`📷 Camera capture saved for ${userId}: ${safeFilename}`);
                
                this.broadcastToAgent(userId, {
                    type: "camera_capture",
                    filename: safeFilename,
                    path: filepath
                });

                res.json({ success: true, filename: safeFilename, path: filepath });
            } catch (err) {
                log.error("Failed to save camera capture", err);
                res.status(500).json({ error: "Failed to save image" });
            }
        });

        this.app.post("/mobile/upload/screen", (req, res) => {
            const { userId, video, filename, duration } = req.body;
            if (!userId || !video) {
                return res.status(400).json({ error: "Missing video data" });
            }

            try {
                const buffer = Buffer.from(video, "base64");
                const safeFilename = `${userId}_screen_${Date.now()}_${filename || "recording.mp4"}`;
                const filepath = path.join(this.uploadDir, safeFilename);
                
                fs.writeFileSync(filepath, buffer);
                
                const currentState = this.mobileStates.get(userId) || {};
                this.mobileStates.set(userId, {
                    ...currentState,
                    lastScreenRecording: {
                        filename: safeFilename,
                        timestamp: Date.now(),
                        duration: duration || 0,
                        path: filepath
                    }
                });

                log.info(`🎬 Screen recording saved for ${userId}: ${safeFilename} (${duration}s)`);
                
                this.broadcastToAgent(userId, {
                    type: "screen_recording",
                    filename: safeFilename,
                    path: filepath,
                    duration: duration
                });

                res.json({ success: true, filename: safeFilename, path: filepath, duration });
            } catch (err) {
                log.error("Failed to save screen recording", err);
                res.status(500).json({ error: "Failed to save recording" });
            }
        });

        this.app.get("/mobile/uploads/:filename", (req, res) => {
            const filepath = path.join(this.uploadDir, req.params.filename);
            if (fs.existsSync(filepath)) {
                res.sendFile(filepath);
            } else {
                res.status(404).json({ error: "File not found" });
            }
        });

        this.app.post("/mobile/push/register", (req, res) => {
            const { userId, pushToken, platform } = req.body;
            if (!userId || !pushToken) {
                return res.status(400).json({ error: "Missing push token" });
            }

            log.info(`📱 Push token registered for ${userId} (${platform})`);
            res.json({ success: true });
        });
    }

    private broadcastToAgent(userId: string, data: Record<string, unknown>) {
        if (this.onMessageCb) {
            const unifiedMsg: UnifiedMessage = {
                channelId: "mobile",
                chatId: userId,
                userId: userId,
                text: JSON.stringify(data),
                sessionId: `mobile-${userId}`,
                isGroup: false,
                platform: "mobile"
            };
            this.onMessageCb(unifiedMsg);
        }
    }

    public attach(server: any, onMessage: (msg: UnifiedMessage) => Promise<void>) {
        this.onMessageCb = onMessage;
        this.wss = new WebSocketServer({ noServer: true });

        this.wss.on("connection", (ws: WebSocket, request) => {
            const url = new URL(request.url || "", `http://${request.headers.host}`);
            const userId = url.searchParams.get("userId") || "default-user";
            
            this.clients.set(userId, ws);
            log.info(`📱 Mobile companion connected: ${userId}`);

            ws.on("message", async (data) => {
                try {
                    const payload = JSON.parse(data.toString());
                    
                    switch (payload.type) {
                        case "message":
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
                            break;

                        case "location":
                            const currentState = this.mobileStates.get(userId) || {};
                            this.mobileStates.set(userId, {
                                ...currentState,
                                location: {
                                    latitude: payload.latitude,
                                    longitude: payload.longitude,
                                    accuracy: payload.accuracy,
                                    timestamp: Date.now()
                                }
                            });
                            break;

                        case "battery":
                            this.mobileStates.set(userId, {
                                ...this.mobileStates.get(userId),
                                batteryLevel: payload.level,
                                isCharging: payload.isCharging
                            });
                            break;

                        case "device_info":
                            this.mobileStates.set(userId, {
                                ...this.mobileStates.get(userId),
                                deviceInfo: payload.info
                            });
                            break;

                        case "camera_result":
                            this.broadcastToAgent(userId, {
                                type: "camera_capture",
                                filename: payload.filename,
                                path: payload.path
                            });
                            break;

                        case "screen_result":
                            this.broadcastToAgent(userId, {
                                type: "screen_recording",
                                filename: payload.filename,
                                path: payload.path,
                                duration: payload.duration
                            });
                            break;
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
            return true;
        }
        return false;
    }

    public getMobileState(userId: string): MobileState | undefined {
        return this.mobileStates.get(userId);
    }

    public getAllMobileStates(): Map<string, MobileState> {
        return this.mobileStates;
    }

    public isConnected(userId: string): boolean {
        const client = this.clients.get(userId);
        return client !== undefined && client.readyState === WebSocket.OPEN;
    }

    public getConnectedDevices(): string[] {
        return Array.from(this.clients.keys()).filter(
            userId => this.clients.get(userId)?.readyState === WebSocket.OPEN
        );
    }

    public async requestAction(userId: string, action: "camera" | "record" | "gps_refresh" | "stop_recording", data?: Record<string, unknown>): Promise<boolean> {
        const client = this.clients.get(userId);
        if (client && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "action", action, ...data }));
            return true;
        }
        return false;
    }

    public async sendPushNotification(userId: string, payload: PushNotificationPayload): Promise<boolean> {
        const client = this.clients.get(userId);
        
        if (client && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ 
                type: "push_notification", 
                title: payload.title,
                body: payload.body,
                data: payload.data,
                priority: payload.priority,
                badge: payload.badge
            }));
            log.info(`📱 Push notification sent to ${userId}: ${payload.title}`);
            return true;
        }

        log.warn(`Cannot send push notification - ${userId} not connected`);
        return false;
    }

    public async requestCameraCapture(userId: string): Promise<boolean> {
        return this.requestAction(userId, "camera");
    }

    public async requestScreenRecording(userId: string, duration?: number): Promise<boolean> {
        return this.requestAction(userId, "record", { duration });
    }

    public async requestLocationRefresh(userId: string): Promise<boolean> {
        return this.requestAction(userId, "gps_refresh");
    }

    public async stopScreenRecording(userId: string): Promise<boolean> {
        return this.requestAction(userId, "stop_recording");
    }

    public getExpressApp() {
        return this.app;
    }
}

export const mobileGateway = new MobileGateway();
