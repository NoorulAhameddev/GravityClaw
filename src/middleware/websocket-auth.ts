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
  
  // Check if request is from localhost
  const clientIp = request.socket.remoteAddress || '';
  const isLocalhost = clientIp === '127.0.0.1' || 
                     clientIp === '::1' || 
                     clientIp.startsWith('::ffff:127.0.0.1') ||
                     clientIp === 'localhost';
  
  logger.info(`WebSocket auth attempt from IP: "${clientIp}", isLocalhost: ${isLocalhost}`);
   
  // Try multiple authentication methods
  const apiKey = url.searchParams.get('api_key') || 
                 request.headers['x-api-key'] as string;
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
    
    const headerPart = parts[0];
    const payloadPart = parts[1];
    const signaturePart = parts[2];
    
    if (!headerPart || !payloadPart || !signaturePart) {
      throw new Error('Invalid token format');
    }
    
    const header = JSON.parse(atob(headerPart));
    const payload = JSON.parse(atob(payloadPart));
    
    // Verify signature (constant-time comparison not needed here since we're checking equality)
    const apiKey = config.API_KEY || 'default_key_for_validation';
    const expectedSignature = crypto
      .createHmac('sha256', apiKey)
      .update(headerPart + '.' + payloadPart)
      .digest('base64url');
    
    if (signaturePart !== expectedSignature) {
      throw new Error('Invalid signature');
    }
    
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
  
  const headerPart = btoa(JSON.stringify(header));
  const payloadPart = btoa(JSON.stringify(payload));
  
  // Signature using API key (must match validation format)
  const apiKey = config.API_KEY || 'default_key_for_validation';
  const signature = crypto
    .createHmac('sha256', apiKey)
    .update(headerPart + '.' + payloadPart)
    .digest('base64url');
  
  return `${headerPart}.${payloadPart}.${signature}`;
}
