import { z } from "zod";
import type { Request, Response, NextFunction } from "express";

export const toolsExecuteSchema = z.object({
    tool: z.string().min(1, "Tool name is required"),
    input: z.record(z.unknown()).optional(),
    sessionId: z.string().optional(),
    userId: z.string().optional(),
    approvalRequestId: z.string().optional(),
});

export const voiceSpeakSchema = z.object({
    text: z.string().min(1, "Text is required").max(4096),
    voice: z.string().optional().default("alloy"),
});

export const approvalCreateSchema = z.object({
    toolName: z.string().min(1, "Tool name is required"),
    parameters: z.record(z.unknown()).optional(),
    userId: z.string().min(1, "User ID is required"),
    sessionId: z.string().min(1, "Session ID is required"),
    channel: z.string().optional().default("api"),
});

export const approvalActionSchema = z.object({
    approver: z.string().min(1, "Approver is required"),
});

export const memoryQuerySchema = z.object({
    limit: z.coerce.number().min(1).max(200).default(50),
    session: z.string().optional(),
});

export const traceIdParamSchema = z.object({
    traceId: z.string().min(1, "Trace ID is required"),
});

export const exportDownloadQuerySchema = z.object({
    filename: z.string().optional().default("export.bin"),
    data: z.string().min(1, "Data parameter is required"),
    format: z.string().optional(),
});

export const webhookParamsSchema = z.object({
    session_id: z.string().min(1, "Session ID is required"),
    hook_name: z.string().min(1, "Hook name is required"),
});

export const approvalIdParamSchema = z.object({
    id: z.string().min(1, "Approval ID is required"),
});

export const approvalsListQuerySchema = z.object({
    sessionId: z.string().optional(),
});

export function validate<T extends z.ZodType>(
    schema: T,
    source: "body" | "query" | "params" | "all" = "body"
) {
    return (req: Request, res: Response, next: NextFunction) => {
        let data: unknown;

        if (source === "all") {
            data = { ...req.params, ...req.query, ...req.body };
        } else if (source === "params") {
            data = req.params;
        } else if (source === "query") {
            data = req.query;
        } else {
            data = req.body;
        }

        const result = schema.safeParse(data);

        if (!result.success) {
            const errors = result.error.errors.map(e => ({
                field: e.path.join("."),
                message: e.message,
            }));

            res.status(400).json({
                success: false,
                error: "Validation failed",
                details: errors,
            });
            return;
        }

        if (source === "all") {
            if (result.data) {
                Object.assign(req.params, (result.data as object));
            }
        }

        next();
    };
}

export function validateBody<T extends z.ZodType>(schema: T) {
    return validate(schema, "body");
}

export function validateQuery<T extends z.ZodType>(schema: T) {
    return validate(schema, "query");
}

export function validateParams<T extends z.ZodType>(schema: T) {
    return validate(schema, "params");
}
