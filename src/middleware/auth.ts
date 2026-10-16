import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config.ts';
import { createLogger } from '../logger.ts';
import { LRUCache } from '../utils/lru-cache.ts';

const log = createLogger('auth');

const API_KEY_HEADER = 'x-api-key';

// Allowlist for IPs that can bypass API key (comma-separated in config)
const LOCALHOST_ALLOWLIST = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', '0.0.0.0']);

// Trusted IP CIDRs for development (configure via config in production)
const TRUSTED_CIDRS = new Set<string>();
if (config.AUTH_TRUSTED_CIDRS) {
  config.AUTH_TRUSTED_CIDRS.split(',').forEach((cidr) => {
    TRUSTED_CIDRS.add(cidr.trim());
  });
}

const rateLimitMap = new LRUCache<string, { count: number; resetTime: number }>(10000);
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

function isInternalIp(clientIp: string): boolean {
  if (LOCALHOST_ALLOWLIST.has(clientIp)) {
    return true;
  }

  // Check trusted CIDRs
  for (const cidr of TRUSTED_CIDRS) {
    if (clientIp.startsWith(cidr) || cidr === clientIp) {
      return true;
    }
  }

  return false;
}

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
  role?: string;
  user?: { id: string; role: string };
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const apiKey = req.headers[API_KEY_HEADER] as string | undefined;
  const path = req.path;
  const method = req.method;
  const clientIp = req.ip || 'unknown';

  // Never infer authentication bypass from NODE_ENV. Localhost bypass must be
  // explicitly enabled, because browsers can initiate requests to loopback services.
  const allowLocalhostBypass = config.AUTH_ALLOW_LOCALHOST === true;

  if (!config.API_KEY) {
    log.warn(`SECURITY: No API_KEY configured - rejecting request: ${method} ${path}`);
    res.status(503).json({
      success: false,
      error: 'Service Unavailable',
      message: 'API key not configured. Server is not accepting requests.',
    });
    return;
  }

  if (!apiKey) {
    // Only allow localhost bypass if explicitly enabled
    if (allowLocalhostBypass && isInternalIp(clientIp)) {
      log.debug(`Allowing local request without API key (dev mode): ${method} ${path}`);
      req.role = 'admin';
      req.user = { id: 'localhost-dev', role: 'admin' };
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
      error: 'Unauthorized',
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
      error: 'Unauthorized',
      message: 'Invalid API key',
    });
    return;
  }

  req.apiKey = apiKey;
  // A shared API key represents one principal. Do not trust caller-controlled
  // identity or role headers for authorization or audit attribution.
  req.role = 'admin';
  req.user = {
    id: 'api-key-holder',
    role: 'admin',
  };
  log.debug(`Authenticated request: ${method} ${path}`);
  next();
}

export function constantTimeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  // Pad both buffers to the same length before comparing so the comparison
  // takes the same time regardless of whether lengths differ (eliminates
  // timing side-channel that would reveal the API key length).
  const maxLen = Math.max(aBuf.length, bBuf.length);
  const aPad = Buffer.concat([aBuf, Buffer.alloc(maxLen - aBuf.length)]);
  const bPad = Buffer.concat([bBuf, Buffer.alloc(maxLen - bBuf.length)]);
  const bytesEqual = crypto.timingSafeEqual(aPad, bPad);
  // Length must also match; checked after the fixed-time comparison.
  return bytesEqual && aBuf.length === bBuf.length;
}

export function optionalAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const apiKey = req.headers[API_KEY_HEADER] as string | undefined;

  if (!apiKey || !config.API_KEY) {
    delete req.apiKey;
    next();
    return;
  }

  if (constantTimeEquals(apiKey, config.API_KEY)) {
    req.apiKey = apiKey;
  } else {
    delete req.apiKey;
  }
  next();
}
