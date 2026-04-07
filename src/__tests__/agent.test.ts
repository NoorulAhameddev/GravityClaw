import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isMeaningfulProgress } from '../agent.ts';
import { db } from '../db.ts';
import { config } from '../config.ts';
import { getHistory } from '../llm/index.ts';

const testDeps = { db, config };

describe('Agent System', () => {
  const testSessionId = 'test:session:agent';

  beforeEach(() => {
    db.prepare('DELETE FROM memory WHERE session_id = ?').run(testSessionId);
  });

  afterEach(() => {
    db.prepare('DELETE FROM memory WHERE session_id = ?').run(testSessionId);
  });

  describe('Agent Configuration', () => {
    it('should have required configuration from config.ts', async () => {
      const { config } = await import('../config.ts');

      expect(config.AGENT_MAX_ITERATIONS).toBeDefined();
      expect(config.AGENT_MAX_ITERATIONS).toBeGreaterThan(0);
      expect(config.AGENT_MAX_ITERATIONS).toBeLessThanOrEqual(100);
    });

    it('should have tool limit configurations', async () => {
      const { config } = await import('../config.ts');

      expect(config.AGENT_MAX_TOOLS_PER_ITERATION).toBeDefined();
      expect(config.AGENT_MAX_TOOLS_PER_ITERATION).toBeGreaterThan(0);
      expect(config.AGENT_MAX_TOOLS_PER_ITERATION).toBeLessThanOrEqual(100);
      
      expect(config.AGENT_MAX_TOOLS_TOTAL).toBeDefined();
      expect(config.AGENT_MAX_TOOLS_TOTAL).toBeGreaterThan(0);
      expect(config.AGENT_MAX_TOOLS_TOTAL).toBeLessThanOrEqual(1000);
      
      // Total should be >= per iteration
      expect(config.AGENT_MAX_TOOLS_TOTAL).toBeGreaterThanOrEqual(config.AGENT_MAX_TOOLS_PER_ITERATION);
    });

    it('should have reasonable default values for tool limits', async () => {
      const { config } = await import('../config.ts');

      // Default per-iteration limit should be reasonable (e.g., between 1 and 20)
      expect(config.AGENT_MAX_TOOLS_PER_ITERATION).toBeGreaterThanOrEqual(1);
      expect(config.AGENT_MAX_TOOLS_PER_ITERATION).toBeLessThanOrEqual(20);
      
      // Default total limit should be reasonable (e.g., between 10 and 200)
      expect(config.AGENT_MAX_TOOLS_TOTAL).toBeGreaterThanOrEqual(10);
      expect(config.AGENT_MAX_TOOLS_TOTAL).toBeLessThanOrEqual(200);
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

      const history1 = getHistory(session1, testDeps);
      const history2 = getHistory(session2, testDeps);

      expect(history1).toHaveLength(1);
      expect(history2).toHaveLength(1);
      expect(history1[0]?.content).toBe('Message 1');
      expect(history2[0]?.content).toBe('Message 2');

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

  describe('Agent Progress Detection', () => {
    it('should mark meaningful progress for detailed text outputs', () => {
      expect(isMeaningfulProgress('This is a concrete response with sufficient length and no errors.')).toBe(true);
    });

    it('should not mark progress for short or error texts', () => {
      expect(isMeaningfulProgress('error')).toBe(false);
      expect(isMeaningfulProgress('Too short')).toBe(false);
      expect(isMeaningfulProgress('Exception occurred')).toBe(false);
    });
  });

  // Note: Full agent.runAgent() tests would require mocking the LLM API
  // These tests verify the infrastructure is in place
  // Integration tests with real API calls should be in separate test suite
});
