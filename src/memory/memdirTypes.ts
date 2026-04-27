export type MemoryType = "user" | "feedback" | "project" | "reference";

export const MEMORY_TYPES = ["user", "feedback", "project", "reference"] as const;

export const MEMORY_TYPES_SECTION_INDIVIDUAL = {
    user: "User Information",
    feedback: "User Feedback",
    project: "Project Context",
    reference: "External References",
} as const;

export const MEMORY_TYPES_SECTION_COMBINED = "Relevant Memory";

export interface MemoryEntry {
    type: MemoryType;
    content: string;
    source?: string;
    createdAt?: string;
}

export function parseMemoryType(raw: unknown): MemoryType | undefined {
    if (typeof raw !== "string") return undefined;
    if (MEMORY_TYPES.includes(raw as MemoryType)) {
        return raw as MemoryType;
    }
    return undefined;
}