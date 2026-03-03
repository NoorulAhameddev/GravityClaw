import { mobileGateway } from "../gateway/mobile.ts";
import type { UnifiedMessage, Channel } from "../types/channels.js";
import { createLogger } from "../logger.ts";

const log = createLogger("mobile-channel");

/**
 * MobileChannel implements the Channel interface for iOS/Android companions.
 * It uses the MobileGateway to communicate via WebSockets.
 */
export class MobileChannel implements Channel {
    public id = "mobile";
    public preferredFormat: "markdown" = "markdown";
    private onMessageCb?: (msg: UnifiedMessage) => Promise<void>;

    async start(onMessage: (msg: UnifiedMessage) => Promise<void>): Promise<void> {
        this.onMessageCb = onMessage;
        log.info("Mobile channel initialized via gateway.");
        // The actual connection handling happens in MobileGateway.attach()
    }

    async stop(): Promise<void> {
        log.info("Stopping Mobile channel…");
    }

    async sendMessage(chatId: string, text: string): Promise<void> {
        const { OutputFormatter } = await import("./formatter.ts");
        const formattedText = OutputFormatter.format(text, this.preferredFormat);
        await mobileGateway.sendMessage(chatId, formattedText);
    }

    async sendTyping(chatId: string): Promise<void> {
        // Mobile companion might handle this via status updates
        await mobileGateway.requestAction(chatId, "gps_refresh"); // Example usage
    }
}
