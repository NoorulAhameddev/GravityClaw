export interface UnifiedMessage {
    channelId: string; // The channel identifier (e.g., 'telegram', 'whatsapp')
    chatId: string;    // The internal chat ID for the channel
    userId?: string;   // The sender's ID
    text: string;      // The text content of the message
    sessionId?: string; // Session ID (group-aware)
    isGroup?: boolean; // Whether this is a group chat
    platform?: string; // Platform name (telegram, whatsapp)
    groupId?: string;  // Group ID (if isGroup is true)
}

/**
 * All communication platforms (Telegram, WhatsApp, etc.) must implement this interface.
 */
export interface Channel {
    /** The unique identifier for this channel instance (e.g., 'telegram') */
    id: string;

    /** 
     * Starts the channel long-polling, webhook, or socket connection.
     * When a message is received, it should call `onMessage`.
     */
    start(onMessage: (msg: UnifiedMessage) => Promise<void>): Promise<void>;

    /** Gracefully stops the channel */
    stop(): Promise<void>;

    /** Sends a text message to the specified chat */
    sendMessage(chatId: string, text: string): Promise<void>;

    /** Sends a typing indicator (optional implement) */
    sendTyping?(chatId: string): Promise<void>;

    /** The preferred messaging format for this channel */
    preferredFormat?: "markdown" | "html" | "plaintext" | "whatsapp";
}
