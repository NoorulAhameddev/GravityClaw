import type { Request, Response, NextFunction, RequestHandler } from "express";
import { createLogger } from "../logger.ts";
import { config } from "../config.ts";

const log = createLogger("express-error");

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
    log.error("Unhandled error", {
        error: err.message,
        stack: err.stack?.split("\n").slice(0, 5).join("\n"),
        path: req.path,
        method: req.method,
    });

    const statusCode = "statusCode" in err ? (err as { statusCode: number }).statusCode : 500;

    res.status(statusCode).json({
        success: false,
        error: {
            code: "INTERNAL_ERROR",
            message: config.NODE_ENV === "production"
                ? "Internal server error"
                : err.message,
        },
    });
}

export function asyncHandler(fn: (...args: any[]) => Promise<any>): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
