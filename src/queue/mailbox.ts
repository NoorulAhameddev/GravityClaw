/**
 * SQLite Mailbox IPC & Transactional Session Fencing
 *
 * Implements the NanoClaw transactional mailbox pattern for GravityClaw:
 * - Decouples channel ingestion (Telegram, WebChat, Discord, Webhooks) from worker processing.
 * - Enforces monotonic session-level fence tokens to prevent concurrent worker race conditions.
 * - Guarantees FIFO message ordering per session with lease-based recovery.
 */

import { randomUUID } from 'crypto';
import { db } from '../db.ts';
import { createLogger } from '../logger.ts';

const log = createLogger('mailbox');

export type MessageStatus = 'pending' | 'leased' | 'completed' | 'failed';

export interface MailboxMessage {
  id: string;
  sessionId: string;
  channelId: string;
  chatId: string;
  senderId?: string | undefined;
  senderName?: string | undefined;
  payload: Record<string, unknown>;
  status: MessageStatus;
  fenceToken: number;
  leaseId?: string | undefined;
  leaseExpiresAt?: number | undefined;
  retryCount: number;
  errorMessage?: string | undefined;
  createdAt: number;
  updatedAt: number;
}

export interface EnqueueOptions {
  sessionId: string;
  channelId: string;
  chatId: string;
  senderId?: string;
  senderName?: string;
  payload: Record<string, unknown>;
}

export interface SessionFence {
  sessionId: string;
  activeFenceToken: number;
  leasedTo?: string;
  leaseExpiresAt?: number;
  updatedAt: number;
}

export class MailboxManager {
  private static instance: MailboxManager | null = null;
  private initialized = false;

  private constructor() {
    this.initTables();
  }

  public static getInstance(): MailboxManager {
    if (!MailboxManager.instance) {
      MailboxManager.instance = new MailboxManager();
    }
    return MailboxManager.instance;
  }

  private initTables(): void {
    if (this.initialized) return;

    db.exec(`
      CREATE TABLE IF NOT EXISTS mailbox_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        sender_id TEXT,
        sender_name TEXT,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        fence_token INTEGER NOT NULL DEFAULT 0,
        lease_id TEXT,
        lease_expires_at INTEGER,
        retry_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_mailbox_session_status ON mailbox_messages(session_id, status);
      CREATE INDEX IF NOT EXISTS idx_mailbox_lease_exp ON mailbox_messages(status, lease_expires_at);

      CREATE TABLE IF NOT EXISTS session_fences (
        session_id TEXT PRIMARY KEY,
        active_fence_token INTEGER NOT NULL DEFAULT 0,
        leased_to TEXT,
        lease_expires_at INTEGER,
        updated_at INTEGER NOT NULL
      );
    `);

    this.initialized = true;
  }

  /**
   * Enqueues an inbound channel message into the session mailbox.
   */
  public enqueue(options: EnqueueOptions): MailboxMessage {
    const now = Date.now();
    const id = randomUUID();
    const payloadStr = JSON.stringify(options.payload);

    db.prepare(`
      INSERT INTO mailbox_messages (
        id, session_id, channel_id, chat_id, sender_id, sender_name,
        payload, status, fence_token, retry_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, 0, ?, ?)
    `).run(
      id,
      options.sessionId,
      options.channelId,
      options.chatId,
      options.senderId || null,
      options.senderName || null,
      payloadStr,
      now,
      now,
    );

    log.debug(`Enqueued mailbox message ${id} for session ${options.sessionId}`);

    return {
      id,
      sessionId: options.sessionId,
      channelId: options.channelId,
      chatId: options.chatId,
      senderId: options.senderId,
      senderName: options.senderName,
      payload: options.payload,
      status: 'pending',
      fenceToken: 0,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Transactionally acquires a session fence lease.
   * If a lease exists and is not expired, returns null to prevent duplicate workers.
   */
  public acquireSessionFence(
    sessionId: string,
    workerId: string,
    leaseDurationMs: number = 30000,
  ): { fenceToken: number; leaseId: string } | null {
    const now = Date.now();
    const expiresAt = now + leaseDurationMs;
    const leaseId = randomUUID();

    const result = db.transaction(() => {
      const existing = db.prepare(`
        SELECT active_fence_token, leased_to, lease_expires_at
        FROM session_fences
        WHERE session_id = ?
      `).get(sessionId) as { active_fence_token: number; leased_to?: string; lease_expires_at?: number } | undefined;

      if (existing) {
        if (existing.leased_to && existing.lease_expires_at && existing.lease_expires_at > now) {
          // Lease is currently active and held by someone else
          if (existing.leased_to !== workerId) {
            return null;
          }
        }

        const nextFence = existing.active_fence_token + 1;
        db.prepare(`
          UPDATE session_fences
          SET active_fence_token = ?, leased_to = ?, lease_expires_at = ?, updated_at = ?
          WHERE session_id = ?
        `).run(nextFence, workerId, expiresAt, now, sessionId);

        return { fenceToken: nextFence, leaseId };
      } else {
        const nextFence = 1;
        db.prepare(`
          INSERT INTO session_fences (session_id, active_fence_token, leased_to, lease_expires_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(sessionId, nextFence, workerId, expiresAt, now);

        return { fenceToken: nextFence, leaseId };
      }
    })();

    return result;
  }

  /**
   * Claims the next pending message for the leased session under the active fence token.
   */
  public claimNextMessage(
    sessionId: string,
    workerId: string,
    fenceToken: number,
    leaseDurationMs: number = 30000,
  ): MailboxMessage | null {
    const now = Date.now();
    const expiresAt = now + leaseDurationMs;

    return db.transaction(() => {
      // Validate fence token
      const fence = db.prepare(`
        SELECT active_fence_token, leased_to, lease_expires_at
        FROM session_fences
        WHERE session_id = ?
      `).get(sessionId) as { active_fence_token: number; leased_to?: string; lease_expires_at?: number } | undefined;

      if (!fence || fence.active_fence_token !== fenceToken || fence.leased_to !== workerId) {
        log.warn(`Rejecting message claim on session ${sessionId}: fence token ${fenceToken} invalid or not owned by ${workerId}`);
        return null;
      }

      // Find next pending message FIFO
      const row = db.prepare(`
        SELECT *
        FROM mailbox_messages
        WHERE session_id = ? AND status = 'pending'
        ORDER BY created_at ASC
        LIMIT 1
      `).get(sessionId) as any;

      if (!row) {
        return null;
      }

      const leaseId = randomUUID();
      db.prepare(`
        UPDATE mailbox_messages
        SET status = 'leased', fence_token = ?, lease_id = ?, lease_expires_at = ?, updated_at = ?
        WHERE id = ?
      `).run(fenceToken, leaseId, expiresAt, now, row.id);

      return {
        id: row.id,
        sessionId: row.session_id,
        channelId: row.channel_id,
        chatId: row.chat_id,
        senderId: row.sender_id || undefined,
        senderName: row.sender_name || undefined,
        payload: JSON.parse(row.payload),
        status: 'leased' as MessageStatus,
        fenceToken,
        leaseId,
        leaseExpiresAt: expiresAt,
        retryCount: row.retry_count,
        errorMessage: row.error_message || undefined,
        createdAt: row.created_at,
        updatedAt: now,
      };
    })();
  }

  /**
   * Completes a leased message, ensuring the fence token is still valid.
   */
  public completeMessage(messageId: string, fenceToken: number): boolean {
    const now = Date.now();
    const changes = db.prepare(`
      UPDATE mailbox_messages
      SET status = 'completed', updated_at = ?
      WHERE id = ? AND status = 'leased' AND fence_token = ?
    `).run(now, messageId, fenceToken).changes;

    return changes > 0;
  }

  /**
   * Marks a message failed, incrementing retry count or moving to 'failed'.
   */
  public failMessage(
    messageId: string,
    fenceToken: number,
    error: string,
    maxRetries: number = 3,
  ): boolean {
    const now = Date.now();
    return db.transaction(() => {
      const row = db.prepare(`
        SELECT retry_count
        FROM mailbox_messages
        WHERE id = ? AND status = 'leased' AND fence_token = ?
      `).get(messageId, fenceToken) as { retry_count: number } | undefined;

      if (!row) return false;

      const nextRetries = row.retry_count + 1;
      const nextStatus = nextRetries >= maxRetries ? 'failed' : 'pending';

      const changes = db.prepare(`
        UPDATE mailbox_messages
        SET status = ?, retry_count = ?, error_message = ?, lease_id = NULL, lease_expires_at = NULL, updated_at = ?
        WHERE id = ?
      `).run(nextStatus, nextRetries, error, now, messageId).changes;

      return changes > 0;
    })();
  }

  /**
   * Releases an acquired session fence.
   */
  public releaseSessionFence(sessionId: string, workerId: string, fenceToken: number): boolean {
    const now = Date.now();
    const changes = db.prepare(`
      UPDATE session_fences
      SET leased_to = NULL, lease_expires_at = NULL, updated_at = ?
      WHERE session_id = ? AND active_fence_token = ? AND leased_to = ?
    `).run(now, sessionId, fenceToken, workerId).changes;

    return changes > 0;
  }

  /**
   * Reclaims expired message leases back to pending status.
   */
  public reclaimExpiredFences(): number {
    const now = Date.now();
    return db.transaction(() => {
      // Reclaim message leases
      const msgChanges = db.prepare(`
        UPDATE mailbox_messages
        SET status = 'pending', lease_id = NULL, lease_expires_at = NULL, updated_at = ?
        WHERE status = 'leased' AND lease_expires_at IS NOT NULL AND lease_expires_at < ?
      `).run(now, now).changes;

      // Reclaim session fences
      db.prepare(`
        UPDATE session_fences
        SET leased_to = NULL, lease_expires_at = NULL, updated_at = ?
        WHERE lease_expires_at IS NOT NULL AND lease_expires_at < ?
      `).run(now, now);

      if (msgChanges > 0) {
        log.info(`Reclaimed ${msgChanges} expired mailbox message leases`);
      }
      return msgChanges;
    })();
  }

  /**
   * Returns count of pending messages for a session or globally.
   */
  public getPendingCount(sessionId?: string): number {
    if (sessionId) {
      const row = db.prepare(`
        SELECT COUNT(*) as cnt FROM mailbox_messages
        WHERE session_id = ? AND status = 'pending'
      `).get(sessionId) as { cnt: number };
      return row.cnt;
    }

    const row = db.prepare(`
      SELECT COUNT(*) as cnt FROM mailbox_messages WHERE status = 'pending'
    `).get() as { cnt: number };
    return row.cnt;
  }
}

export const mailbox = MailboxManager.getInstance();
