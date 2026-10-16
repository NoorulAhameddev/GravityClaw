import { describe, it, expect, vi } from 'vitest';
import { WebChatChannel } from '../../channels/webchat.ts';
import { EventEmitter } from 'events';

class MockWebSocket extends EventEmitter {
  isAlive = true;
  readyState = 1;
  sentData: string[] = [];
  send(data: string) {
    this.sentData.push(data);
  }
}

describe('WebChat Channel Session Isolation & Tool Blocking', () => {
  it('should block client-initiated tool_call messages', async () => {
    const channel = new WebChatChannel();
    const onMessage = vi.fn();
    (channel as any).onMessageCb = onMessage;

    const mockWs = new MockWebSocket() as any;
    channel.handleConnection(mockWs, { url: '/chat?sessionId=test-session-1' });

    // Client attempts to send a direct tool_call
    mockWs.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'tool_call',
          id: 'call_abc',
          tool: 'run_shell',
          args: { command: 'whoami' },
        }),
      ),
    );

    await vi.waitFor(() => {
      expect(mockWs.sentData.length).toBeGreaterThan(0);
    });

    const reply = JSON.parse(mockWs.sentData[0]);
    expect(reply.type).toBe('tool_response');
    expect(reply.error).toContain('Direct tool calls via WebSocket are not permitted');
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('should reject unauthorized session switching on established connection', async () => {
    const channel = new WebChatChannel();
    const onMessage = vi.fn();
    (channel as any).onMessageCb = onMessage;

    const mockWs = new MockWebSocket() as any;
    channel.handleConnection(mockWs, { url: '/chat?sessionId=legit-session' });

    // Client attempts to spoof chatId to another user's session
    mockWs.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'message',
          chatId: 'victim-session-id',
          text: 'Hello, victim!',
        }),
      ),
    );

    await vi.waitFor(() => {
      expect(mockWs.sentData.length).toBeGreaterThan(0);
    });

    const reply = JSON.parse(mockWs.sentData[0]);
    expect(reply.type).toBe('error');
    expect(reply.error).toContain('Cannot switch session on an existing connection');
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('broadcasts real-time streaming tokens and tool events to the active session', () => {
    const channel = new WebChatChannel();
    const mockWs = new MockWebSocket() as any;
    channel.handleConnection(mockWs, { url: '/chat?sessionId=stream-session' });

    channel.sendToken('stream-session', 'Hello');
    channel.sendToken('stream-session', ' world');
    channel.sendToolStart('stream-session', 'run_shell', { command: 'node -v' });
    channel.sendToolEnd('stream-session', 'run_shell', true, 'v22.0.0', 42);

    expect(mockWs.sentData.length).toBe(4);
    const token1 = JSON.parse(mockWs.sentData[0]);
    expect(token1).toEqual({ type: 'token', token: 'Hello', chatId: 'stream-session' });

    const token2 = JSON.parse(mockWs.sentData[1]);
    expect(token2).toEqual({ type: 'token', token: ' world', chatId: 'stream-session' });

    const toolStart = JSON.parse(mockWs.sentData[2]);
    expect(toolStart).toEqual({
      type: 'tool_start',
      toolName: 'run_shell',
      input: { command: 'node -v' },
      chatId: 'stream-session',
    });

    const toolEnd = JSON.parse(mockWs.sentData[3]);
    expect(toolEnd).toEqual({
      type: 'tool_end',
      toolName: 'run_shell',
      success: true,
      result: 'v22.0.0',
      durationMs: 42,
      chatId: 'stream-session',
    });
  });
});
