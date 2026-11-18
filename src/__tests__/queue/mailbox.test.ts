import { describe, it, expect, beforeEach } from 'vitest';
import { MailboxManager } from '../../queue/mailbox.ts';
import { db } from '../../db.ts';

describe('MailboxManager & Session Fencing (NanoClaw)', () => {
  let mailbox: MailboxManager;

  beforeEach(() => {
    mailbox = MailboxManager.getInstance();
    db.exec(`
      DELETE FROM mailbox_messages;
      DELETE FROM session_fences;
    `);
  });

  it('enqueues messages with pending status and FIFO ordering', () => {
    const msg1 = mailbox.enqueue({
      sessionId: 'sess-1',
      channelId: 'telegram',
      chatId: '1001',
      senderName: 'Alice',
      payload: { text: 'first command' },
    });

    const msg2 = mailbox.enqueue({
      sessionId: 'sess-1',
      channelId: 'telegram',
      chatId: '1001',
      senderName: 'Alice',
      payload: { text: 'second command' },
    });

    expect(msg1.id).toBeDefined();
    expect(msg2.id).toBeDefined();
    expect(mailbox.getPendingCount('sess-1')).toBe(2);
  });

  it('atomically acquires session fence lease and increments fence tokens', () => {
    const lease1 = mailbox.acquireSessionFence('sess-2', 'worker-A', 5000);
    expect(lease1).not.toBeNull();
    expect(lease1?.fenceToken).toBe(1);

    // Second worker attempting to lease active session should be blocked
    const lease2 = mailbox.acquireSessionFence('sess-2', 'worker-B', 5000);
    expect(lease2).toBeNull();

    // Worker A releasing lease
    const released = mailbox.releaseSessionFence('sess-2', 'worker-A', lease1!.fenceToken);
    expect(released).toBe(true);

    // Worker B should now be able to acquire lease with incremented fence token
    const lease3 = mailbox.acquireSessionFence('sess-2', 'worker-B', 5000);
    expect(lease3).not.toBeNull();
    expect(lease3?.fenceToken).toBe(2);
  });

  it('claims pending messages under active fence and marks completed', () => {
    mailbox.enqueue({
      sessionId: 'sess-3',
      channelId: 'webchat',
      chatId: 'chat-99',
      payload: { query: 'test query' },
    });

    const lease = mailbox.acquireSessionFence('sess-3', 'worker-1', 10000);
    expect(lease).not.toBeNull();

    // Claim next message
    const claimed = mailbox.claimNextMessage('sess-3', 'worker-1', lease!.fenceToken);
    expect(claimed).not.toBeNull();
    expect(claimed?.status).toBe('leased');
    expect(claimed?.payload).toEqual({ query: 'test query' });

    // Completing with wrong fence token should fail
    const wrongFence = mailbox.completeMessage(claimed!.id, 999);
    expect(wrongFence).toBe(false);

    // Completing with valid fence token should succeed
    const ok = mailbox.completeMessage(claimed!.id, lease!.fenceToken);
    expect(ok).toBe(true);

    expect(mailbox.getPendingCount('sess-3')).toBe(0);
  });

  it('handles message failure retries up to maximum limit', () => {
    mailbox.enqueue({
      sessionId: 'sess-4',
      channelId: 'discord',
      chatId: 'chan-1',
      payload: { text: 'failing command' },
    });

    const lease = mailbox.acquireSessionFence('sess-4', 'worker-err', 10000);
    expect(lease).not.toBeNull();

    const claimed = mailbox.claimNextMessage('sess-4', 'worker-err', lease!.fenceToken);
    expect(claimed).not.toBeNull();

    // Retry 1: should return to pending
    const failed1 = mailbox.failMessage(claimed!.id, lease!.fenceToken, 'Transient network error', 2);
    expect(failed1).toBe(true);
    expect(mailbox.getPendingCount('sess-4')).toBe(1);

    // Re-claim
    const claimed2 = mailbox.claimNextMessage('sess-4', 'worker-err', lease!.fenceToken);
    expect(claimed2?.retryCount).toBe(1);

    // Retry 2: reaches maxRetries -> status becomes 'failed'
    const failed2 = mailbox.failMessage(claimed2!.id, lease!.fenceToken, 'Persistent failure', 2);
    expect(failed2).toBe(true);
    expect(mailbox.getPendingCount('sess-4')).toBe(0);
  });

  it('reclaims expired message and session leases', () => {
    mailbox.enqueue({
      sessionId: 'sess-expire',
      channelId: 'telegram',
      chatId: 'exp-1',
      payload: { text: 'abandoned task' },
    });

    // Lease with expired timestamp (-1ms)
    const lease = mailbox.acquireSessionFence('sess-expire', 'worker-dead', -1);
    expect(lease).not.toBeNull();

    mailbox.claimNextMessage('sess-expire', 'worker-dead', lease!.fenceToken, -1);

    // Reclaim
    const reclaimed = mailbox.reclaimExpiredFences();
    expect(reclaimed).toBe(1);

    // Message should be back to pending
    expect(mailbox.getPendingCount('sess-expire')).toBe(1);
  });
});

