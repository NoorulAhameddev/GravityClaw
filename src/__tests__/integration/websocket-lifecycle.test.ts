import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';
import { WebChatChannel } from '../../channels/webchat.ts';
import type { UnifiedMessage } from '../../types/channels.js';

class MockWebSocketClient extends EventEmitter {
  public readyState: number = WebSocket.OPEN;
  public isAlive = true;
  public sentMessages: string[] = [];
  public auth?: { sessionId: string; userId?: string };

  send(payload: string): void {
    this.sentMessages.push(payload);
  }

  close(): void {
    this.readyState = WebSocket.CLOSED;
    this.emit('close');
  }
}

describe('WebChatChannel Integration & Session Isolation', () => {
  let channel: WebChatChannel;
  let receivedMessages: UnifiedMessage[] = [];

  beforeEach(() => {
    channel = new WebChatChannel();
    receivedMessages = [];
  });

  afterEach(async () => {
    await channel.stop();
  });

  it('should isolate messages by session ID and not broadcast to other clients', async () => {
    const onMessage = async (msg: UnifiedMessage) => {
      receivedMessages.push(msg);
    };

    await channel.start(onMessage);

    const clientA = new MockWebSocketClient();
    clientA.auth = { sessionId: 'session-client-a', userId: 'user-a' };

    const clientB = new MockWebSocketClient();
    clientB.auth = { sessionId: 'session-client-b', userId: 'user-b' };

    const { wss } = await import('../../server.ts');
    wss.emit('connection', clientA as any, { url: '/?sessionId=session-client-a' });
    wss.emit('connection', clientB as any, { url: '/?sessionId=session-client-b' });

    // Send targeted message to session-client-a
    await channel.sendMessage('session-client-a', 'Secret message for Client A');

    expect(clientA.sentMessages.length).toBe(1);
    const parsedA = JSON.parse(clientA.sentMessages[0]!);
    expect(parsedA.text).toContain('Secret message for Client A');
    expect(parsedA.chatId).toBe('session-client-a');

    // Client B must NOT have received Client A's message
    expect(clientB.sentMessages.length).toBe(0);

    // Send targeted message to session-client-b
    await channel.sendMessage('session-client-b', 'Hello Client B');
    expect(clientB.sentMessages.length).toBe(1);
    const parsedB = JSON.parse(clientB.sentMessages[0]!);
    expect(parsedB.text).toContain('Hello Client B');
    expect(parsedB.chatId).toBe('session-client-b');
  });

  it('should dispatch incoming client messages with correct session and user context', async () => {
    const onMessage = async (msg: UnifiedMessage) => {
      receivedMessages.push(msg);
    };

    await channel.start(onMessage);

    const client = new MockWebSocketClient();
    client.auth = { sessionId: 'session-xyz', userId: 'alice' };

    const { wss } = await import('../../server.ts');
    wss.emit('connection', client as any, { url: '/?sessionId=session-xyz' });

    // Simulate incoming client message
    client.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'message',
          text: 'What is the system status?',
        }),
      ),
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0]?.chatId).toBe('session-xyz');
    expect(receivedMessages[0]?.userId).toBe('alice');
    expect(receivedMessages[0]?.text).toBe('What is the system status?');
  });

  it('should unregister client on disconnect and handle nonexistent sessions gracefully', async () => {
    await channel.start(async () => {});

    const client = new MockWebSocketClient();
    client.auth = { sessionId: 'session-temp', userId: 'temp-user' };

    const { wss } = await import('../../server.ts');
    wss.emit('connection', client as any, { url: '/?sessionId=session-temp' });

    // Disconnect client
    client.close();

    // Sending to closed session should not throw and not send
    await expect(
      channel.sendMessage('session-temp', 'Message to disconnected client'),
    ).resolves.not.toThrow();

    expect(client.sentMessages.length).toBe(0);
  });
});
