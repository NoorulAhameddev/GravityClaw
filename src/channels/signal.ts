import { spawn, ChildProcess } from "child_process";
import { createLogger } from "../logger.ts";
import { safeJsonParse } from "../utils/json.ts";
import type { Channel, UnifiedMessage } from "../types/channels.js";
import { SIGNAL_PHONE_NUMBER, SIGNAL_GROUP_IDS, SIGNAL_RECIPIENTS } from "../config.ts";
import { getGroupSessionId } from "../groups/index.ts";

const log = createLogger("signal");

interface SignalMessage {
    timestamp: number;
    sender: string;
    senderNumber: string;
    recipient: string;
    groupId?: string;
    message: string;
    isGroup: boolean;
}

interface SignalEnvelope {
    sourceNumber?: string;
    source?: string;
    timestamp?: number;
    dataMessage?: {
        message?: string;
        groupInfo?: {
            groupId?: string;
        };
        recipientPhoneNumbers?: string[];
    };
}

export class SignalChannel implements Channel {
    public id = "signal";
    public preferredFormat: "markdown" = "markdown";
    private onMessageCb?: (msg: UnifiedMessage) => Promise<void>;
    private signalProcess: ChildProcess | null = null;
    private isRunning = false;
    private allowedGroups: string[] = [];
    private allowedRecipients: string[] = [];

    static create(): SignalChannel | null {
        if (!SIGNAL_PHONE_NUMBER) {
            return null;
        }
        return new SignalChannel();
    }

    async initialize(): Promise<void> {
        if (!SIGNAL_PHONE_NUMBER) {
            throw new Error("SIGNAL_PHONE_NUMBER is required for Signal channel");
        }
        
        if (SIGNAL_GROUP_IDS) {
            this.allowedGroups = SIGNAL_GROUP_IDS.split(",").map((g) => g.trim());
        }
        
        if (SIGNAL_RECIPIENTS) {
            this.allowedRecipients = SIGNAL_RECIPIENTS.split(",").map((r) => r.trim());
        }

        log.info(`Signal channel initialized with phone: ${SIGNAL_PHONE_NUMBER}`);
        if (this.allowedGroups.length > 0) {
            log.info(`Allowed groups: ${this.allowedGroups.join(", ")}`);
        }
        if (this.allowedRecipients.length > 0) {
            log.info(`Allowed recipients: ${this.allowedRecipients.join(", ")}`);
        }
    }

    async start(onMessage: (msg: UnifiedMessage) => Promise<void>): Promise<void> {
        if (this.isRunning) {
            log.warn("Signal channel already running");
            return;
        }

        this.onMessageCb = onMessage;
        
        try {
            await this.startSignalDaemon();
            this.isRunning = true;
            log.info("Signal channel started");
        } catch (error) {
            log.error(`Failed to start Signal channel: ${error instanceof Error ? error.message : error}`);
            throw error;
        }
    }

    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        if (this.signalProcess) {
            this.signalProcess.kill();
            this.signalProcess = null;
        }
        this.isRunning = false;
        log.info("Signal channel stopped");
    }

    async sendMessage(chatId: string, text: string): Promise<void> {
        if (!this.signalProcess) {
            throw new Error("Signal channel not running");
        }

        const args = ["-u", SIGNAL_PHONE_NUMBER!, "send", "-m", text, chatId];
        const sendProcess = spawn("signal-cli", args, {
            stdio: ["pipe", "pipe", "pipe"],
        });

        return new Promise((resolve, reject) => {
            sendProcess.on("close", (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`signal-cli send failed with code ${code}`));
                }
            });
            sendProcess.on("error", reject);
        });
    }

    private async startSignalDaemon(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.signalProcess = spawn("signal-cli", [
                    "-u",
                    SIGNAL_PHONE_NUMBER!,
                    "daemon",
                    "--json",
                ], {
                    stdio: ["pipe", "pipe", "pipe"],
                });

                let buffer = "";
                
                this.signalProcess.stdout?.on("data", (data: Buffer) => {
                    buffer += data.toString();
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";
                    
                    for (const line of lines) {
                        if (line.trim()) {
                            this.handleSignalMessage(line);
                        }
                    }
                });

                this.signalProcess.stderr?.on("data", (data: Buffer) => {
                    log.warn(`signal-cli stderr: ${data.toString()}`);
                });

                this.signalProcess.on("error", (error) => {
                    log.error(`signal-cli process error: ${error.message}`);
                    reject(error);
                });

                this.signalProcess.on("exit", (code) => {
                    log.info(`signal-cli exited with code ${code}`);
                    this.isRunning = false;
                });

                setTimeout(() => {
                    if (this.signalProcess && !this.signalProcess.killed) {
                        resolve();
                    } else {
                        reject(new Error("signal-cli failed to start"));
                    }
                }, 3000);
            } catch (error) {
                reject(error);
            }
        });
    }

    private handleSignalMessage(line: string): void {
        const parseResult = safeJsonParse<{ envelope?: SignalEnvelope }>(line, {}, "signal message");
        if (!parseResult.success || !parseResult.data?.envelope) {
            return;
        }
        const envelope = parseResult.data.envelope;
        
        if (!envelope.dataMessage) {
            return;
        }
        
        const messageData = envelope.dataMessage;
        const senderNumber = String(envelope.sourceNumber || envelope.source || "");
        const message = String(messageData.message || "");
        const timestamp = Number(envelope.timestamp) || Date.now();
        
        const groupId = messageData.groupInfo?.groupId ? String(messageData.groupInfo.groupId) : "";
        const isGroup = !!groupId;
        
        const recipient = isGroup ? groupId : (messageData.recipientPhoneNumbers?.[0] || "");
        
        if (!message || !senderNumber) return;
        
        const signalMessage: SignalMessage = {
            timestamp,
            sender: senderNumber,
            senderNumber,
            recipient,
            groupId: groupId || "",
            message,
            isGroup,
        };
        
        this.processMessage(signalMessage);
    }

    private async processMessage(signalMsg: SignalMessage): Promise<void> {
        const senderNumber = signalMsg.senderNumber;
        
        if (this.allowedRecipients.length > 0) {
            const normalizedSender = senderNumber.replace(/\D/g, "");
            const allowed = this.allowedRecipients.some((r) => {
                const normalized = r.replace(/\D/g, "");
                return normalized === normalizedSender;
            });
            
            if (!allowed) {
                log.debug(`Ignoring message from unauthorized number: ${senderNumber}`);
                return;
            }
        }
        
        if (signalMsg.isGroup && this.allowedGroups.length > 0) {
            if (!this.allowedGroups.includes(signalMsg.groupId!)) {
                log.debug(`Ignoring message from unauthorized group: ${signalMsg.groupId}`);
                return;
            }
        }

        const unifiedMessage: UnifiedMessage = {
            channelId: "signal",
            chatId: signalMsg.isGroup ? signalMsg.groupId! : signalMsg.senderNumber,
            userId: signalMsg.senderNumber,
            text: signalMsg.message,
            sessionId: signalMsg.isGroup 
                ? getGroupSessionId("signal", signalMsg.groupId!)
                : `signal-${signalMsg.senderNumber}`,
            isGroup: signalMsg.isGroup,
            platform: "signal",
            groupId: signalMsg.isGroup ? signalMsg.groupId : undefined,
        };

        if (this.onMessageCb) {
            try {
                await this.onMessageCb(unifiedMessage);
            } catch (error) {
                log.error(`Error processing Signal message: ${error instanceof Error ? error.message : error}`);
            }
        }
    }
}