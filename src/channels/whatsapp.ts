import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    type WAMessage,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
// @ts-expect-error - no types available
import qrcode from "qrcode-terminal";
import * as QRCode from "qrcode";
import { createLogger } from "../logger.ts";
import type { Channel, UnifiedMessage } from "../types/channels.js";
import { config } from "../config.ts";
import {
    getGroupSessionId,
    getGroupSettings,
    isGroupAdmin,
    addGroupAdmin,
} from "../groups/index.ts";

const log = createLogger("whatsapp");

export class WhatsAppChannel implements Channel {
    public id = "whatsapp";
    public preferredFormat: "whatsapp" = "whatsapp";
    private sock: ReturnType<typeof makeWASocket> | null = null;
    private onMessageCb?: (msg: UnifiedMessage) => Promise<void>;
    private currentQr: string | null = null;
    private connectionStatus: "disconnected" | "connecting" | "connected" = "disconnected";

    public getQrCode(): string | null {
        return this.currentQr;
    }

    public async getQrCodeDataUrl(): Promise<string | null> {
        if (!this.currentQr) return null;
        try {
            return await QRCode.toDataURL(this.currentQr, { margin: 2, width: 256 });
        } catch (err) {
            log.error("Failed to generate QR code data URL", err);
            return null;
        }
    }

    public getConnectionStatus(): "disconnected" | "connecting" | "connected" {
        return this.connectionStatus;
    }

    static create(): WhatsAppChannel | null {
        if (!config.WHATSAPP_ENABLED) {
            return null;
        }
        return new WhatsAppChannel();
    }

    public async triggerReconnect(): Promise<void> {
        this.connectionStatus = "connecting";
        if (this.sock) {
            this.sock.end(undefined);
        }
        await this.connect();
    }

    private getSelfJid(): string | null {
        const userId = this.sock?.user?.id;
        if (!userId || typeof userId !== "string") return null;

        const base = userId.split(":")[0];
        if (!base) return null;

        return `${base}@s.whatsapp.net`;
    }

    private getSelfNumber(): string | null {
        const selfJid = this.getSelfJid();
        if (!selfJid) return null;
        return selfJid.split("@")[0] || null;
    }

    private isNewsletterJid(jid: string): boolean {
        return jid?.endsWith("@newsletter") || false;
    }

    /**
     * Check if JID is a group
     */
    private isGroupJid(jid: string): boolean {
        return jid?.endsWith("@g.us");
    }

    /**
     * Check if message mentions or replies to bot
     */
    private isBotMentionedOrReplied(msg: WAMessage): boolean {
        // Check if message is a reply to bot
        const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quotedMessage && msg.message?.extendedTextMessage?.contextInfo?.participant) {
            // Check if replied to our own message
            if (msg.key.fromMe) {
                return true;
            }
        }

        // Check for mentions in text
        const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            "";

        // WhatsApp mentions format: @[phone number]
        const myNumber = this.getSelfNumber();
        if (myNumber && text.includes(`@${myNumber}`)) {
            return true;
        }

        return false;
    }

    /**
     * Get session ID for chat (group-aware)
     */
    private getSessionIdForChat(jid: string): string {
        if (this.isGroupJid(jid)) {
            return getGroupSessionId("whatsapp", jid);
        } else {
            // For private chats, use the JID as session ID
            return `whatsapp-${jid}`;
        }
    }

    /**
     * Check if user is admin in WhatsApp group
     */
    private async checkGroupAdmin(groupJid: string, userJid: string): Promise<boolean> {
        if (!this.sock) return false;

        try {
            const groupMetadata = await this.sock.groupMetadata(groupJid);
            const participant = groupMetadata.participants.find(
                (p) => p.id === userJid
            );

            const isAdmin =
                participant?.admin === "admin" ||
                participant?.admin === "superadmin";

            // Cache admin status
            if (isAdmin) {
                addGroupAdmin(
                    "whatsapp",
                    groupJid,
                    userJid,
                    participant?.admin === "superadmin"
                );
            }

            return isAdmin;
        } catch (error) {
            log.error(`Failed to check admin status for ${userJid} in ${groupJid}:`, error);
            // Fall back to database cache
            return isGroupAdmin("whatsapp", groupJid, userJid);
        }
    }

    async start(onMessage: (msg: UnifiedMessage) => Promise<void>): Promise<void> {
        if (!config.WHATSAPP_ENABLED) {
            log.info("WhatsApp channel is disabled in config.");
            return;
        }

        this.onMessageCb = onMessage;
        await this.connect();
    }

    private async connect() {
        const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info");

        const { version, isLatest } = await fetchLatestBaileysVersion();
        log.info(`Using WA v${version.join(".")}, isLatest: ${isLatest}`);

        this.sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            browser: ["GravityClaw", "Chrome", "1.0.0"],
            syncFullHistory: false,
        });

        this.sock!.ev.on("creds.update", saveCreds);

        this.sock!.ev.on("connection.update", (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                this.currentQr = qr;
                log.info("QR code generated for WhatsApp login.");
                qrcode.generate(qr, { small: true });
            }

            if (connection === "close") {
                this.connectionStatus = "disconnected";
                const shouldReconnect =
                    (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                log.warn(
                    `WhatsApp connection closed due to ${lastDisconnect?.error}, reconnecting: ${shouldReconnect}`
                );
                if (shouldReconnect) {
                    this.connectionStatus = "connecting";
                    this.connect().catch((err) => log.error("Reconnect failed", err));
                }
            } else if (connection === "open") {
                this.connectionStatus = "connected";
                log.info("✅ WhatsApp channel connected!");
            } else if (connection === "connecting") {
                this.connectionStatus = "connecting";
            }
        });

        this.sock!.ev.on("messages.upsert", async ({ messages, type }) => {
            log.debug(`WhatsApp messages.upsert received: type=${type}, count=${messages.length}`);
            if ((type !== "notify" && type !== "append") || !this.onMessageCb) return;

            for (const msg of messages) {
                log.debug(`WhatsApp processing message: fromMe=${msg.key.fromMe}, remoteJid=${msg.key.remoteJid}, pushName=${msg.pushName}`);
                // Extract text from whichever structure it is in (text, extended text, etc)
                const text =
                    msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text ||
                    "";

                if (!text) continue;

                const remoteJid = msg.key.remoteJid as string;
                const isGroup = this.isGroupJid(remoteJid);

                // Allow messaging oneself, but explicitly ignore messages coming from the agent itself
                // (e.g. if the agent replies to a message the user sent to themselves).
                // Without this, the agent would enter an infinite loop.
                const isStatusBroadcast = remoteJid === "status@broadcast";
                const isNewsletter = this.isNewsletterJid(remoteJid);
                const isFromMe = msg.key.fromMe;
                const isBotResponse = text.startsWith("\u200B");

                if (isStatusBroadcast) continue;
                if (isNewsletter) continue;
                if (isFromMe && isBotResponse) continue;

                // For private chats, only respond to self-messages
                const selfJid = this.getSelfJid();
                if (!isGroup && isFromMe && (!selfJid || remoteJid !== selfJid)) {
                    // Only allow fromMe if it's sent to "Message Yourself" (their own JID).
                    // Otherwise, we shouldn't reply when they are chatting with friends!
                    continue;
                }

                // For group chats, only respond when bot is mentioned or replied to
                if (isGroup) {
                    const isMentioned = this.isBotMentionedOrReplied(msg);
                    if (!isMentioned && !isFromMe) {
                        continue; // Ignore messages that don't mention or reply to bot
                    }
                }

                // Get sender's JID (for groups, this is the participant)
                const senderJid = isGroup
                    ? (msg.key.participant || msg.key.remoteJid)
                    : msg.key.remoteJid;

                // Get session ID
                const sessionId = this.getSessionIdForChat(remoteJid);

                const unifiedMsg: UnifiedMessage = {
                    channelId: this.id,
                    chatId: remoteJid,
                    userId: senderJid as string,
                    text: text,
                    sessionId: sessionId,
                    isGroup: isGroup,
                    platform: "whatsapp",
                    ...(isGroup ? { groupId: remoteJid } : {}),
                };

                // Catch and log async errors so Baileys doesn't crash on unhandled promise rejection
                this.onMessageCb(unifiedMsg).catch((err) =>
                    log.error("Error processing WhatsApp message", err)
                );
            }
        });
    }

    async stop(): Promise<void> {
        log.info("Stopping WhatsApp channel…");
        if (this.sock) {
            this.sock.logout().catch((err) => log.warn("WhatsApp logout error", err));
        }
    }
    async sendMessage(chatId: string, text: string): Promise<void> {
        if (!this.sock) return;
        if (chatId === "status@broadcast" || this.isNewsletterJid(chatId)) {
            log.warn(`Skipping send to unsupported WhatsApp chat type: ${chatId}`);
            return;
        }

        const { OutputFormatter } = await import("./formatter.ts");
        const formattedText = OutputFormatter.format(text, this.preferredFormat);

        // If sending to ourselves, prepend zero-width space flag so we don't reply to it
        const selfJid = this.getSelfJid();
        const isSelf = !!selfJid && chatId === selfJid;
        const outgoingText = isSelf ? `\u200B${formattedText}` : formattedText;

        await this.sock.sendMessage(chatId, { text: outgoingText });
    }

    async sendTyping(chatId: string): Promise<void> {
        if (!this.sock) return;
        if (chatId === "status@broadcast" || this.isNewsletterJid(chatId)) return;
        await this.sock.sendPresenceUpdate("composing", chatId);
    }
}
