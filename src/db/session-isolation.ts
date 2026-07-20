import { db } from '../db.ts';
import { createLogger } from '../logger.ts';

const logger = createLogger('session-isolation');

/**
 * Session-scoped database wrapper that enforces isolation
 */
export class SessionScopedDB {
  constructor(
    private baseDb: typeof db,
    private sessionId: string,
    private parentSessionId?: string
  ) {}
  
  /**
   * Prepare a query with session isolation
   */
  prepare(sql: string) {
    // Validate no session_id injection attempts
    if (this.containsSessionInjection(sql)) {
      throw new Error('Potential SQL injection detected in session query');
    }
    
    const stmt = this.baseDb.prepare(sql);
    
    // Wrap methods to enforce session scope
    return {
      all: (...params: unknown[]) => {
        this.validateSessionAccess(params);
        return stmt.all(...params);
      },
      get: (...params: unknown[]) => {
        this.validateSessionAccess(params);
        return stmt.get(...params);
      },
      run: (...params: unknown[]) => {
        this.validateSessionWrite(params);
        return stmt.run(...params);
      }
    };
  }
  
  /**
   * Check for SQL injection patterns targeting session_id
   */
  private containsSessionInjection(sql: string): boolean {
    const dangerousPatterns = [
      /session_id\s*[=<>].*['"]/,  // Direct session_id comparison with quotes
      /;\s*(SELECT|INSERT|UPDATE|DELETE).*session/,  // Chained queries
      /UNION.*session/,  // Union injection
      /OR\s+['"]?.*session_id/,  // OR injection
    ];
    
    return dangerousPatterns.some(pattern => pattern.test(sql));
  }
  
  /**
   * Validate session access for read operations
   */
  private validateSessionAccess(params: unknown[]): void {
    // For queries with session_id parameter, validate it matches our session
    for (const param of params) {
      if (typeof param === 'string' && param.includes('session')) {
        // Direct equality check (allow same session)
        if (param === this.sessionId) {
          continue;
        }
        
        // Parent DB can read child sessions (child session IDs start with parent session ID)
        if (!this.parentSessionId && param.startsWith(this.sessionId + '-')) {
          // This is a parent DB reading a child session (format: parentSessionId-role-random)
          continue;
        }
        
        // Child DB cannot read parent memory (unless explicit channel implemented later)
        if (this.parentSessionId && param === this.parentSessionId) {
          // Block child reading parent memory
          logger.warn(`Session isolation violation: child ${this.sessionId} tried to access parent ${this.parentSessionId}`);
          throw new Error('Session isolation violation: Child cannot read parent memory');
        }
        
        // Check if trying to access different session with colon format (e.g., sessionId:user:123)
        if (param.includes(':')) {
          const requestedSession = param.split(':')[0];
          if (requestedSession && requestedSession !== this.sessionId) {
            // Parent DB can read child sessions
            if (!this.parentSessionId && requestedSession.startsWith(this.sessionId + '-')) {
              continue;
            }
            logger.warn(`Session isolation violation: ${this.sessionId} tried to access ${requestedSession}`);
            throw new Error('Session isolation violation: Cannot access other session data');
          }
        } else {
          // Parameter is a session ID without colon, but not equal to sessionId
          logger.warn(`Session isolation violation: ${this.sessionId} tried to access ${param}`);
          throw new Error('Session isolation violation: Cannot access other session data');
        }
      }
    }
  }
  
  /**
   * Validate session writes
   */
  private validateSessionWrite(params: unknown[]): void {
    // Similar validation for write operations
    this.validateSessionAccess(params);
  }
  
  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }
  
  /**
   * Get parent session ID
   */
  getParentSessionId(): string | undefined {
    return this.parentSessionId;
  }
}

/**
 * Create a session-scoped database wrapper
 */
export function createSessionDB(sessionId: string, parentSessionId?: string): SessionScopedDB {
  return new SessionScopedDB(db, sessionId, parentSessionId);
}