import type { Channel, UnifiedMessage } from "../../types/channels.js";
import { vi } from "vitest";

export class MockChannel implements Channel {
  public id: string;
  public preferredFormat: "markdown" | "html" | "plaintext" | "whatsapp" = "plaintext";
  
  public messagesSent: { chatId: string; text: string; sessionId?: string }[] = [];
  public typingSent: string[] = [];
  public isStarted = false;
  
  public onMessageCallback?: (msg: UnifiedMessage) => Promise<void>;

  constructor(id = "mock-channel", preferredFormat: "markdown" | "html" | "plaintext" | "whatsapp" = "plaintext") {
    this.id = id;
    this.preferredFormat = preferredFormat;
  }

  async start(onMessage: (msg: UnifiedMessage) => Promise<void>): Promise<void> {
    this.isStarted = true;
    this.onMessageCallback = onMessage;
  }

  async stop(): Promise<void> {
    this.isStarted = false;
  }

  async sendMessage(chatId: string, text: string, sessionId: string = ""): Promise<void> {
    this.messagesSent.push({ chatId, text, sessionId });
  }

  async sendTyping(chatId: string): Promise<void> {
    this.typingSent.push(chatId);
  }

  // Test helpers
  
  /** Simulate receiving a message from the platform */
  async simulateIncomingMessage(msg: Partial<UnifiedMessage> & { text: string; chatId: string }): Promise<void> {
    if (!this.isStarted || !this.onMessageCallback) {
      throw new Error(`Cannot simulate message on channel ${this.id} before it is started`);
    }
    
    await this.onMessageCallback({
      channelId: this.id,
      userId: msg.userId || "mock-user",
      sessionId: msg.sessionId || "",
      isGroup: msg.isGroup,
      platform: msg.platform,
      groupId: msg.groupId,
      ...msg
    });
  }
  
  clear() {
    this.messagesSent = [];
    this.typingSent = [];
  }
}
