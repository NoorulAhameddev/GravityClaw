import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getHistory,
  addUserMessage,
  addAssistantMessage,
  addToolResult
} from '../llm/index.ts';
import { db } from '../db.ts';
import { config } from '../config.ts';

const testDeps = { db, config };

describe('LLM History Management', () => {
  const testSessionId = 'test:session:llm';

  beforeEach(() => {
    db.prepare('DELETE FROM memory WHERE session_id = ?').run(testSessionId);
  });

  afterEach(() => {
    db.prepare('DELETE FROM memory WHERE session_id = ?').run(testSessionId);
  });

  describe('getHistory', () => {
    it('should return empty array for new session', () => {
      const history = getHistory(testSessionId, testDeps);
      expect(history).toEqual([]);
    });

    it('should return messages in chronological order', () => {
      addUserMessage(testSessionId, 'Hello', testDeps);
      addAssistantMessage(testSessionId, 'Hi there!', testDeps);
      addUserMessage(testSessionId, 'How are you?', testDeps);

      const history = getHistory(testSessionId, testDeps);
      expect(history).toHaveLength(3);
      expect(history[0]).toMatchObject({ role: 'user', content: 'Hello' });
      expect(history[1]).toMatchObject({ role: 'assistant', content: 'Hi there!' });
      expect(history[2]).toMatchObject({ role: 'user', content: 'How are you?' });
    });
  });

  describe('addUserMessage', () => {
    it('should add user message to history', () => {
      addUserMessage(testSessionId, 'Test message', testDeps);

      const history = getHistory(testSessionId, testDeps);
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        role: 'user',
        content: 'Test message'
      });
    });

    it('should handle multiple messages', () => {
      addUserMessage(testSessionId, 'First', testDeps);
      addUserMessage(testSessionId, 'Second', testDeps);
      addUserMessage(testSessionId, 'Third', testDeps);

      const history = getHistory(testSessionId, testDeps);
      expect(history).toHaveLength(3);
    });
  });

  describe('addAssistantMessage', () => {
    it('should add assistant message without tool calls', () => {
      addAssistantMessage(testSessionId, 'Response text', testDeps);

      const history = getHistory(testSessionId, testDeps);
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        role: 'assistant',
        content: 'Response text'
      });
    });

    it('should add assistant message with tool calls', () => {
      const toolCalls = [{
        id: 'call_123',
        type: 'function' as const,
        function: {
          name: 'get_datetime',
          arguments: '{}'
        }
      }];

      addAssistantMessage(testSessionId, 'Let me check...', testDeps, toolCalls);

      const history = getHistory(testSessionId, testDeps);
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        role: 'assistant',
        content: 'Let me check...'
      });
      expect((history[0] as any).tool_calls).toBeDefined();
      expect((history[0] as any).tool_calls).toHaveLength(1);
    });
  });

  describe('addToolResult', () => {
    it('should add tool result message', () => {
      addToolResult(testSessionId, 'call_123', 'Tool completed successfully', testDeps);

      const history = getHistory(testSessionId, testDeps);
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        role: 'tool',
        tool_call_id: 'call_123',
        content: 'Tool completed successfully'
      });
    });
  });

  describe('Conversation flow', () => {
    it('should handle complete conversation with tool use', () => {
      addUserMessage(testSessionId, 'What time is it?', testDeps);

      const toolCalls = [{
        id: 'call_datetime_1',
        type: 'function' as const,
        function: {
          name: 'get_datetime',
          arguments: '{}'
        }
      }];
      addAssistantMessage(testSessionId, 'Let me check the time for you.', testDeps, toolCalls);

      addToolResult(testSessionId, 'call_datetime_1', '2026-03-01T10:30:00Z', testDeps);

      addAssistantMessage(testSessionId, 'It is 10:30 AM UTC.', testDeps);

      const history = getHistory(testSessionId, testDeps);
      expect(history).toHaveLength(4);
      expect(history.map(m => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
    });
  });
});
