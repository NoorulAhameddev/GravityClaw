import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChannelRouter } from '../../channels/router.ts';
import { MockChannel } from '../utils/mock-channel.ts';
import { db } from '../../db.ts';
import { config } from '../../config.ts';
import { getHistory } from '../../llm/index.ts';
import { setSessionSettings, ensureSession } from '../../session.ts';

const testDeps = { db, config };

describe('Channel → Agent → Tool Integration Flow', () => {
  let router: ChannelRouter;
  let mockChannel: MockChannel;
  const testChatId = 'chat-e2e-123';
  const sessionKey = 'mock:chat-e2e-123';

  beforeEach(async () => {
    router = new ChannelRouter();
    mockChannel = new MockChannel('mock');
    router.register(mockChannel);
    await router.startAll();

    // Ensure session is configured with mock provider for reproducible testing
    ensureSession(sessionKey);
    setSessionSettings(sessionKey, { provider: 'mock' });

    db.prepare('DELETE FROM memory WHERE session_id = ?').run(sessionKey);
  });

  afterEach(async () => {
    await router.stopAll();
    db.prepare('DELETE FROM memory WHERE session_id = ?').run(sessionKey);
  });

  it('should route user message from channel, invoke agent loop, and deliver reply to channel', async () => {
    await mockChannel.simulateIncomingMessage({
      chatId: testChatId,
      text: 'hello from test channel',
    });

    // Check that reply was sent back to channel
    expect(mockChannel.messagesSent.length).toBeGreaterThan(0);
    const lastReply = mockChannel.messagesSent[mockChannel.messagesSent.length - 1];
    expect(lastReply?.chatId).toBe(testChatId);
    expect(lastReply?.text.length).toBeGreaterThan(0);

    // Verify conversation was persisted to SQLite memory
    const history = getHistory(sessionKey, testDeps);
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history[0]?.role).toBe('user');
    expect(history[0]?.content).toBe('hello from test channel');
    expect(history[1]?.role).toBe('assistant');
  });

  it('should handle channel command /help directly and respond through channel', async () => {
    await mockChannel.simulateIncomingMessage({
      chatId: testChatId,
      text: '/help',
    });

    expect(mockChannel.messagesSent.length).toBeGreaterThan(0);
    const reply = mockChannel.messagesSent[0]?.text;
    expect(reply).toBeDefined();
    expect(reply).toMatch(/Available commands|commands/i);
  });

  it('should maintain multi-turn context across consecutive channel messages', async () => {
    await mockChannel.simulateIncomingMessage({
      chatId: testChatId,
      text: 'First question',
    });

    await mockChannel.simulateIncomingMessage({
      chatId: testChatId,
      text: 'Second follow-up question',
    });

    const history = getHistory(sessionKey, testDeps);
    const userMessages = history.filter((m) => m.role === 'user').map((m) => m.content);

    expect(userMessages).toContain('First question');
    expect(userMessages).toContain('Second follow-up question');
    expect(mockChannel.messagesSent.length).toBe(2);
  });

  it('should clear session history when /reset command is sent to channel', async () => {
    await mockChannel.simulateIncomingMessage({
      chatId: testChatId,
      text: 'Hello, remember this!',
    });

    let history = getHistory(sessionKey, testDeps);
    expect(history.length).toBeGreaterThanOrEqual(2);

    await mockChannel.simulateIncomingMessage({
      chatId: testChatId,
      text: '/reset',
    });

    history = getHistory(sessionKey, testDeps);
    expect(history.length).toBe(0);
  });
});
