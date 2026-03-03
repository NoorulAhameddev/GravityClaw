export interface UnifiedMessage {
  channelId: string;
  chatId: string;
  userId?: string | undefined;
  text: string;
  sessionId?: string | undefined;
  isGroup?: boolean | undefined;
  platform?: string | undefined;
  groupId?: string | undefined;
}

export interface Channel {
  id: string;
  start(onMessage: (msg: UnifiedMessage) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
  sendMessage(chatId: string, text: string): Promise<void>;
  sendTyping?(chatId: string): Promise<void>;
  preferredFormat?: "markdown" | "html" | "plaintext" | "whatsapp";
}
