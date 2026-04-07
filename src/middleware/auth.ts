import type { Request, Response, NextFunction } from "express";
import { config } from "../config.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("auth");

const API_KEY_HEADER = "x-api-key";

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const record = rateLimitMap.get(ip);
    
    if (!record || now > record.resetTime) {
        rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
        return false;
    }
    
    if (record.count >= RATE_LIMIT_MAX_ATTEMPTS) {
        return true;
    }
    
    record.count++;
    return false;
}

export interface AuthenticatedRequest extends Request {
    apiKey?: string;
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    const apiKey = req.headers[API_KEY_HEADER] as string | undefined;
    const path = req.path;
    const method = req.method;
    const clientIp = req.ip || "unknown";

    if (!config.API_KEY) {
        log.debug(`No API_KEY configured - allowing request: ${method} ${path}`);
        next();
        return;
    }

    if (!apiKey) {
        if (!isRateLimited(clientIp)) {
            log.warn(`Unauthorized access attempt: ${method} ${path} - No API key provided`, {
                ip: clientIp,
                method,
                path,
            });
        }
        res.status(401).json({
            success: false,
            error: "Unauthorized",
            message: "Missing API key. Provide 'X-Api-Key' header.",
        });
        return;
    }

    if (apiKey !== config.API_KEY) {
        if (!isRateLimited(clientIp)) {
            log.warn(`Unauthorized access attempt: ${method} ${path} - Invalid API key`, {
                ip: clientIp,
                method,
                path,
            });
        }
        res.status(401).json({
            success: false,
            error: "Unauthorized",
            message: "Invalid API key",
        });
        return;
    }

    req.apiKey = apiKey;
    log.debug(`Authenticated request: ${method} ${path}`);
    next();
}

export function optionalAuthMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    const apiKey = req.headers[API_KEY_HEADER] as string | undefined;

    if (!apiKey || !config.API_KEY) {
        delete req.apiKey;
        next();
        return;
    }

    if (apiKey === config.API_KEY) {
        req.apiKey = apiKey;
    } else {
        delete req.apiKey;
    }
    next();
}
