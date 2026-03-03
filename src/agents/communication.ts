/**
 * Agent-to-Agent Communication System
 *
 * Enables inter-agent messaging and memory access with permission-based security.
 * Sessions can opt-in to allow other agents to read their history or send them messages.
 *
 * Features:
 * - Send messages between agents in different sessions
 * - Read conversation history across sessions (with permission)
 * - Permission-based access control (opt-in model)
 * - Automatic permissions for parent-child agent relationships
 */

import { db } from "../db.ts";
import { createLogger } from "../logger.ts";
import { randomUUID } from "crypto";

const log = createLogger("agent-communication");

/**
 * Represents a message permission grant
 */
export interface MessagePermission {
  /** Whether the grantee can read this session's history */
  canRead: boolean;
  /** Whether the grantee can send messages to this session */
  canWrite: boolean;
  /** Timestamp when permission was granted */
  grantedAt: Date;
  /** Session ID that granted the permission */
  grantedBy: string;
}

/**
 * Represents a single message between agents
 */
export interface Message {
  id: string;
  fromSessionId: string;
  toSessionId: string;
  content: string;
  timestamp: Date;
}

/**
 * Represents a session with its metadata
 */
export interface SessionMetadata {
  id: string;
  active: boolean;
  lastActivity: Date;
  allowMessages: boolean;
}

/**
 * Agent Messaging System
 *
 * Handles inter-session communication with permissionbased access control.
 * Default behavior: all sessions are isolated. Opt-in required for cross-session communication.
 */
export class AgentMessaging {
  /**
   * Send a message from one session to another
   *
   * @param fromSessionId - Source session ID
   * @param toSessionId - Target session ID
   * @param message - Message content
   * @throws Error if toSessionId doesn't have allow_messages enabled
   * @throws Error if fromSessionId doesn't have permission to send to toSessionId
   */
  static sendMessage(fromSessionId: string, toSessionId: string, message: string): void {
    log.debug(`Sending message from ${fromSessionId} to ${toSessionId}`);

    // Check if target session has messaging enabled
    if (!this.canReceiveMessages(toSessionId)) {
      throw new Error(`Session ${toSessionId} does not allow messages`);
    }

    // Check if sender has permission to send to this session
    if (!this.hasPermission(fromSessionId, toSessionId, "write")) {
      // Allow if sender and receiver have parent-child relationship
      if (!this.hasAgentRelationship(fromSessionId, toSessionId)) {
        throw new Error(`Session ${fromSessionId} does not have permission to send to ${toSessionId}`);
      }
    }

    const messageId = randomUUID();
    const timestamp = new Date();

    try {
      db.prepare(
        `INSERT INTO messages (id, from_session_id, to_session_id, content, timestamp)
         VALUES (?, ?, ?, ?, ?)`
      ).run(messageId, fromSessionId, toSessionId, message, timestamp.toISOString());

      log.info(`Message ${messageId} sent from ${fromSessionId} to ${toSessionId}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error(`Failed to send message: ${errMsg}`);
      throw new Error(`Failed to send message: ${errMsg}`);
    }
  }

  /**
   * Read message history for a session
   *
   * @param sessionId - Session to read from
   * @param limit - Maximum number of messages to return (default: all)
   * @returns Array of messages for this session
   */
  static readHistory(sessionId: string, limit?: number): Message[] {
    try {
      let query = `
        SELECT id, from_session_id, to_session_id, content, timestamp
        FROM messages
        WHERE to_session_id = ?
        ORDER BY timestamp DESC
      `;

      const params: unknown[] = [sessionId];

      if (limit !== undefined && limit > 0) {
        query += ` LIMIT ?`;
        params.push(limit);
      }

      const rows = db.prepare(query).all(...params) as Array<{
        id: string;
        from_session_id: string;
        to_session_id: string;
        content: string;
        timestamp: string;
      }>;

      const messages: Message[] = rows
        .reverse() // Reverse to get chronological order
        .map((row) => ({
          id: row.id,
          fromSessionId: row.from_session_id,
          toSessionId: row.to_session_id,
          content: row.content,
          timestamp: new Date(row.timestamp),
        }));

      log.debug(`Read ${messages.length} messages for session ${sessionId}`);
      return messages;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error(`Error reading history for ${sessionId}: ${errMsg}`);
      return [];
    }
  }

  /**
   * Grant permission for one session to access/communicate with another
   *
   * @param sessionId - Session being granted access
   * @param targetSessionId - Session to grant access to
   * @param permission - Permission details (canRead, canWrite)
   */
  static grantPermission(
    sessionId: string,
    targetSessionId: string,
    permission: Omit<MessagePermission, "grantedAt" | "grantedBy">
  ): void {
    log.debug(`Granting ${JSON.stringify(permission)} from ${sessionId} to ${targetSessionId}`);

    const permissionId = randomUUID();
    const now = new Date();

    try {
      db.prepare(
        `INSERT INTO permissions (id, session_id, target_session_id, can_read, can_write, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(permissionId, sessionId, targetSessionId, permission.canRead ? 1 : 0, permission.canWrite ? 1 : 0, now.toISOString());

      log.info(`Permission ${permissionId} granted from ${sessionId} to ${targetSessionId}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error(`Failed to grant permission: ${errMsg}`);
      throw new Error(`Failed to grant permission: ${errMsg}`);
    }
  }

  /**
   * List all active sessions with metadata
   *
   * @returns Array of session metadata
   */
  static listSessions(): SessionMetadata[] {
    try {
      const rows = db
        .prepare(
          `
        SELECT DISTINCT
          session_id as id,
          MAX(timestamp) as last_activity,
          COALESCE((SELECT allow_messages FROM sessions WHERE sessions.id = memory.session_id), 0) as allow_messages
        FROM memory
        GROUP BY session_id
        ORDER BY MAX(timestamp) DESC
      `
        )
        .all() as Array<{
        id: string;
        last_activity: string;
        allow_messages: number;
      }>;

      const sessions: SessionMetadata[] = rows.map((row) => ({
        id: row.id,
        active: true, // All sessions with memory entries are considered active
        lastActivity: new Date(row.last_activity),
        allowMessages: row.allow_messages === 1,
      }));

      log.debug(`Listed ${sessions.length} active sessions`);
      return sessions;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error(`Error listing sessions: ${errMsg}`);
      return [];
    }
  }

  /**
   * Enable or disable message reception for a session
   *
   * @param sessionId - Session to configure
   * @param allow - Whether to allow messages
   */
  static setAllowMessages(sessionId: string, allow: boolean): void {
    try {
      // First, ensure the session exists in the sessions table
      const existing = db.prepare(`SELECT id FROM sessions WHERE id = ?`).get(sessionId);

      if (!existing) {
        db.prepare(`INSERT INTO sessions (id, allow_messages) VALUES (?, ?)`).run(sessionId, allow ? 1 : 0);
      } else {
        db.prepare(`UPDATE sessions SET allow_messages = ? WHERE id = ?`).run(allow ? 1 : 0, sessionId);
      }

      log.info(`Set allow_messages=${allow} for session ${sessionId}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error(`Error setting allow_messages: ${errMsg}`);
      throw new Error(`Error setting allow_messages: ${errMsg}`);
    }
  }

  /**
   * Check if a session can receive messages
   *
   * @param sessionId - Session to check
   * @returns true if session allows messages
   */
  static canReceiveMessages(sessionId: string): boolean {
    try {
      const row = db.prepare(`SELECT allow_messages FROM sessions WHERE id = ?`).get(sessionId) as
        | { allow_messages: number }
        | undefined;
      return (row?.allow_messages ?? 0) === 1;
    } catch (err) {
      log.debug(`Error checking allow_messages for ${sessionId}: ${err}`);
      return false;
    }
  }

  /**
   * Check if a session has permission to access another session
   *
   * @param sessionId - Session requesting access
   * @param targetSessionId - Session being accessed
   * @param type - Type of permission: 'read' or 'write'
   * @returns true if permission is granted
   */
  private static hasPermission(sessionId: string, targetSessionId: string, type: "read" | "write"): boolean {
    try {
      const column = type === "read" ? "can_read" : "can_write";
      const row = db
        .prepare(
          `SELECT ${column} FROM permissions
           WHERE session_id = ? AND target_session_id = ?`
        )
        .get(sessionId, targetSessionId) as { [key: string]: number } | undefined;

      return (row?.[column] ?? 0) === 1;
    } catch (err) {
      log.debug(`Error checking ${type} permission: ${err}`);
      return false;
    }
  }

  /**
   * Check if two sessions have a parent-child relationship
   * Used to allow automatic communication within agent swarms
   *
   * @param fromSessionId - Child session (requester)
   * @param toSessionId - Parent session (target)
   * @returns true if relationship exists
   */
  private static hasAgentRelationship(fromSessionId: string, toSessionId: string): boolean {
    try {
      const row = db
        .prepare(
          `SELECT id FROM agent_swarms
           WHERE (parent_session_id = ? AND child_session_id = ?)
              OR (parent_session_id = ? AND child_session_id = ?)`
        )
        .get(toSessionId, fromSessionId, fromSessionId, toSessionId);

      return !!row;
    } catch (err) {
      log.debug(`Error checking agent relationship: ${err}`);
      return false;
    }
  }
}

export default AgentMessaging;
