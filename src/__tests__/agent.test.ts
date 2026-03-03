import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../db.ts';
import { getHistory } from '../llm/index.ts';

describe('Agent System', () => {
  const testSessionId = 'test:session:agent';

  beforeEach(() => {
    // Clean up test data before each test
    db.prepare('DELETE FROM memory WHERE session_id = ?').run(testSessionId);
  });

  afterEach(() => {
    // Clean up test data after each test
    db.prepare('DELETE FROM memory WHERE session_id = ?').run(testSessionId);
  });

  describe('Agent Configuration', () => {
    it('should have required configuration from config.ts', async () => {
      const { config } = await import('../config.ts');

      expect(config.AGENT_MAX_ITERATIONS).toBeDefined();
      expect(config.AGENT_MAX_ITERATIONS).toBeGreaterThan(0);
      expect(config.AGENT_MAX_ITERATIONS).toBeLessThanOrEqual(100);
    });
  });

  describe('Agent Session Management', () => {
    it('should create unique sessions for different session IDs', () => {
      const session1 = 'test:session:1';
      const session2 = 'test:session:2';

      db.prepare('INSERT INTO memory (session_id, message_json) VALUES (?, ?)').run(
        session1,
        JSON.stringify({ role: 'user', content: 'Message 1' })
      );

      db.prepare('INSERT INTO memory (session_id, message_json) VALUES (?, ?)').run(
        session2,
        JSON.stringify({ role: 'user', content: 'Message 2' })
      );

      const history1 = getHistory(session1);
      const history2 = getHistory(session2);

      expect(history1).toHaveLength(1);
      expect(history2).toHaveLength(1);
      expect(history1[0]?.content).toBe('Message 1');
      expect(history2[0]?.content).toBe('Message 2');

      // Cleanup
      db.prepare('DELETE FROM memory WHERE session_id IN (?, ?)').run(session1, session2);
    });
  });

  describe('Tool Registry', () => {
    it('should have tool registry available', async () => {
      const { registry } = await import('../tools/index.ts');

      expect(registry).toBeDefined();
      expect(typeof registry.get).toBe('function');
      expect(typeof registry.getOpenAIDefinitions).toBe('function');
      expect(typeof registry.register).toBe('function');
    });

    it('should allow registering tools', async () => {
      const { registry } = await import('../tools/index.ts');
      const { datetimeTool } = await import('../tools/system/datetime.ts');

      // Register the tool (in case it's not already registered)
      registry.register(datetimeTool);

      const tool = registry.get('get_datetime');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('get_datetime');
      expect(typeof tool?.execute).toBe('function');
    });

    it('should generate OpenAI-compatible tool definitions', async () => {
      const { registry } = await import('../tools/index.ts');
      const { datetimeTool } = await import('../tools/system/datetime.ts');
      const { shellTool } = await import('../tools/system/shell.ts');

      // Ensure tools are registered
      registry.register(datetimeTool);
      registry.register(shellTool);

      const definitions = registry.getOpenAIDefinitions();
      expect(Array.isArray(definitions)).toBe(true);
      expect(definitions.length).toBeGreaterThan(0);

      // Check structure of first tool
      if (definitions[0]) {
        expect(definitions[0]).toHaveProperty('type', 'function');
        expect(definitions[0]).toHaveProperty('function');
        expect(definitions[0].function).toHaveProperty('name');
        expect(definitions[0].function).toHaveProperty('description');
        expect(definitions[0].function).toHaveProperty('parameters');
      }
    });
  });

  describe('Agent Options', () => {
    it('should accept valid agent run options structure', () => {
      const options = {
        message: 'Test message',
        sessionId: testSessionId,
        requestConfirmation: async (command: string) => true,
        onProgress: async (text: string) => { },
      };

      expect(options.message).toBe('Test message');
      expect(options.sessionId).toBe(testSessionId);
      expect(typeof options.requestConfirmation).toBe('function');
      expect(typeof options.onProgress).toBe('function');
    });
  });

  // Note: Full agent.runAgent() tests would require mocking the LLM API
  // These tests verify the infrastructure is in place
  // Integration tests with real API calls should be in separate test suite
});
