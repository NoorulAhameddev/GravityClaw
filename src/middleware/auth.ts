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
        log.warn(`SECURITY: No API_KEY configured - rejecting request: ${method} ${path}`);
        res.status(503).json({
            success: false,
            error: "Service Unavailable",
            message: "API key not configured. Server is not accepting requests.",
        });
        return;
    }

    if (!apiKey) {
        // Allow localhost without API key for easier development/testing
        const isLocalhost = clientIp === "127.0.0.1" || clientIp === "::1" || clientIp === "::ffff:127.0.0.1";
        if (isLocalhost) {
            log.debug(`Allowing local request without API key: ${method} ${path}`);
            next();
            return;
        }

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

    if (!constantTimeEquals(apiKey, config.API_KEY)) {
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

function constantTimeEquals(a: string, b: string): boolean {
    if (a.length !== b.length) {
        return false;
    }
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
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
