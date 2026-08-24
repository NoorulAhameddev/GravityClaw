import { GravityClawClient } from '@gravityclaw/client';

const client = new GravityClawClient({
  baseUrl: process.env.GRAVITYCLAW_URL || 'http://localhost:3000',
  apiKey: process.env.GRAVITYCLAW_API_KEY || '',
});

async function main() {
  const sessions = await client.listSessions();
  console.log('Sessions:', sessions);

  const tools = await client.listTools();
  console.log('Tools:', tools.map((t) => t.name));

  if (sessions[0]) {
    const messages = await client.listMemoryMessages(sessions[0].id, 10);
    console.log('Recent memory:', messages);
  }

  const usage = await client.getUsage();
  console.log('Usage:', usage);
}

main().catch(console.error);
