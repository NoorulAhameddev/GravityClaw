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
  pathname: string
): AuthenticatedSocket {
  // Extract authentication from query parameters or headers
  const url = new URL(request.url || '', `http://${request.headers.host}`);
  
  // Check if request is from localhost
  const clientIp = request.socket.remoteAddress || '';
  const isLocalhost = clientIp === '127.0.0.1' || 
                     clientIp === '::1' || 
                     clientIp.startsWith('::ffff:127.0.0.1') ||
                     clientIp === 'localhost';
  
  logger.info(`WebSocket auth attempt from IP: "${clientIp}", isLocalhost: ${isLocalhost}`);
   
  // Try multiple authentication methods
  const apiKey = request.headers['x-api-key'] as string;
  const sessionToken = url.searchParams.get('token') || 
                      request.headers['authorization']?.replace('Bearer ', '');
   
  // Allow localhost without authentication or with any key (for development convenience)
  if (isLocalhost) {
    const sessionId = url.searchParams.get('session') || 'default';
    logger.debug(`Allowing local WebSocket connection for session: ${sessionId}`);
    return {
      isAuthenticated: true,
      sessionId,
      authTimestamp: Date.now()
    };
  }
   
  // Require API key in all cases for security
  if (!config.API_KEY) {
    logger.error(`WebSocket rejected - API_KEY not configured`);
    return { isAuthenticated: false, sessionId: 'unconfigured', authTimestamp: Date.now() };
  }
   
  if (!apiKey && !sessionToken) {
    logger.warn(`WebSocket authentication required for ${pathname}`);
    return { isAuthenticated: false, sessionId: 'unauthenticated', authTimestamp: Date.now() };
  }
  
  // Validate API key with constant-time comparison
  if (apiKey) {
    const apiKeyValid = constantTimeEquals(apiKey, config.API_KEY);
    if (!apiKeyValid && !sessionToken) {
      logger.warn(`Invalid API key for WebSocket ${pathname}`);
      return { isAuthenticated: false, sessionId: 'unauthenticated', authTimestamp: Date.now() };
    }
  }
  
  // Validate session token (JWT or similar)
  if (sessionToken) {
    try {
      const decoded = validateSessionToken(sessionToken);
      return {
        isAuthenticated: true,
        sessionId: decoded.sessionId,
        userId: decoded.userId,
        platform: decoded.platform,
        authTimestamp: Date.now()
      };
    } catch (err) {
      // If token validation fails, check API key as fallback
      if (!apiKey || !constantTimeEquals(apiKey, config.API_KEY)) {
        logger.warn(`Invalid session token for WebSocket ${pathname}: ${err}`);
        return { isAuthenticated: false, sessionId: 'unauthenticated', authTimestamp: Date.now() };
      }
    }
  }
  
  // API key authentication successful
  const sessionId = url.searchParams.get('session') || 'default';
  return {
    isAuthenticated: true,
    sessionId,
    authTimestamp: Date.now()
  };
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
  try {
    const apiKey = config.API_KEY || 'default_key_for_validation';
    const payload = jwt.verify(token, apiKey, {
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
export function createSessionToken(
  sessionId: string,
  userId?: string,
  platform?: string
): string {
  const apiKey = config.API_KEY || 'default_key_for_validation';
  
  return jwt.sign(
    { 
      sid: sessionId, 
      uid: userId, 
      plt: platform 
    },
    apiKey,
    {
      algorithm: JWT_ALGORITHM,
      expiresIn: JWT_EXPIRY,
      issuer: JWT_ISSUER
    }
  );
}
