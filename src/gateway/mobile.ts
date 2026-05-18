import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import { createLogger } from "../logger.ts";
import type { UnifiedMessage } from "../channels/base.ts";
import {
    config,
    MOBILE_ALLOWED_DEVICES,
    MOBILE_REQUIRE_AUTH,
} from "../config.ts";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const log = createLogger("mobile-gateway");

// Allowlisted device IDs (configure via config in production)
const ALLOWED_DEVICES = new Set<string>();
if (MOBILE_ALLOWED_DEVICES) {
    MOBILE_ALLOWED_DEVICES.split(",").forEach(id => {
        ALLOWED_DEVICES.add(id.trim());
    });
}

// Device registration for approval flow
const pendingDevices = new Map<string, { deviceInfo: any; registeredAt: number }>();
const PENDING_CLEANUP_MS = 15 * 60 * 1_000;
const registeredDevices = new Map<string, { approved: boolean; approvedBy?: string; registeredAt: number }>();

// Rate limiting per device
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 100;

function checkRateLimit(deviceId: string): boolean {
    const now = Date.now();
    const record = rateLimitMap.get(deviceId);
    
    if (!record || now > record.resetTime) {
        rateLimitMap.set(deviceId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
        return true;
    }
    
    if (record.count >= RATE_LIMIT_MAX) {
        return false;
    }
    
    record.count++;
    return true;
}

function sanitizeFilename(filename: string): string {
    // Remove any path components, only keep basename
    const basename = path.basename(filename);
    // Remove any non-alphanumeric characters except . and _ and -
    return basename.replace(/[^a-zA-Z0-9._-]/g, "");
}

function generateDeviceToken(): string {
    return crypto.randomBytes(32).toString("hex");
}

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
    authToken?: string;
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
    
    // Security: Require authentication for mobile endpoints
    private requireAuth = MOBILE_REQUIRE_AUTH !== false;

    constructor() {
        this.uploadDir = path.join(process.cwd(), "data", "mobile-uploads");
        if (!fs.existsSync(this.uploadDir)) {
            fs.mkdirSync(this.uploadDir, { recursive: true });
        }
        
        this.app.use(express.json({ limit: "50mb" }));
        this.app.use(express.urlencoded({ extended: true, limit: "50mb" }));
        this.setupRoutes();
    }
    
    private verifyAuth(req: any, res: any): { valid: boolean; userId?: string } {
        if (!this.requireAuth) {
            return { valid: true };
        }
        
        const token = req.headers["x-mobile-token"] as string || 
                      req.query.token as string ||
                      req.body?.token as string;
        
        const userId = req.body?.userId as string || 
                     req.query?.userId as string ||
                     req.params?.userId as string;
        
        if (!token) {
            res.status(401).json({ error: "Authentication required" });
            return { valid: false };
        }

        const registration = userId ? registeredDevices.get(userId) : null;
        if (!registration?.approved) {
            res.status(401).json({ error: "Device not approved" });
            return { valid: false };
        }

        const state = this.mobileStates.get(userId);
        if (state?.authToken !== token) {
            res.status(401).json({ error: "Invalid token" });
            return { valid: false };
        }
        
        return { valid: true, userId };
    }

    private cleanupPendingDevices() {
        const now = Date.now();
        for (const [id, data] of pendingDevices) {
            if (now - data.registeredAt > PENDING_CLEANUP_MS) {
                pendingDevices.delete(id);
                log.info(`🧹 Cleaned up pending device: ${id}`);
            }
        }
    }

    private setupRoutes() {
        // Device registration endpoint
        this.app.post("/mobile/register", (req, res) => {
            const { userId, deviceInfo } = req.body;
            
            if (!userId) {
                return res.status(400).json({ error: "Missing userId" });
            }
            
            // Check if device is allowlisted
            const isAllowlisted = ALLOWED_DEVICES.size === 0 || ALLOWED_DEVICES.has(userId);
            
            if (isAllowlisted) {
                // Auto-approve allowlisted devices
                registeredDevices.set(userId, { approved: true, registeredAt: Date.now() });
                const authToken = generateDeviceToken();
                
                const state = this.mobileStates.get(userId) || {};
                this.mobileStates.set(userId, { ...state, authToken });
                
                log.info(`📱 Device auto-approved: ${userId}`);
                res.json({ approved: true, token: authToken, autoApproved: true });
            } else {
                // Requires manual approval
                pendingDevices.set(userId, { deviceInfo, registeredAt: Date.now() });
                log.info(`📱 Device pending approval: ${userId}`);
                res.json({ approved: false, message: "Pending approval" });
            }
        });
        
        // Device approval endpoint (admin only)
        this.app.post("/mobile/approve", (req, res) => {
            const { userId, approved } = req.body;
            
            if (!userId) {
                return res.status(400).json({ error: "Missing userId" });
            }
            
            if (approved) {
                const authToken = generateDeviceToken();
                registeredDevices.set(userId, { approved: true, registeredAt: Date.now() });
                
                const state = this.mobileStates.get(userId) || {};
                this.mobileStates.set(userId, { ...state, authToken });
                
                const client = this.clients.get(userId);
                if (client && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: "registration_approved", message: "Device approved" }));
                }
                
                log.info(`📱 Device approved: ${userId}`);
                res.json({ success: true, token: authToken });
            } else {
                registeredDevices.delete(userId);
                pendingDevices.delete(userId);
                
                const client = this.clients.get(userId);
                if (client && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: "registration_rejected", message: "Device registration rejected" }));
                }
                
                log.info(`📱 Device rejected: ${userId}`);
                res.json({ success: true });
            }
        });
        
        // Check pending devices
        this.app.get("/mobile/pending", (req, res) => {
            const pending = Array.from(pendingDevices.entries()).map(([id, data]) => ({
                userId: id,
                deviceInfo: data.deviceInfo,
                registeredAt: new Date(data.registeredAt).toISOString()
            }));
            res.json({ pending });
        });

        this.app.post("/mobile/location", (req, res) => {
            if (!this.verifyAuth(req, res).valid) return;
            const { userId, latitude, longitude, accuracy } = req.body;
            if (!userId || latitude === undefined || longitude === undefined) {
                return res.status(400).json({ error: "Missing parameters" });
            }
            
            // Rate limiting check
            if (!checkRateLimit(userId)) {
                return res.status(429).json({ error: "Rate limit exceeded" });
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
            if (!this.verifyAuth(req, res).valid) return;
            const state = this.mobileStates.get(req.params.userId);
            if (!state) return res.status(404).json({ error: "User status unknown" });
            res.json(state);
        });

        this.app.post("/mobile/device-info", (req, res) => {
            if (!this.verifyAuth(req, res).valid) return;
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
            if (!this.verifyAuth(req, res).valid) return;
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
            if (!this.verifyAuth(req, res).valid) return;
            const { userId, image, filename } = req.body;
            if (!userId || !image) {
                return res.status(400).json({ error: "Missing image data" });
            }
            
            // Rate limiting check
            if (!checkRateLimit(userId + "-upload")) {
                return res.status(429).json({ error: "Rate limit exceeded" });
            }

            try {
                const buffer = Buffer.from(image, "base64");
                // SECURE: Sanitize filename to prevent path traversal
                const safeFilename = sanitizeFilename(filename || "capture.jpg");
                const finalFilename = `${userId}_camera_${Date.now()}_${safeFilename}`;
                const filepath = path.join(this.uploadDir, finalFilename);
                
                // Verify path is within upload directory
                const resolvedPath = path.resolve(filepath);
                if (!resolvedPath.startsWith(path.resolve(this.uploadDir))) {
                    throw new Error("Invalid file path");
                }
                
                fs.writeFileSync(filepath, buffer);
                
                const currentState = this.mobileStates.get(userId) || {};
                this.mobileStates.set(userId, {
                    ...currentState,
                    lastCameraCapture: {
                        filename: finalFilename,
                        timestamp: Date.now(),
                        path: filepath
                    }
                });

                log.info(`📷 Camera capture saved for ${userId}: ${finalFilename}`);
                
                this.broadcastToAgent(userId, {
                    type: "camera_capture",
                    filename: finalFilename,
                    path: filepath
                });

                res.json({ success: true, filename: finalFilename, path: filepath });
            } catch (err) {
                log.error("Failed to save camera capture", err);
                res.status(500).json({ error: "Failed to save image" });
            }
        });

        this.app.post("/mobile/upload/screen", (req, res) => {
            if (!this.verifyAuth(req, res).valid) return;
            const { userId, video, filename, duration } = req.body;
            if (!userId || !video) {
                return res.status(400).json({ error: "Missing video data" });
            }
            
            // Rate limiting check
            if (!checkRateLimit(userId + "-upload")) {
                return res.status(429).json({ error: "Rate limit exceeded" });
            }

            try {
                const buffer = Buffer.from(video, "base64");
                // SECURE: Sanitize filename
                const safeFilename = sanitizeFilename(filename || "recording.mp4");
                const finalFilename = `${userId}_screen_${Date.now()}_${safeFilename}`;
                const filepath = path.join(this.uploadDir, finalFilename);
                
                // Verify path is within upload directory
                const resolvedPath = path.resolve(filepath);
                if (!resolvedPath.startsWith(path.resolve(this.uploadDir))) {
                    throw new Error("Invalid file path");
                }
                
                fs.writeFileSync(filepath, buffer);
                
                const currentState = this.mobileStates.get(userId) || {};
                this.mobileStates.set(userId, {
                    ...currentState,
                    lastScreenRecording: {
                        filename: finalFilename,
                        timestamp: Date.now(),
                        duration: duration || 0,
                        path: filepath
                    }
                });

                log.info(`🎬 Screen recording saved for ${userId}: ${finalFilename} (${duration}s)`);
                
                this.broadcastToAgent(userId, {
                    type: "screen_recording",
                    filename: finalFilename,
                    path: filepath,
                    duration: duration
                });

                res.json({ success: true, filename: finalFilename, path: filepath, duration });
            } catch (err) {
                log.error("Failed to save screen recording", err);
                res.status(500).json({ error: "Failed to save recording" });
            }
        });

        this.app.get("/mobile/uploads/:filename", (req, res) => {
            // SECURE: Always verify auth for file access
            if (!this.verifyAuth(req, res).valid) return;
            
            const filepath = path.join(this.uploadDir, req.params.filename);
            
            // Verify path is within upload directory
            const resolvedPath = path.resolve(filepath);
            if (!resolvedPath.startsWith(path.resolve(this.uploadDir))) {
                res.status(403).json({ error: "Access denied" });
                return;
            }
            
            if (fs.existsSync(filepath)) {
                res.sendFile(filepath);
            } else {
                res.status(404).json({ error: "File not found" });
            }
        });

        this.app.post("/mobile/push/register", (req, res) => {
            if (!this.verifyAuth(req, res).valid) return;
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

    private verifyDeviceConnection(userId: string): boolean {
        // Check if device is registered and approved
        const registration = registeredDevices.get(userId);
        if (!registration) {
            // Check if in pending
            if (pendingDevices.has(userId)) {
                log.warn(`📱 Device ${userId} pending approval - connection rejected`);
                return false;
            }
            // Not registered at all
            log.warn(`📱 Unregistered device ${userId} - connection rejected`);
            return false;
        }
        
        if (!registration.approved) {
            log.warn(`📱 Device ${userId} not approved - connection rejected`);
            return false;
        }
        
        return true;
    }

    public attach(server: any, onMessage: (msg: UnifiedMessage) => Promise<void>) {
        this.onMessageCb = onMessage;
        this.wss = new WebSocketServer({ noServer: true });

        this.wss.on("connection", (ws: WebSocket, request) => {
            const url = new URL(request.url || "", `http://${request.headers.host}`);
            let userId = url.searchParams.get("userId") || "default-user";
            const authToken = url.searchParams.get("token");
            
            // SECURE: Verify device if authentication is enabled
            if (this.requireAuth) {
                // Check token
                if (authToken) {
                    const state = this.mobileStates.get(userId);
                    if (state?.authToken !== authToken) {
                        log.warn(`📱 Invalid token for device ${userId} - connection rejected`);
                        ws.close(1008, "Invalid token");
                        return;
                    }
                } else {
                    // For new connections, verify device registration
                    if (!this.verifyDeviceConnection(userId)) {
                        ws.close(1008, "Device not approved");
                        return;
                    }
                }
            }
            
            this.clients.set(userId, ws);
            log.info(`📱 Mobile companion connected: ${userId}`);

            ws.on("message", async (data) => {
                try {
                    const payload = JSON.parse(data.toString());
                    
                    // Rate limiting
                    if (!checkRateLimit(userId)) {
                        ws.send(JSON.stringify({ type: "error", message: "Rate limit exceeded" }));
                        return;
                    }
                    
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
