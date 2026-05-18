import { Bot } from "grammy";
import { config } from "../config.ts";
import { createLogger } from "../logger.ts";
import { db } from "../db.ts";
import type { Channel, UnifiedMessage } from "../types/channels.js";
import { createTranscriptionService } from "../voice/transcription.ts";
import { createTTSService } from "../voice/tts.ts";
import { createElevenLabsService } from "../voice/elevenlabs.ts";
import { getVoiceSettings } from "../tools/voice/voice-settings.ts";
import { writeFileSync, unlinkSync, readFileSync } from "fs";
import { tmpdir } from "os";
import type { OrchestratorDependencies } from "../llm/orchestrator.ts";
import { join } from "path";
import {
    getGroupSessionId,
    getGroupSettings,
    updateGroupSettings,
    isGroupAdmin,
    addGroupAdmin,
    getGroupAdmins,
    isBotMentioned,
    removeBotMention,
} from "../groups/index.ts";

const log = createLogger("telegram");

const orchestratorDeps: OrchestratorDependencies = { db, config };

export class TelegramChannel implements Channel {
    public id = "telegram";
    private bot: Bot;
    private transcriptionService: ReturnType<typeof createTranscriptionService> | null = null;
    private openaiTTSService: ReturnType<typeof createTTSService> | null = null;
    private elevenLabsTTSService: ReturnType<typeof createElevenLabsService> | null = null;
    private voiceModesPerChat: Map<string, 'off' | 'transcribe-only' | 'full-voice'> = new Map();
    private ttsProviersPerChat: Map<string, 'openai' | 'elevenlabs'> = new Map();
    private sessionIdsPerChat: Map<string, string> = new Map();
    private botUsername: string = "";

    static create(): TelegramChannel | null {
        if (!config.TELEGRAM_BOT_TOKEN) {
            return null;
        }
        return new TelegramChannel();
    }

    constructor() {
        this.bot = new Bot(config.TELEGRAM_BOT_TOKEN);

        // Initialize transcription service if OpenAI API key is available
        if (config.OPENAI_API_KEY) {
            this.transcriptionService = createTranscriptionService(config.OPENAI_API_KEY);
            this.openaiTTSService = createTTSService(config.OPENAI_API_KEY);
        }

        // Initialize ElevenLabs TTS service if API key is available
        if (config.ELEVENLABS_API_KEY) {
            const voiceId = (config.ELEVENLABS_VOICE_ID || "bella") as any;
            this.elevenLabsTTSService = createElevenLabsService(config.ELEVENLABS_API_KEY, voiceId);
        }
    }

    /**
     * Check if chat is a group or supergroup
     */
    private isGroupChat(chatType: string): boolean {
        return chatType === "group" || chatType === "supergroup";
    }

    /**
     * Check if user is admin in the group
     */
    private async checkAndCacheAdmin(chatId: number, userId: number): Promise<boolean> {
        try {
            const member = await this.bot.api.getChatMember(chatId, userId);
            const isAdmin = member.status === "administrator" || member.status === "creator";

            // Cache admin status in database
            if (isAdmin) {
                addGroupAdmin("telegram", chatId.toString(), userId.toString(), member.status === "creator");
            }

            return isAdmin;
        } catch (error) {
            log.error(`Failed to check admin status for user ${userId} in chat ${chatId}:`, error);
            // Fall back to database cache
            return isGroupAdmin("telegram", chatId.toString(), userId.toString());
        }
    }

    /**
     * Get session ID for chat (group-aware)
     */
    private getSessionIdForChat(chatId: string, chatType: string): string {
        if (this.isGroupChat(chatType)) {
            // Use group-specific session ID
            return getGroupSessionId("telegram", chatId);
        } else {
            // Use per-user session ID for private chats
            if (!this.sessionIdsPerChat.has(chatId)) {
                this.sessionIdsPerChat.set(chatId, `telegram-${chatId}-${Date.now()}`);
            }
            return this.sessionIdsPerChat.get(chatId)!;
        }
    }

    /**
     * Download file from Telegram and save to temp location
     */
    private async downloadTelegramFile(fileId: string): Promise<string> {
        try {
            const file = await this.bot.api.getFile(fileId);
            if (!file.file_path) {
                throw new Error("No file_path returned from Telegram");
            }

            const url = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Failed to download file: ${response.statusText}`);
            }

            const buffer = await response.arrayBuffer();

            // Determine file extension from content type
            const contentType = response.headers.get("content-type") || "audio/mpeg";
            let ext = ".ogg"; // Telegram voice messages are typically .ogg
            if (contentType.includes("audio/mpeg")) ext = ".mp3";
            else if (contentType.includes("audio/wav")) ext = ".wav";
            else if (contentType.includes("audio/webm")) ext = ".webm";

            const tempPath = join(tmpdir(), `voice-${Date.now()}${ext}`);
            writeFileSync(tempPath, Buffer.from(buffer));

            log.info(`Downloaded voice file to ${tempPath}`);
            return tempPath;
        } catch (error) {
            log.error("Failed to download Telegram file:", error);
            throw error;
        }
    }

    /**
     * Convert text to speech and return audio buffer
     */
    private async textToSpeech(text: string, sessionId: string | undefined): Promise<Buffer | null> {
        try {
            const voiceSettings = sessionId ? getVoiceSettings(sessionId) : { mode: 'off', ttsProvider: 'openai' };

            // Skip if voice mode is off
            if (voiceSettings.mode === 'off') {
                return null;
            }

            // Use ElevenLabs if configured and enabled
            if (voiceSettings.ttsProvider === 'elevenlabs' && this.elevenLabsTTSService) {
                const voiceId = (voiceSettings as any).voiceId || 'bella';
                log.info(`Converting text to speech using ElevenLabs (${voiceId})`);
                if ((voiceSettings as any).voiceId) {
                    this.elevenLabsTTSService.setVoice((voiceSettings as any).voiceId as any);
                }
                return await this.elevenLabsTTSService.textToSpeech(text);
            }

            // Use OpenAI TTS as default
            if (this.openaiTTSService) {
                log.info('Converting text to speech using OpenAI');
                return await this.openaiTTSService.textToSpeech(text);
            }

            log.warn('No TTS service configured');
            return null;
        } catch (error) {
            log.error('Text-to-speech conversion failed:', error);
            return null;
        }
    }

    async start(onMessage: (msg: UnifiedMessage) => Promise<void>): Promise<void> {
        // ── Whitelist middleware ─────────────────────────────────────────────────
        this.bot.use(async (ctx, next) => {
            const userId = ctx.from?.id;
            const chatType = ctx.chat?.type;

            // For private chats, enforce whitelist
            if (chatType === "private" && userId !== config.TELEGRAM_ALLOWED_USER_ID) {
                log.warn(`Blocked update from user ID: ${userId ?? "unknown"}`);
                return; // silently ignore
            }

            // For group chats, allow all (but we'll check mentions later)
            await next();
        });

        // ── /start ───────────────────────────────────────────────────────────────
        this.bot.command("start", async (ctx) => {
            const isGroup = this.isGroupChat(ctx.chat.type);

            if (isGroup) {
                await ctx.reply(
                    "👋 Gravity Claw is now active in this group.\n\n" +
                    `Mention me (@${this.botUsername}) in your messages to interact.\n` +
                    "Admins can use /group to configure settings."
                );
            } else {
                await ctx.reply(
                    "👋 Gravity Claw online.\n\n" +
                    "Send me a message and I'll think it through with Claude.\n" +
                    "Use /reset to clear the conversation history.\n" +
                    "Use /help to see available commands."
                );
            }
        });

        // ── /help ────────────────────────────────────────────────────────────────
        this.bot.command("help", async (ctx) => {
            const isGroup = this.isGroupChat(ctx.chat.type);

            if (isGroup) {
                await ctx.reply(
                    "*Gravity Claw — Group Commands*\n\n" +
                    "/start — Activate the agent in this group\n" +
                    "/group — Configure group settings (admin only)\n" +
                    "/voice — Manage voice settings\n" +
                    "/help — Show this message\n\n" +
                    `_Mention @${this.botUsername} in your messages to interact._`,
                    { parse_mode: "Markdown" }
                );
            } else {
                await ctx.reply(
                    "*Gravity Claw — Commands*\n\n" +
                    "/start — Wake up the agent\n" +
                    "/reset — Clear conversation history\n" +
                    "/voice — Manage voice settings\n" +
                    "/help — Show this message\n\n" +
                    "_Just send any message to talk to Claude._",
                    { parse_mode: "Markdown" }
                );
            }
        });

        // ── /reset ───────────────────────────────────────────────────────────────
        this.bot.command("reset", async (ctx) => {
            const chatId = ctx.chat.id.toString();
            const sessionId = this.getSessionIdForChat(chatId, ctx.chat.type);

            const { clearHistory } = await import("../llm/orchestrator.ts");
            clearHistory(sessionId, orchestratorDeps);

            // Generate a fresh session ID for private chats to break any transient local state
            if (!this.isGroupChat(ctx.chat.type)) {
                this.sessionIdsPerChat.set(chatId, `telegram-${chatId}-${Date.now()}`);
            }

            await ctx.reply("🧹 Conversation history cleared. I'm ready for a fresh start!");
        });
        this.bot.command("group", async (ctx) => {
            const isGroup = this.isGroupChat(ctx.chat.type);

            if (!isGroup) {
                await ctx.reply("⚠️ This command is only available in groups.");
                return;
            }

            const userId = ctx.from?.id;
            const chatId = ctx.chat.id;

            if (!userId) {
                await ctx.reply("⚠️ Could not identify user.");
                return;
            }

            // Check if user is admin
            const isAdmin = await this.checkAndCacheAdmin(chatId, userId);
            if (!isAdmin) {
                await ctx.reply("⚠️ This command is only available to group administrators.");
                return;
            }

            const messageText = ctx.message?.text ?? "";
            const args = messageText.split(" ").slice(1);
            const subcommand = args[0]?.toLowerCase();

            if (!subcommand) {
                // Show current settings
                const settings = getGroupSettings("telegram", chatId.toString());
                await ctx.reply(
                    "*Group Settings*\n\n" +
                    `📍 Voice Mode: ${settings.voiceMode}\n` +
                    `🧠 Thinking Level: ${settings.thinkingLevel}\n` +
                    `🎙️ TTS Provider: ${settings.ttsProvider}\n` +
                    `🔧 Disabled Tools: ${settings.disabledTools.length > 0 ? settings.disabledTools.join(", ") : "none"}\n\n` +
                    "Use `/group voice off|transcribe-only|full-voice` to change voice mode\n" +
                    "Use `/group thinking off|low|medium|high` to change thinking level\n" +
                    "Use `/group tts openai|elevenlabs` to change TTS provider",
                    { parse_mode: "Markdown" }
                );
                return;
            }

            if (subcommand === "voice") {
                const mode = args[1]?.toLowerCase();
                if (!mode || !["off", "transcribe-only", "full-voice"].includes(mode)) {
                    await ctx.reply(
                        "*Group Voice Mode*\n\n" +
                        "Usage: /group voice <mode>\n" +
                        "Modes: off | transcribe-only | full-voice",
                        { parse_mode: "Markdown" }
                    );
                    return;
                }

                updateGroupSettings("telegram", chatId.toString(), {
                    voiceMode: mode as any,
                });

                const emoji = mode === "off" ? "🔇" : mode === "transcribe-only" ? "🎤" : "🔊";
                await ctx.reply(`${emoji} Group voice mode set to: ${mode}`);
                return;
            }

            if (subcommand === "thinking") {
                const level = args[1]?.toLowerCase();
                if (!level || !["off", "low", "medium", "high"].includes(level)) {
                    await ctx.reply(
                        "*Group Thinking Level*\n\n" +
                        "Usage: /group thinking <level>\n" +
                        "Levels: off | low | medium | high",
                        { parse_mode: "Markdown" }
                    );
                    return;
                }

                updateGroupSettings("telegram", chatId.toString(), {
                    thinkingLevel: level as any,
                });

                await ctx.reply(`🧠 Group thinking level set to: ${level}`);
                return;
            }

            if (subcommand === "tts") {
                const provider = args[1]?.toLowerCase();
                if (!provider || !["openai", "elevenlabs"].includes(provider)) {
                    await ctx.reply(
                        "*Group TTS Provider*\n\n" +
                        "Usage: /group tts <provider>\n" +
                        "Providers: openai | elevenlabs",
                        { parse_mode: "Markdown" }
                    );
                    return;
                }

                updateGroupSettings("telegram", chatId.toString(), {
                    ttsProvider: provider as any,
                });

                await ctx.reply(`🎙️ Group TTS provider set to: ${provider}`);
                return;
            }

            await ctx.reply(
                "Unknown subcommand. Use `/group` to see current settings.",
                { parse_mode: "Markdown" }
            );
        });

        // ── /voice ───────────────────────────────────────────────────────────────
        this.bot.command("voice", async (ctx) => {
            const messageText = ctx.message?.text ?? ctx.update.message?.text ?? '';
            const args = messageText.split(" ").slice(1) ?? [];
            const subcommand = args[0]?.toLowerCase();

            if (subcommand === "mode") {
                const mode = args[1]?.toLowerCase();
                if (!mode || !["off", "transcribe-only", "full-voice"].includes(mode)) {
                    await ctx.reply(
                        "*Voice Mode Usage*\n\n" +
                        "/voice mode off — Disable voice completely\n" +
                        "/voice mode transcribe-only — Transcribe incoming voice messages only\n" +
                        "/voice mode full-voice — Transcribe input and speak output",
                        { parse_mode: "Markdown" }
                    );
                    return;
                }

                // Store voice mode in context for this chat
                const chatId = ctx.chat.id.toString();
                if (!this.voiceModesPerChat) this.voiceModesPerChat = new Map();
                this.voiceModesPerChat.set(chatId, mode as any);

                const emoji = mode === "off" ? "🔇" : mode === "transcribe-only" ? "🎤" : "🔊";
                await ctx.reply(`${emoji} Voice mode set to: ${mode}`);
                return;
            }

            if (subcommand === "provider") {
                const provider = args[1]?.toLowerCase();
                if (!provider || !["openai", "elevenlabs"].includes(provider)) {
                    await ctx.reply(
                        "*TTS Provider Usage*\n\n" +
                        "/voice provider openai — Use OpenAI TTS\n" +
                        "/voice provider elevenlabs — Use ElevenLabs TTS",
                        { parse_mode: "Markdown" }
                    );
                    return;
                }

                const chatId = ctx.chat.id.toString();
                if (!this.ttsProviersPerChat) this.ttsProviersPerChat = new Map();
                this.ttsProviersPerChat.set(chatId, provider as any);

                await ctx.reply(`🎙️ TTS provider set to: ${provider}`);
                return;
            }

            // Show current status
            const chatId = ctx.chat.id.toString();
            const mode = this.voiceModesPerChat?.get(chatId) || "off";
            const provider = this.ttsProviersPerChat?.get(chatId) || "openai";

            await ctx.reply(
                "*Voice Settings*\n\n" +
                `📍 Mode: ${mode}\n` +
                `🎙️ TTS: ${provider}\n\n` +
                `Use /help to see available voice commands.`,
                { parse_mode: "Markdown" }
            );
        });

        // ── Message handler ──────────────────────────────────────────────────────
        this.bot.on("message:text", async (ctx) => {
            const isGroup = this.isGroupChat(ctx.chat.type);
            const chatId = ctx.chat.id.toString();
            let text = ctx.message.text;

            // In group chats, only respond when bot is mentioned
            if (isGroup) {
                if (!isBotMentioned(text, this.botUsername)) {
                    return; // Ignore messages that don't mention the bot
                }
                // Remove bot mention from text
                text = removeBotMention(text, this.botUsername);
            }

            // Get appropriate session ID
            const sessionId = this.getSessionIdForChat(chatId, ctx.chat.type);

            const msg: UnifiedMessage = {
                channelId: this.id,
                chatId: chatId,
                userId: ctx.from?.id.toString(),
                text: text,
                sessionId: sessionId,
                isGroup: isGroup,
                platform: "telegram",
                groupId: isGroup ? chatId : undefined,
            };

            await onMessage(msg);
        });

        // ── Voice message handler ────────────────────────────────────────────────
        this.bot.on("message:voice", async (ctx) => {
            try {
                const isGroup = this.isGroupChat(ctx.chat.type);
                const chatId = ctx.chat.id.toString();

                // In group chats, check voice mode from group settings
                let voiceMode: string;
                if (isGroup) {
                    const settings = getGroupSettings("telegram", chatId);
                    voiceMode = settings.voiceMode;
                } else {
                    voiceMode = this.voiceModesPerChat.get(chatId) || "off";
                }

                // Skip voice processing if voice mode is off
                if (voiceMode === "off") {
                    await ctx.reply("🔇 Voice messages are disabled. Use `/voice mode transcribe-only` to enable.");
                    return;
                }

                if (!this.transcriptionService) {
                    await ctx.reply("⚠️ Voice transcription is not configured (OpenAI API key missing)");
                    return;
                }

                await ctx.reply("🎤 Transcribing your voice message...");

                const voiceMessage = ctx.message.voice;
                const tempFilePath = await this.downloadTelegramFile(voiceMessage.file_id);

                try {
                    const transcribedText = await this.transcriptionService.transcribeAudio(tempFilePath);

                    log.info(`Transcribed voice message: ${transcribedText.substring(0, 100)}...`);

                    // Get appropriate session ID
                    const sessionId = this.getSessionIdForChat(chatId, ctx.chat.type);

                    const msg: UnifiedMessage = {
                        channelId: this.id,
                        chatId: chatId,
                        userId: ctx.from?.id.toString(),
                        text: transcribedText,
                        sessionId: sessionId,
                        isGroup: isGroup,
                        platform: "telegram",
                        groupId: isGroup ? chatId : undefined,
                    };

                    await onMessage(msg);
                } finally {
                    // Clean up temp file
                    try {
                        unlinkSync(tempFilePath);
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : String(e);
                        log.warn(`Failed to cleanup temp file ${tempFilePath}: ${msg}`);
                    }
                }
            } catch (error) {
                log.error("Voice message processing failed:", error);
                const message = error instanceof Error ? error.message : String(error);
                await ctx.reply(`❌ Transcription failed: ${message}`);
            }
        });

        this.bot.catch((err) => {
            log.error("grammy error", err.error);
        });

        log.info("Starting Telegram long-polling…");
        this.bot.start({
            onStart: (info) => {
                this.botUsername = info.username;
                log.info(`✅ Telegram Bot online — @${info.username}`);

                // Update all group settings with bot username
                updateGroupSettings("telegram", "*", { botUsername: info.username });
            },
        }).catch((err) => {
            log.error("Telegram long-polling failed:", err);
        });
    }

    async stop(): Promise<void> {
        log.info("Stopping Telegram channel…");
        await this.bot.stop();
    }

    async sendMessage(chatId: string, text: string, sessionId?: string): Promise<void> {
        // ── Helpers ─────────────────────────────────────────────────────────────

        /** Escape all MarkdownV2 special chars OUTSIDE of pre/code blocks */
        const escMdV2 = (s: string) =>
            s.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`);

        /** Split a string into chunks at natural line-break boundaries, max `limit` chars each */
        const chunkText = (s: string, limit = 4000): string[] => {
            if (s.length <= limit) return [s];
            const chunks: string[] = [];
            let remaining = s;
            while (remaining.length > 0) {
                if (remaining.length <= limit) { chunks.push(remaining); break; }
                // Try to split at last newline within limit
                const slice = remaining.substring(0, limit);
                const breakAt = slice.lastIndexOf("\n");
                const cutAt = breakAt > 0 ? breakAt + 1 : limit;
                chunks.push(remaining.substring(0, cutAt));
                remaining = remaining.substring(cutAt);
            }
            return chunks;
        };

        /**
         * Build a MarkdownV2-safe version of the text:
         * - Keeps ``` code blocks ``` as proper MarkdownV2 pre-blocks
         * - Keeps `inline code` as proper MarkdownV2 inline code
         * - Escapes everything else
         */
        const buildMdV2 = (raw: string): string => {
            // Split on triple-backtick blocks first, then handle inline backticks
            const parts = raw.split(/(```[\s\S]*?```)/g);
            return parts.map((part) => {
                if (part.startsWith("```")) {
                    // Extract language hint and body
                    const inner = part.slice(3, -3);
                    const firstLine = inner.indexOf("\n");
                    const body = firstLine >= 0 ? inner.substring(firstLine + 1) : inner;
                    // Escape backticks in body only (not the wrapper ones)
                    const safeBody = body.replace(/`/g, "\\`");
                    return "```\n" + safeBody + "\n```";
                }
                // Handle inline code and escape everything else
                const inlineParts = part.split(/(`[^`]+`)/g);
                return inlineParts.map((p) => {
                    if (p.startsWith("`") && p.endsWith("`")) {
                        const code = p.slice(1, -1).replace(/`/g, "\\`");
                        return "`" + code + "`";
                    }
                    return escMdV2(p);
                }).join("");
            }).join("");
        };

        /**
         * Build an HTML-safe version of the text:
         * - Keeps ``` code blocks ``` as <pre>...</pre>
         * - Keeps `inline code` as <code>...</code>
         * - Converts **bold** to <b>bold</b>
         * - Converts *italic* to <i>italic</i>
         * - Converts _underline_ to <u>underline</u>
         * - Escapes HTML special characters
         */
        const buildHtml = (raw: string): string => {
            const escHtml = (s: string): string => 
                s.replace(/&/g, "&amp;")
                 .replace(/</g, "&lt;")
                 .replace(/>/g, "&gt;")
                 .replace(/"/g, "&quot;")
                 .replace(/'/g, "&#39;");

            const parts = raw.split(/(```[\s\S]*?```)/g);
            return parts.map((part) => {
                if (part.startsWith("```")) {
                    const inner = part.slice(3, -3);
                    const firstLine = inner.indexOf("\n");
                    const body = firstLine >= 0 ? inner.substring(firstLine + 1) : inner;
                    const safeBody = escHtml(body);
                    return "<pre>" + safeBody + "</pre>";
                }
                const inlineParts = part.split(/(`[^`]+`)/g);
                return inlineParts.map((p) => {
                    if (p.startsWith("`") && p.endsWith("`")) {
                        const code = p.slice(1, -1);
                        return "<code>" + escHtml(code) + "</code>";
                    }
                    let result = escHtml(p);
                    result = result.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
                    result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<i>$1</i>");
                    result = result.replace(/_([^_]+)_/g, "<u>$1</u>");
                    result = result.replace(/~([^~]+)~/g, "<s>$1</s>");
                    return result;
                }).join("");
            }).join("");
        };

        /** Send one chunk with 3-tier fallback: HTML → MarkdownV2 → plain text */
        const sendChunk = async (chunk: string): Promise<void> => {
            // 1. Try HTML (most reliable and feature-rich)
            try {
                await this.bot.api.sendMessage(chatId, buildHtml(chunk), { parse_mode: "HTML" });
                return;
            } catch (e1) {
                log.warn(`HTML send failed, trying MarkdownV2: ${e1 instanceof Error ? e1.message : e1}`);
            }
            // 2. Try MarkdownV2
            try {
                await this.bot.api.sendMessage(chatId, buildMdV2(chunk), { parse_mode: "MarkdownV2" });
                return;
            } catch (e2) {
                log.warn(`MarkdownV2 send failed, trying plain text: ${e2 instanceof Error ? e2.message : e2}`);
            }
            // 3. Last resort: plain text (strip all formatting)
            const plain = chunk.replace(/```[\s\S]*?```/g, (m) => m.slice(3, -3).trim())
                .replace(/`([^`]+)`/g, "$1")
                .replace(/[*_~<>\[\]]/g, "");
            await this.bot.api.sendMessage(chatId, plain);
        };

        // ── Send text (chunked if long) ──────────────────────────────────────────
        const chunks = chunkText(text, 4000);
        for (const chunk of chunks) {
            await sendChunk(chunk);
        }

        // ── Optional TTS voice reply ─────────────────────────────────────────────
        const voiceMode = this.voiceModesPerChat.get(chatId) || "off";
        if (voiceMode !== "off") {
            try {
                const audioBuffer = await this.textToSpeech(text, sessionId);
                if (audioBuffer && audioBuffer.length > 0) {
                    const tempPath = join(tmpdir(), `tts-${Date.now()}.mp3`);
                    writeFileSync(tempPath, audioBuffer);
                    try {
                        await this.bot.api.sendVoice(chatId, tempPath);
                        log.info(`Voice message sent for: ${text.substring(0, 50)}...`);
                    } finally {
                        try { 
                            unlinkSync(tempPath); 
                        } catch (cleanupError) {
                            log.warn(`Failed to clean up temp file: ${tempPath}`, { error: String(cleanupError) });
                        }
                    }
                }
            } catch (error) {
                log.error("Failed to send voice response:", error);
            }
        }
    }


    async sendTyping(chatId: string): Promise<void> {
        await this.bot.api.sendChatAction(chatId, "typing").catch((err) => { 
            log.debug(`Failed to send typing indicator: ${err}`); 
        });
    }
}
