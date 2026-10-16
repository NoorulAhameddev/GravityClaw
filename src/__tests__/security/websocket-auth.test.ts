import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage } from 'http';

async function loadAuth(allowLocalhost: boolean) {
  vi.resetModules();
  vi.doMock('../../config.ts', () => ({
    config: {
      NODE_ENV: 'development',
      AUTH_ALLOW_LOCALHOST: allowLocalhost,
      API_KEY: 'test-api-key-which-is-long-enough-for-this-test',
      JWT_SECRET: undefined,
    },
  }));
  vi.doMock('../../logger.ts', () => ({
    createLogger: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }));
  return import('../../middleware/websocket-auth.ts');
}

function createRequest(remoteAddress: string): IncomingMessage {
  return {
    url: '/chat',
    headers: { host: 'localhost:3000' },
    socket: { remoteAddress },
  } as unknown as IncomingMessage;
}

describe('WebSocket localhost authentication bypass', () => {
  afterEach(() => {
    vi.doUnmock('../../config.ts');
    vi.doUnmock('../../logger.ts');
  });

  it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])(
    'rejects unauthenticated loopback connections in development by default (%s)',
    async (remoteAddress) => {
      const { validateWebSocketAuth } = await loadAuth(false);
      const result = validateWebSocketAuth(createRequest(remoteAddress), '/chat');
      expect(result.isAuthenticated).toBe(false);
    },
  );

  it('allows loopback only when AUTH_ALLOW_LOCALHOST is explicitly enabled', async () => {
    const { validateWebSocketAuth } = await loadAuth(true);
    const result = validateWebSocketAuth(createRequest('127.0.0.1'), '/chat');
    expect(result.isAuthenticated).toBe(true);
    expect(result.sessionId).toBe('local');
  });

  it('continues to reject unauthenticated non-loopback connections', async () => {
    const { validateWebSocketAuth } = await loadAuth(false);
    const result = validateWebSocketAuth(createRequest('192.0.2.10'), '/chat');
    expect(result.isAuthenticated).toBe(false);
  });
});
