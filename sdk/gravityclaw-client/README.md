# @gravityclaw/client

TypeScript SDK for the GravityClaw AI Agent Platform HTTP API.

## Installation

```bash
npm install @gravityclaw/client
```

## Usage

```typescript
import { GravityClawClient } from '@gravityclaw/client';

const client = new GravityClawClient({
  baseUrl: 'https://your-instance.gravityclaw.dev',
  apiKey: 'your-api-key',
});

const sessions = await client.listSessions();

const messages = await client.listMemoryMessages(sessions[0].id);

const result = await client.executeTool('web_search', { query: 'hello' });

const usage = await client.getUsage();
```

## Chat over WebSocket

There is no HTTP chat or streaming endpoint yet — agent chat happens over
WebSocket. Request a session token via `POST /api/auth/token`, then connect to
`ws://<host>/?token=<token>&session=<sessionId>`. The `createSession`, `chat`,
and `chatStream` client methods intentionally throw
`GravityClawError` (501) until an HTTP surface exists.
