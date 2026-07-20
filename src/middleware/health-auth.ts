import type { Request, Response, NextFunction } from "express";
import { config } from "../config.ts";
import { constantTimeEquals } from "./auth.ts";

/**
 * Health check authentication middleware.
 *
 * Allows unauthenticated health checks from any source when
 * HEALTH_ALLOW_UNAUTHENTICATED is true. In production with
 * API_KEY set, requires either a valid API key or the
 * health-specific API key (HEALTH_API_KEY).
 *
 * This enables Docker HEALTHCHECK, Kubernetes liveness probes,
 * and monitoring systems to check health without the main API key.
 */
export function healthAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
    const apiKey = req.headers["x-api-key"] as string | undefined;
    const healthApiKey = config.HEALTH_API_KEY;

    // If a health-specific API key is configured, allow it
    if (healthApiKey && apiKey && constantTimeEquals(apiKey, healthApiKey)) {
        next();
        return;
    }

    // Allow the main API key to check health
    if (config.API_KEY && apiKey && constantTimeEquals(apiKey, config.API_KEY)) {
        next();
        return;
    }

    // In development, allow unauthenticated health checks
    if (process.env.NODE_ENV !== "production") {
        next();
        return;
    }

    // In production with no API key configured, service is not available
    if (!config.API_KEY && !healthApiKey) {
        res.status(503).json({
            status: "error",
            message: "Service not configured",
        });
        return;
    }

    // Health check without auth is allowed by default for monitoring
    // This is safe because health endpoint only returns non-sensitive system status
    if (!config.HEALTH_REQUIRE_AUTH) {
        next();
        return;
    }

    // Auth required for health checks
    res.status(401).json({
        status: "error",
        message: "Authentication required. Set X-Api-Key header or configure HEALTH_API_KEY.",
    });
}
