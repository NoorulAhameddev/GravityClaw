import { Client, GatewayIntentBits, ChannelType, SlashCommandBuilder, REST, Routes, EmbedBuilder, Message } from "discord.js";
import { config } from "../config.ts";
import { createLogger } from "../logger.ts";
import { db } from "../db.ts";
import type { Channel, UnifiedMessage } from "../types/channels.js";
import type { OrchestratorDependencies } from "../llm/orchestrator.ts";

const log = createLogger("discord");

const orchestratorDeps: OrchestratorDependencies = { db, config };

export class DiscordChannel implements Channel {
    public id = "discord";
    private client: Client;
    private messageHandler: ((msg: UnifiedMessage) => Promise<void>) | null = null;
    private guildCommands: Map<string, string> = new Map();
    private staticEnabled: boolean = false;

    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages,
            ],
        });
    }

    static create(): DiscordChannel | null {
        if (!config.DISCORD_BOT_TOKEN) {
            log.warn("DISCORD_BOT_TOKEN not set, skipping Discord channel");
            return null;
        }
        return new DiscordChannel();
    }

    async initialize(): Promise<void> {
        this.client.on("ready", async () => {
            log.info(`✅ Discord Bot online — ${this.client.user?.tag}`);
            await this.registerSlashCommands();
        });

        this.client.on("guildCreate", async (guild) => {
            log.info(`Joined guild: ${guild.name} (${guild.id})`);
            await this.registerGuildCommands(guild);
        });

        this.client.on("messageCreate", async (message: Message) => {
            await this.handleMessage(message);
        });

        this.client.on("interactionCreate", async (interaction) => {
            if (!interaction.isChatInputCommand()) return;
            await this.handleSlashCommand(interaction);
        });

        this.client.on("error", (error) => {
            log.error("Discord client error:", error);
        });
    }

    private async registerSlashCommands(): Promise<void> {
        if (!config.DISCORD_GUILD_ID) {
            log.info("DISCORD_GUILD_ID not set, skipping global command registration");
            return;
        }

        const rest = new REST({ version: "10" }).setToken(config.DISCORD_BOT_TOKEN!);

        const commands = [
            new SlashCommandBuilder()
                .setName("chat")
                .setDescription("Send a message to Gravity Claw")
                .addStringOption((option) =>
                    option.setName("message").setDescription("Your message").setRequired(true)
                ),
            new SlashCommandBuilder()
                .setName("reset")
                .setDescription("Clear conversation history"),
            new SlashCommandBuilder()
                .setName("status")
                .setDescription("Show system status"),
        ];

        try {
            await rest.put(
                Routes.applicationGuildCommands(this.client.user!.id, config.DISCORD_GUILD_ID),
                { body: commands }
            );
            log.info(`Registered slash commands for guild ${config.DISCORD_GUILD_ID}`);
        } catch (error) {
            log.error("Failed to register slash commands:", error);
        }
    }

    private async registerGuildCommands(guild: any): Promise<void> {
        const rest = new REST({ version: "10" }).setToken(config.DISCORD_BOT_TOKEN!);

        const commands = [
            new SlashCommandBuilder()
                .setName("chat")
                .setDescription("Send a message to Gravity Claw")
                .addStringOption((option) =>
                    option.setName("message").setDescription("Your message").setRequired(true)
                ),
            new SlashCommandBuilder()
                .setName("reset")
                .setDescription("Clear conversation history"),
            new SlashCommandBuilder()
                .setName("status")
                .setDescription("Show system status"),
        ];

        try {
            await rest.put(
                Routes.applicationGuildCommands(this.client.user!.id, guild.id),
                { body: commands }
            );
            log.info(`Registered slash commands for new guild ${guild.name}`);
        } catch (error) {
            log.error(`Failed to register commands for guild ${guild.name}:`, error);
        }
    }

    private async handleMessage(message: Message): Promise<void> {
        if (message.author.bot) return;
        if (!this.messageHandler) return;

        const isDirect = message.channel.type === ChannelType.DM;
        const chatId = message.channel.id;
        const userId = message.author.id;

        const msg: UnifiedMessage = {
            channelId: this.id,
            chatId: chatId,
            userId: userId,
            text: message.content,
            sessionId: isDirect ? `discord-${chatId}` : `discord-${message.guildId}-${chatId}`,
            isGroup: !isDirect,
            platform: "discord",
            groupId: !isDirect && message.guildId ? message.guildId : undefined,
        };

        await this.messageHandler(msg);
    }

    private async handleSlashCommand(interaction: any): Promise<void> {
        const commandName = interaction.commandName;
        const userId = interaction.user.id;
        const channelId = interaction.channelId;
        const guildId = interaction.guildId;

        if (commandName === "chat") {
            const messageText = interaction.options.getString("message");

            if (!this.messageHandler) {
                await interaction.reply("❌ Bot not initialized");
                return;
            }

            await interaction.deferReply();

            const msg: UnifiedMessage = {
                channelId: this.id,
                chatId: channelId,
                userId: userId,
                text: messageText,
                sessionId: guildId ? `discord-${guildId}-${channelId}` : `discord-${channelId}`,
                isGroup: !!guildId,
                platform: "discord",
                groupId: guildId || undefined,
            };

            try {
                await this.messageHandler(msg);
                await interaction.editReply("✅ Message sent to Gravity Claw");
            } catch (error) {
                const errMsg = error instanceof Error ? error.message : String(error);
                await interaction.editReply(`❌ Error: ${errMsg}`);
            }
            return;
        }

        if (commandName === "reset") {
            const sessionId = guildId ? `discord-${guildId}-${channelId}` : `discord-${channelId}`;
            const { clearHistory } = await import("../llm/orchestrator.ts");
            clearHistory(sessionId, orchestratorDeps);

            await interaction.reply("🧹 Conversation history cleared!");
            return;
        }

        if (commandName === "status") {
            await interaction.reply("📊 Use `/status` in your chat to see system status");
            return;
        }
    }

    async start(onMessage: (msg: UnifiedMessage) => Promise<void>): Promise<void> {
        this.messageHandler = onMessage;

        await this.initialize();

        return new Promise((resolve, reject) => {
            this.client.once("ready", () => {
                resolve();
            });

            this.client.on("disconnect", () => {
                log.warn("Discord client disconnected");
            });

            this.client.login(config.DISCORD_BOT_TOKEN!).catch((err) => {
                log.error("Failed to login to Discord:", err);
                reject(err);
            });
        });
    }

    async stop(): Promise<void> {
        log.info("Stopping Discord channel...");
        this.client.destroy();
    }

    async sendMessage(chatId: string, text: string): Promise<void> {
        try {
            const channel = await this.client.channels.fetch(chatId);
            if (!channel || !channel.isTextBased()) {
                log.error(`Channel ${chatId} not found or not text-based`);
                return;
            }

            const embed = new EmbedBuilder()
                .setDescription(text)
                .setColor(0x5865F2)
                .setTimestamp(new Date());

            if ("send" in channel && typeof channel.send === "function") {
                await channel.send({ embeds: [embed] });
            }
        } catch (error) {
            log.error(`Failed to send message to ${chatId}:`, error);
        }
    }

    async sendTyping(chatId: string): Promise<void> {
        try {
            const channel = await this.client.channels.fetch(chatId);
            if (channel && channel.isTextBased() && "sendTyping" in channel && typeof channel.sendTyping === "function") {
                await channel.sendTyping();
            }
        } catch (error) {
            log.error(`Failed to send typing indicator to ${chatId}:`, error);
        }
    }
}