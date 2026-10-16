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
  sendToken?(chatId: string, token: string): Promise<void> | void;
  sendToolStart?(
    chatId: string,
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<void> | void;
  sendToolEnd?(
    chatId: string,
    toolName: string,
    success: boolean,
    result?: string,
    durationMs?: number,
  ): Promise<void> | void;
  preferredFormat?: 'markdown' | 'html' | 'plaintext' | 'whatsapp';
}
