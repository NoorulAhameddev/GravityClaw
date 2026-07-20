# @gravityclaw/client

TypeScript SDK for the GravityClaw AI Agent Platform.

## Installation

```bash
npm install @gravityclaw/client
```

## Usage

```typescript
import { GravityClawClient } from "@gravityclaw/client";

const client = new GravityClawClient({
    baseUrl: "https://your-instance.gravityclaw.dev",
    apiKey: "your-api-key",
});

// List sessions
const sessions = await client.listSessions();

// Chat
const response = await client.chat("session-id", "Hello!");

// Stream chat
for await (const chunk of client.chatStream("session-id", "Tell me a story")) {
    if (chunk.type === "text") console.log(chunk.content);
}
```

## API

See the [full documentation](https://docs.gravityclaw.dev/sdk).
