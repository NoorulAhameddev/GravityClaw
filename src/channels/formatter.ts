import { createLogger } from "../logger.ts";

const log = createLogger("formatter");

export type FormatType = "markdown" | "html" | "plaintext" | "whatsapp";

export interface FormattingOptions {
    bold?: boolean;
    italic?: boolean;
    code?: boolean;
    link?: string;
}

/**
 * Utility to format text consistently across different messaging platforms.
 */
export class OutputFormatter {
    /**
     * Formats a message based on the target channel's capabilities.
     * @param text The raw text (markdown-flavored)
     * @param target The target format type
     */
    static format(text: string, target: FormatType): string {
        switch (target) {
            case "whatsapp":
                return this.toWhatsApp(text);
            case "plaintext":
                return this.toPlaintext(text);
            case "html":
                return this.toHTML(text);
            case "markdown":
            default:
                return text; // Default is assumed to be markdown (Telegram/WebChat style)
        }
    }

    /**
     * Converts standard Markdown to WhatsApp's limited formatting.
     * *text* -> *text* (bold)
     * _text_ -> _text_ (italic)
     * `text` -> ```text``` (monospaced)
     * ~text~ -> ~text~ (strikethrough)
     */
    private static toWhatsApp(text: string): string {
        return text
            // Handle bold (markdown ** or __ to whatsapp *)
            .replace(/\*\*(.*?)\*\*/g, "*$1*")
            .replace(/__(.*?)__/g, "_$1_")
            // Handle code blocks/inline code
            .replace(/`(.*?)`/g, "```$1```")
            // Remove complex markdown links [text](url) -> text (url)
            .replace(/\[(.*?)\]\((.*?)\)/g, "$1 ($2)")
            // Remove headers
            .replace(/^#+\s+(.*)$/gm, "*$1*");
    }

    /**
     * Strips all formatting for plaintext-only channels.
     */
    private static toPlaintext(text: string): string {
        return text
            .replace(/\*\*(.*?)\*\*/g, "$1")
            .replace(/__(.*?)__/g, "$1")
            .replace(/\*(.*?)\*/g, "$1")
            .replace(/_(.*?)_/g, "$1")
            .replace(/`(.*?)`/g, "$1")
            .replace(/\[(.*?)\]\((.*?)\)/g, "$1 ($2)")
            .replace(/^#+\s+/gm, "");
    }

    /**
     * Simple Markdown to HTML conversion for Web/MCP.
     */
    private static toHTML(text: string): string {
        return text
            .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
            .replace(/__(.*?)__/g, "<i>$1</i>")
            .replace(/`(.*?)`/g, "<code>$1</code>")
            .replace(/\n/g, "<br>");
    }
}
