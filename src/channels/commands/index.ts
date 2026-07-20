import type { Channel, UnifiedMessage } from "../../types/channels.js";

export interface CommandContext {
  msg: UnifiedMessage;
  channel: Channel;
  sessionId: string;
}

export type CommandHandler = (ctx: CommandContext) => Promise<boolean>;

export interface Command {
  pattern: RegExp;
  handler: CommandHandler;
  description?: string;
}

export interface CommandModule {
  pattern: RegExp;
  handler: CommandHandler;
}
