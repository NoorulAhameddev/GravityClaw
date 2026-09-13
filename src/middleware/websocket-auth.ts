import jwt from 'jsonwebtoken';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import { config } from '../config.ts';
import { createLogger } from '../logger.ts';
import { constantTimeEquals } from './auth.ts';
import crypto from 'crypto';

const logger = createLogger('websocket-auth');

export interface AuthenticatedSocket {
  isAuthenticated: boolean;
  sessionId: string;
  userId?: string | undefined;
  platform?: string | undefined;
  authTimestamp: number;
}

/**
 * Validate WebSocket authentication
 */
export function validateWebSocketAuth(
  request: IncomingMessage,
  pathname: string,
): AuthenticatedSocket {
  const url = new URL(request.url || '', `http://${request.headers.host}`);

  const clientIp = request.socket.remoteAddress || '';
  const isLocalhost =
    clientIp === '127.0.0.1' ||
    clientIp === '::1' ||
    clientIp.startsWith('::ffff:127.0.0.1') ||
    clientIp === 'localhost';

  logger.info(`WebSocket auth attempt from IP: "${clientIp}", isLocalhost: ${isLocalhost}`);

  const apiKey = request.headers['x-api-key'] as string;
  const sessionToken =
    url.searchParams.get('token') || request.headers['authorization']?.replace('Bearer ', '');

  // Localhost bypass is only allowed in non-production environments
  const allowLocalhostBypass = config.NODE_ENV !== 'production' || config.AUTH_ALLOW_LOCALHOST === true;
  if (isLocalhost && allowLocalhostBypass) {
    logger.debug(`Allowing local WebSocket connection (dev mode)`);
    return { isAuthenticated: true, sessionId: 'local', authTimestamp: Date.now() };
  }

  if (!config.API_KEY) {
    logger.error(`WebSocket rejected - API_KEY not configured`);
    return { isAuthenticated: false, sessionId: 'unconfigured', authTimestamp: Date.now() };
  }

  if (!apiKey && !sessionToken) {
    logger.warn(`WebSocket authentication required for ${pathname}`);
    return { isAuthenticated: false, sessionId: 'unauthenticated', authTimestamp: Date.now() };
  }

  // Attempt session token validation first (it carries richer context)
  if (sessionToken) {
    try {
      const decoded = validateSessionToken(sessionToken);
      return {
        isAuthenticated: true,
        sessionId: decoded.sessionId,
        userId: decoded.userId,
        platform: decoded.platform,
        authTimestamp: Date.now(),
      };
    } catch (err) {
      logger.debug(`Session token invalid for ${pathname}: ${err}`);
    }
  }

  // Fall back to API key validation — session is server-bound, not client-asserted
  if (apiKey && constantTimeEquals(apiKey, config.API_KEY)) {
    return { isAuthenticated: true, sessionId: 'api-key-session', authTimestamp: Date.now() };
  }

  logger.warn(`WebSocket authentication failed for ${pathname}`);
  return { isAuthenticated: false, sessionId: 'unauthenticated', authTimestamp: Date.now() };
}

const JWT_ALGORITHM = 'HS256';
const JWT_EXPIRY = '24h';
const JWT_ISSUER = 'gravityclaw';

/**
 * Validate session token (JWT format)
 */
function validateSessionToken(token: string): {
  sessionId: string;
  userId?: string;
  platform?: string;
} {
  if (!config.API_KEY) {
    throw new Error('API_KEY not configured — cannot validate session tokens');
  }
  try {
    const payload = jwt.verify(token, config.API_KEY, {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
    }) as jwt.JwtPayload;

    const result: { sessionId: string; userId?: string; platform?: string } = {
      sessionId: payload.sid as string,
    };
    if (payload.uid) result.userId = payload.uid as string;
    if (payload.plt) result.platform = payload.plt as string;

    return result;
  } catch (err) {
    throw new Error(`Token validation failed: ${err}`);
  }
}

/**
 * Create session token for WebSocket authentication
 */
export function createSessionToken(sessionId: string, userId?: string, platform?: string): string {
  if (!config.API_KEY) {
    throw new Error('API_KEY not configured — cannot create session tokens');
  }

  return jwt.sign(
    {
      sid: sessionId,
      uid: userId,
      plt: platform,
    },
    config.API_KEY,
    {
      algorithm: JWT_ALGORITHM,
      expiresIn: JWT_EXPIRY,
      issuer: JWT_ISSUER,
    },
  );
}
