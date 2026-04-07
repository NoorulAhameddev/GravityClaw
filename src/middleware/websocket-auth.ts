import { IncomingMessage } from 'http';
import { URL } from 'url';
import { config } from '../config.ts';
import { createLogger } from '../logger.ts';
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
  
  // Try multiple authentication methods
  const apiKey = url.searchParams.get('api_key') || 
                 request.headers['x-api-key'] as string;
  const sessionToken = url.searchParams.get('token') || 
                       request.headers['authorization']?.replace('Bearer ', '');
  
  // If API key is configured, require authentication
  if (config.API_KEY) {
    if (!apiKey && !sessionToken) {
      logger.warn(`WebSocket authentication required for ${pathname}`);
      return { isAuthenticated: false, sessionId: 'unauthenticated', authTimestamp: Date.now() };
    }
    
    // Validate API key
    if (apiKey && apiKey !== config.API_KEY) {
      logger.warn(`Invalid API key for WebSocket ${pathname}`);
      return { isAuthenticated: false, sessionId: 'unauthenticated', authTimestamp: Date.now() };
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
        logger.warn(`Invalid session token for WebSocket ${pathname}: ${err}`);
        return { isAuthenticated: false, sessionId: 'unauthenticated', authTimestamp: Date.now() };
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
  
  // No API key configured - allow with warning
  logger.warn(`WebSocket authentication bypassed - API_KEY not configured`);
  const sessionId = url.searchParams.get('session') || 'default';
  return {
    isAuthenticated: true,
    sessionId,
    authTimestamp: Date.now()
  };
}

/**
 * Validate session token (JWT format)
 */
function validateSessionToken(token: string): {
  sessionId: string;
  userId?: string;
  platform?: string;
} {
  // Simple JWT-like validation
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }
    
    const payloadPart = parts[1];
    if (!payloadPart) {
      throw new Error('Invalid token format');
    }
    
    const payload = JSON.parse(atob(payloadPart));
    
    // Check expiration
    if (payload.exp && payload.exp < Date.now() / 1000) {
      throw new Error('Token expired');
    }
    
    // Check issuer
    if (payload.iss !== 'gravityclaw') {
      throw new Error('Invalid issuer');
    }
    
    return {
      sessionId: payload.sid,
      userId: payload.uid,
      platform: payload.plt
    };
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
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sid: sessionId,
    uid: userId,
    plt: platform,
    iss: 'gravityclaw',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400 // 24 hours
  };
  
  // Simple signature using API key
  const apiKey = config.API_KEY || 'default';
  const signature = crypto
    .createHmac('sha256', apiKey)
    .update(JSON.stringify(header) + JSON.stringify(payload))
    .digest('base64url');
  
  return `${btoa(JSON.stringify(header))}.${btoa(JSON.stringify(payload))}.${signature}`;
}
