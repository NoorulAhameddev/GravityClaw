import { createLogger } from "../logger.ts";
import { db } from "../db.ts";
import { config } from "../config.ts";
import { loadFactsForPrompt } from "../memory/markdown.ts";
import type { Attachment, AttachmentContext, AttachmentOptions } from "./attachmentTypes.js";

const log = createLogger("attachments");

export async function buildAttachments(
    context: AttachmentContext,
    options: AttachmentOptions = {},
): Promise<Attachment[]> {
    const attachments: Attachment[] = [];

    if (options.includeTokenUsage ?? true) {
        const tokenUsage = await getTokenUsageAttachment(context.sessionId);
        if (tokenUsage) {
            attachments.push(tokenUsage);
        }
    }

    if (options.includeDateChange ?? false) {
        const dateChange = getDateChangeAttachment();
        if (dateChange) {
            attachments.push(dateChange);
        }
    }

    const mcpResources = await getMCPResourcesAttachment();
    if (mcpResources && options.includeMCPResources) {
        attachments.push(mcpResources);
    }

    const relevantFiles = await getAtMentionedFilesAttachment(context);
    if (relevantFiles) {
        attachments.push(relevantFiles);
    }

    attachments.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    return attachments;
}

async function getTokenUsageAttachment(sessionId: string): Promise<Attachment | null> {
    try {
        const stats = db
            .prepare(
                `
                SELECT 
                    SUM(CAST(json_extract(message_json, '$.usage.prompt_tokens') AS INTEGER)) as prompt_tokens,
                    SUM(CAST(json_extract(message_json, '$.usage.completion_tokens') AS INTEGER)) as completion_tokens
                FROM memory
                WHERE session_id = ? AND message_json LIKE '%usage%'
                `,
            )
            .get(sessionId) as { prompt_tokens: number; completion_tokens: number } | undefined;

        if (!stats || !stats.prompt_tokens) {
            return null;
        }

        const total = stats.prompt_tokens + stats.completion_tokens;
        const pct = Math.round((total / 200000) * 100);

        return {
            type: "token_usage",
            content: `Token usage: ${total.toLocaleString()} / 200,000 (${pct}%)`,
            priority: 90,
        };
    } catch (e) {
        log.debug(`Token usage not available: ${e}`);
        return null;
    }
}

function getDateChangeAttachment(): Attachment | null {
    const now = new Date();
    const lastMidnight = new Date(now);
    lastMidnight.setHours(0, 0, 0, 0);

    const stored = db
        .prepare("SELECT value FROM state WHERE key = ?")
        .get("last_date") as { value: string } | undefined;

    if (stored) {
        const lastDate = new Date(stored.value);
        if (lastDate.toDateString() !== now.toDateString()) {
            db.prepare("INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)").run(
                "last_date",
                now.toISOString(),
            );
            return {
                type: "date_change",
                content: `Date changed: ${lastDate.toLocaleDateString()} → ${now.toLocaleDateString()}`,
                priority: 100,
            };
        }
    }

    db.prepare("INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)").run(
        "last_date",
        now.toISOString(),
    );
    return null;
}

async function getMCPResourcesAttachment(): Promise<Attachment | null> {
    return null;
}

async function getAtMentionedFilesAttachment(
    context: AttachmentContext,
): Promise<Attachment | null> {
    const { sessionId } = context;

    try {
        const recentMessages = db
            .prepare(
                `
                SELECT message_json FROM memory
                WHERE session_id = ?
                ORDER BY id DESC
                LIMIT 5
                `,
            )
            .all(sessionId) as Array<{ message_json: string }>;

        const mentionedFiles = new Set<string>();

        for (const row of recentMessages) {
            const msg = JSON.parse(row.message_json);
            if (typeof msg.content === "string") {
                const matches = msg.content.match(/@[\w\/.-]+/g);
                if (matches) {
                    for (const match of matches) {
                        mentionedFiles.add(match.slice(1));
                    }
                }
            }
        }

        if (mentionedFiles.size === 0) {
            return null;
        }

        return {
            type: "at_mentioned_files",
            content: `Recent @mentions: ${Array.from(mentionedFiles).join(", ")}`,
            priority: 60,
        };
    } catch (e) {
        return null;
    }
}

export function formatAttachments(attachments: Attachment[]): string {
    if (attachments.length === 0) {
        return "";
    }

    return attachments
        .map((a) => a.content)
        .join("\n");
}