import type { Message } from "../types/llm.js";

export type { Message, MessageRole } from "../types/llm.js";

export interface MessageLookup {
    toolResultByToolUseID: Map<string, string>;
    siblingToolUseIDs: Map<string, string[]>;
    resolvedToolUseIDs: Set<string>;
    erroredToolUseIDs: Set<string>;
}

export function createMessageLookup(messages: Message[]): MessageLookup {
    const toolResultByToolUseID = new Map<string, string>();
    const siblingToolUseIDs = new Map<string, string[]>();
    const resolvedToolUseIDs = new Set<string>();
    const erroredToolUseIDs = new Set<string>();

    let currentSiblingList: string[] = [];

    for (const message of messages) {
        const role = message.role;

        if (role === "assistant") {
            currentSiblingList = [];

            const content = message.content;
            if (Array.isArray(content)) {
                for (const block of content) {
                    if (block.type === "tool_use") {
                        const toolUseId = block.id;
                        if (toolUseId) {
                            currentSiblingList.push(toolUseId);
                            siblingToolUseIDs.set(toolUseId, [...currentSiblingList]);
                        }
                    }
                }
            }
        } else if (role === "tool") {
            const toolCallId = (message as any).toolCallId;
            const toolUseId = (message as any).tool_use_id;

            if (toolCallId) {
                toolResultByToolUseID.set(toolCallId, toolCallId);
            }
            if (toolUseId) {
                toolResultByToolUseID.set(toolUseId, toolCallId ?? "");

                const isError = (message as any).is_error;
                if (isError) {
                    erroredToolUseIDs.add(toolUseId);
                } else {
                    resolvedToolUseIDs.add(toolUseId);
                }
            }
        }
    }

    return {
        toolResultByToolUseID,
        siblingToolUseIDs,
        resolvedToolUseIDs,
        erroredToolUseIDs,
    };
}

export function isToolUseRequestMessage(message: Message): boolean {
    const content = message.content;
    if (Array.isArray(content)) {
        return content.some((block) => block.type === "tool_use");
    }
    return false;
}

export function isToolResultMessage(message: Message): boolean {
    return message.role === "tool";
}

export function getToolUseIDs(message: Message): string[] {
    const ids: string[] = [];
    const content = message.content;

    if (Array.isArray(content)) {
        for (const block of content) {
            if (block.type === "tool_use" && block.id) {
                ids.push(block.id);
            }
        }
    }

    return ids;
}

export function getToolResultID(message: Message): string | undefined {
    return (message as any).tool_use_id ?? (message as any).toolCallId;
}

export function getSiblingToolUseIDs(message: Message, lookup: MessageLookup): string[] {
    const toolUseIds = getToolUseIDs(message);
    if (toolUseIds.length === 0) return [];

    const firstId = toolUseIds[0];
    if (!firstId) return toolUseIds;
    return lookup.siblingToolUseIDs.get(firstId) ?? toolUseIds;
}

export function getAllSiblingIDs(message: Message, lookup: MessageLookup): string[] {
    return getSiblingToolUseIDs(message, lookup);
}

export function isMessageResolved(message: Message, lookup: MessageLookup): boolean {
    const toolUseIds = getToolUseIDs(message);
    if (toolUseIds.length === 0) return true;

    for (const id of toolUseIds) {
        if (!lookup.resolvedToolUseIDs.has(id)) {
            return false;
        }
    }
    return true;
}

export function isMessageErrored(message: Message, lookup: MessageLookup): boolean {
    const toolUseIds = getToolUseIDs(message);
    if (toolUseIds.length === 0) return false;

    for (const id of toolUseIds) {
        if (lookup.erroredToolUseIDs.has(id)) {
            return true;
        }
    }
    return false;
}

export const SYNTHETIC_MODEL = "<synthetic>";

export const SYNTHETIC_MESSAGES = new Set([
    "[Old tool result content cleared]",
    "Context window limit - conversation compacted",
]);

export function isSyntheticMessage(message: Message): boolean {
    const content = message.content;
    if (typeof content !== "string") return false;
    return SYNTHETIC_MESSAGES.has(content.trim());
}

export function normalizeMessages(messages: Message[]): Message[] {
    const normalized: Message[] = [];

    for (const message of messages) {
        const content = message.content;

        if (Array.isArray(content)) {
            const hasMultipleBlocks = content.length > 1;

            if (!hasMultipleBlocks) {
                normalized.push(message);
                continue;
            }

            for (const block of content) {
                normalized.push({
                    ...message,
                    content: block as any,
                });
            }
            continue;
        }

        normalized.push(message);
    }

    return normalized;
}