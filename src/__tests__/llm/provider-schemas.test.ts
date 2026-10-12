import { describe, it, expect } from 'vitest';
import { AnthropicProvider } from '../../llm/anthropic.ts';
import { GoogleProvider } from '../../llm/google.ts';

describe('LLM Provider Message Schema Conformity', () => {
  it('should not include invalid caller field in Anthropic tool use blocks', () => {
    const provider = new AnthropicProvider('dummy-key');
    const messages: any[] = [
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"Tokyo"}' },
          },
        ],
      },
    ];

    const { anthropicMessages } = (provider as any).convertMessages(messages);
    expect(anthropicMessages).toHaveLength(1);
    const contentBlock = anthropicMessages[0].content[0];
    expect(contentBlock.type).toBe('tool_use');
    expect(contentBlock.caller).toBeUndefined();
  });

  it('should bundle parallel tool results into a single user turn in Anthropic', () => {
    const provider = new AnthropicProvider('dummy-key');
    const messages: any[] = [
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 't1', arguments: '{}' } },
          { id: 'call_2', type: 'function', function: { name: 't2', arguments: '{}' } },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'call_1',
        content: 'result 1',
      },
      {
        role: 'tool',
        tool_call_id: 'call_2',
        content: 'result 2',
      },
    ];

    const { anthropicMessages } = (provider as any).convertMessages(messages);
    // Should have 1 assistant message, followed by 1 consolidated user message containing 2 tool_results
    expect(anthropicMessages).toHaveLength(2);
    expect(anthropicMessages[0].role).toBe('assistant');
    expect(anthropicMessages[1].role).toBe('user');
    expect(anthropicMessages[1].content).toHaveLength(2);
    expect(anthropicMessages[1].content[0].type).toBe('tool_result');
    expect(anthropicMessages[1].content[1].type).toBe('tool_result');
  });

  it('should convert tool results to user role for Google Generative AI', () => {
    const provider = new GoogleProvider('dummy-key');
    const messages: any[] = [
      {
        role: 'tool',
        name: 'test_tool',
        content: 'output data',
      },
    ];

    const { contents } = (provider as any).convertMessages(messages);
    expect(contents).toHaveLength(1);
    expect(contents[0].role).toBe('user');
    expect(contents[0].parts[0].functionResponse).toBeDefined();
  });
});
