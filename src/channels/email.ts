import Imap from "imap";
import nodemailer from "nodemailer";
import { createLogger } from "../logger.ts";
import type { Channel, UnifiedMessage } from "../types/channels.js";
import {
    config,
    EMAIL_SMTP_HOST,
    EMAIL_SMTP_PORT,
    EMAIL_SMTP_USER,
    EMAIL_SMTP_PASS,
    EMAIL_IMAP_HOST,
    EMAIL_IMAP_PORT,
    EMAIL_IMAP_USER,
    EMAIL_IMAP_PASS,
    EMAIL_FROM_ADDRESS,
    EMAIL_ALLOWED_SENDERS,
} from "../config.ts";

const log = createLogger("email");

interface EmailMessage {
    from: string;
    to: string;
    subject: string;
    text: string;
    date: Date;
    messageId: string;
}

export class EmailChannel implements Channel {
    public id = "email";
    public preferredFormat: "markdown" = "markdown";
    private onMessageCb?: (msg: UnifiedMessage) => Promise<void>;
    private isRunning = false;
    private imap: Imap | null = null;
    private transporter: nodemailer.Transporter | null = null;
    private allowedSenders: string[] = [];
    private lastUid = 0;
    private pollInterval: NodeJS.Timeout | null = null;

    async initialize(): Promise<void> {
        if (!EMAIL_SMTP_HOST || !EMAIL_IMAP_HOST) {
            throw new Error("Email configuration is incomplete. Please set EMAIL_SMTP_HOST, EMAIL_IMAP_HOST, and related configs.");
        }

        if (EMAIL_ALLOWED_SENDERS) {
            this.allowedSenders = EMAIL_ALLOWED_SENDERS.split(",").map((s) => s.trim().toLowerCase());
            log.info(`Email channel initialized with allowed senders: ${this.allowedSenders.join(", ")}`);
        } else {
            log.warn("No EMAIL_ALLOWED_SENDERS configured - will process all emails");
        }

        this.transporter = nodemailer.createTransport({
            host: EMAIL_SMTP_HOST,
            port: EMAIL_SMTP_PORT,
            secure: EMAIL_SMTP_PORT === 465,
            auth: {
                user: EMAIL_SMTP_USER,
                pass: EMAIL_SMTP_PASS,
            },
        });

        log.info(`Email channel initialized (SMTP: ${EMAIL_SMTP_HOST}:${EMAIL_SMTP_PORT}, IMAP: ${EMAIL_IMAP_HOST}:${EMAIL_IMAP_PORT})`);
    }

    async start(onMessage: (msg: UnifiedMessage) => Promise<void>): Promise<void> {
        if (this.isRunning) {
            log.warn("Email channel already running");
            return;
        }

        this.onMessageCb = onMessage;

        try {
            await this.connectImap();
            this.startPolling();
            this.isRunning = true;
            log.info("Email channel started");
        } catch (error) {
            log.error(`Failed to start email channel: ${error instanceof Error ? error.message : error}`);
            throw error;
        }
    }

    private connectImap(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.imap = new Imap({
                user: EMAIL_IMAP_USER ?? "",
                password: EMAIL_IMAP_PASS ?? "",
                host: EMAIL_IMAP_HOST ?? "",
                port: EMAIL_IMAP_PORT ?? 993,
                tls: true,
                tlsOptions: {
                    rejectUnauthorized: false,
                },
            });

            this.imap.once("ready", () => {
                log.info("IMAP connection ready");
                this.imap!.openBox("INBOX", false, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });

            this.imap.on("error", (err) => {
                log.error(`IMAP error: ${err.message}`);
            });

            this.imap.on("close", () => {
                log.warn("IMAP connection closed");
                if (this.isRunning) {
                    setTimeout(() => this.reconnect(), 5000);
                }
            });

            this.imap.connect();
        });
    }

    private async reconnect(): Promise<void> {
        if (this.isRunning) {
            try {
                await this.connectImap();
                log.info("Reconnected to IMAP");
            } catch (error) {
                log.error(`Failed to reconnect: ${error}`);
                setTimeout(() => this.reconnect(), 10000);
            }
        }
    }

    private startPolling(): void {
        this.pollInterval = setInterval(async () => {
            await this.checkForNewEmails();
        }, 30000);

        this.checkForNewEmails().catch((err) => {
            log.error(`Initial email check failed: ${err}`);
        });
    }

    private async checkForNewEmails(): Promise<void> {
        if (!this.imap || !this.isRunning) return;

        try {
            const searchCriteria: any[] = ["UNSEEN"];
            if (this.lastUid > 0) {
                searchCriteria.push(["UID", `${this.lastUid}:*`]);
            }

            const messages = await this.fetchEmails(searchCriteria);

            for (const email of messages) {
                await this.processEmail(email);
            }
        } catch (error) {
            log.error(`Error checking for new emails: ${error}`);
        }
    }

    private fetchEmails(searchCriteria: any[]): Promise<EmailMessage[]> {
        return new Promise((resolve, reject) => {
            if (!this.imap) {
                reject(new Error("IMAP not connected"));
                return;
            }

            this.imap.search(searchCriteria, (err, results) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (!results || results.length === 0) {
                    resolve([]);
                    return;
                }

                const fetch = this.imap!.fetch(results, {
                    bodies: ["HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID)", "TEXT"],
                    markSeen: false,
                });

                const emails: EmailMessage[] = [];

                fetch.on("message", (msg) => {
                    let header: any = {};
                    let body = "";

                    msg.on("body", (stream, info) => {
                        if (info.which === "HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID)") {
                            let buffer = "";
                            stream.on("data", (chunk) => {
                                buffer += chunk.toString();
                            });
                            stream.on("end", () => {
                                header = Imap.parseHeader(buffer);
                            });
                        } else if (info.which === "TEXT") {
                            let buffer = "";
                            stream.on("data", (chunk) => {
                                buffer += chunk.toString();
                            });
                            stream.on("end", () => {
                                body = buffer;
                            });
                        }
                    });

                    msg.once("attributes", (attrs) => {
                        if (attrs.uid) {
                            this.lastUid = Math.max(this.lastUid, attrs.uid);
                        }
                    });

                    msg.once("end", () => {
                        const from = header.from?.[0] || "";
                        const to = header.to?.[0] || "";
                        const subject = header.subject?.[0] || "";
                        const date = header.date?.[0] ? new Date(header.date[0]) : new Date();
                        const messageId = header["message-id"]?.[0] || "";

                        emails.push({
                            from,
                            to,
                            subject,
                            text: body,
                            date,
                            messageId,
                        });
                    });
                });

                fetch.once("error", reject);
                fetch.once("end", () => {
                    resolve(emails);
                });
            });
        });
    }

    private async processEmail(email: EmailMessage): Promise<void> {
        const senderEmail = this.extractEmail(email.from);

        if (this.allowedSenders.length > 0) {
            const isAllowed = this.allowedSenders.some((sender) =>
                senderEmail.toLowerCase().includes(sender)
            );

            if (!isAllowed) {
                log.debug(`Ignoring email from unauthorized sender: ${senderEmail}`);
                return;
            }
        }

        const commandText = email.text.trim();
        if (!commandText) {
            log.debug("Ignoring empty email");
            return;
        }

        const unifiedMessage: UnifiedMessage = {
            channelId: "email",
            chatId: email.from,
            userId: senderEmail,
            text: commandText,
            sessionId: `email-${senderEmail}`,
            platform: "email",
        };

        if (this.onMessageCb) {
            try {
                await this.onMessageCb(unifiedMessage);
            } catch (error) {
                log.error(`Error processing email: ${error}`);
            }
        }
    }

    private extractEmail(emailString: string): string {
        const match = emailString.match(/<(.+)>/);
        return match ? match[1] ?? emailString : emailString;
    }

    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;

        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }

        if (this.imap) {
            this.imap.end();
            this.imap = null;
        }

        log.info("Email channel stopped");
    }

    async sendMessage(chatId: string, text: string): Promise<void> {
        if (!this.transporter) {
            throw new Error("Email transporter not initialized");
        }

        const toEmail = chatId;

        try {
            const info = await this.transporter.sendMail({
                from: EMAIL_FROM_ADDRESS,
                to: toEmail,
                text: text,
            });

            log.debug(`Sent email to ${toEmail}, message ID: ${info.messageId}`);
        } catch (error) {
            log.error(`Failed to send email: ${error instanceof Error ? error.message : error}`);
            throw error;
        }
    }
}
