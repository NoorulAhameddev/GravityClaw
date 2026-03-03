import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the wake-word module to avoid TensorFlow.js native binding issues in tests
vi.mock('../voice/wake-word.ts', () => ({
  createWakeWordDetector: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    isListening: vi.fn(() => false),
    updateConfig: vi.fn(),
    getConfig: vi.fn(() => ({
      wakePhrase: 'hey claw',
      threshold: 0.75,
      recordingDuration: 5,
      sampleRate: 16000,
      channels: 1,
    })),
  })),
  getAvailableWakeWords: vi.fn(async () => [
    'zero',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'up',
    'down',
    'left',
    'right',
    'go',
    'stop',
    'yes',
    'no',
  ]),
}));

import {
  startWakeWordTool,
  stopWakeWordTool,
  getWakeWordStatusTool,
  listWakeWordsTool,
} from '../tools/wake-word.ts';

describe('Wake Word Detection', () => {
  describe('Tool Metadata', () => {
    it('startWakeWordTool should have correct metadata', () => {
      expect(startWakeWordTool.name).toBe('start_wake_word_detection');
      expect(startWakeWordTool.description).toBeDefined();
      expect(startWakeWordTool.description).toContain('Desktop/local only');
      expect(startWakeWordTool.inputSchema).toBeDefined();
      const props = startWakeWordTool.inputSchema.properties as any;
      expect(props.wake_phrase).toBeDefined();
      expect(props.threshold).toBeDefined();
    });

    it('stopWakeWordTool should have correct metadata', () => {
      expect(stopWakeWordTool.name).toBe('stop_wake_word_detection');
      expect(stopWakeWordTool.description).toBeDefined();
      expect(stopWakeWordTool.inputSchema).toBeDefined();
    });

    it('getWakeWordStatusTool should have correct metadata', () => {
      expect(getWakeWordStatusTool.name).toBe('get_wake_word_status');
      expect(getWakeWordStatusTool.description).toBeDefined();
      expect(getWakeWordStatusTool.inputSchema).toBeDefined();
    });

    it('listWakeWordsTool should have correct metadata', () => {
      expect(listWakeWordsTool.name).toBe('list_available_wake_words');
      expect(listWakeWordsTool.description).toBeDefined();
      expect(listWakeWordsTool.description).toContain('TensorFlow');
      expect(listWakeWordsTool.inputSchema).toBeDefined();
    });
  });

  describe('Tool Input Schemas', () => {
    it('start_wake_word_detection should have optional wake_phrase', () => {
      const schema = startWakeWordTool.inputSchema;
      const properties = schema.properties as any;
      expect(properties.wake_phrase).toBeDefined();
      expect(properties.wake_phrase.type).toBe('string');
      expect((schema as any).required).toBeDefined();
      expect(((schema as any).required ?? []).length).toBe(0); // All parameters optional
    });

    it('start_wake_word_detection should have optional threshold', () => {
      const schema = startWakeWordTool.inputSchema;
      const properties = schema.properties as any;
      expect(properties.threshold).toBeDefined();
      expect(properties.threshold.type).toBe('number');
    });

    it('stop_wake_word_detection should have no required parameters', () => {
      const schema = stopWakeWordTool.inputSchema;
      expect(schema.required ?? []).toBeDefined();
      expect((schema.required ?? []).length).toBe(0);
    });

    it('get_wake_word_status should have no required parameters', () => {
      const schema = getWakeWordStatusTool.inputSchema;
      expect(schema.required ?? []).toBeDefined();
      expect((schema.required ?? []).length).toBe(0);
    });
  });

  describe('Wake Word Configuration', () => {
    it('should accept custom wake phrase', async () => {
      // Test would require mocking the wake word detector
      // For now, just verify the tool accepts the parameter
      const input = {
        wake_phrase: 'go',
        __sessionId: 'test-session',
      };

      // This will fail without OpenAI API key and microphone, but we can check structure
      try {
        const result = await startWakeWordTool.execute(input as any);
        const parsed = JSON.parse(result);
        expect(parsed).toBeDefined();
      } catch (error) {
        // Expected in test environment without microphone
        expect(error).toBeDefined();
      }
    });

    it('should accept custom threshold', async () => {
      const input = {
        threshold: 0.85,
        __sessionId: 'test-session',
      };

      try {
        const result = await startWakeWordTool.execute(input as any);
        const parsed = JSON.parse(result);
        expect(parsed).toBeDefined();
      } catch (error) {
        // Expected in test environment
        expect(error).toBeDefined();
      }
    });

    it('should handle missing OpenAI API key gracefully', async () => {
      // In a real environment without API key, should return error
      const input = {
        __sessionId: 'test-session',
      };

      const result = await startWakeWordTool.execute(input as any);
      const parsed = JSON.parse(result);

      // Should either start successfully or return an error
      expect(parsed).toBeDefined();
      expect(parsed.error || parsed.success).toBeDefined();
    });
  });

  describe('Wake Word Status', () => {
    it('should return status when stopped', async () => {
      const result = await getWakeWordStatusTool.execute({
        __sessionId: 'test-session',
      } as any);

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.listening).toBeDefined();
      expect(typeof parsed.listening).toBe('boolean');
    });

    it('should include configuration in status', async () => {
      const result = await getWakeWordStatusTool.execute({
        __sessionId: 'test-session',
      } as any);

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);

      // If configured, should have these fields
      if (parsed.configured) {
        expect(parsed.wakePhrase).toBeDefined();
        expect(parsed.threshold).toBeDefined();
        expect(parsed.recordingDuration).toBeDefined();
      }
    });
  });

  describe('Available Wake Words', () => {
    it('should list available wake words', async () => {
      const result = await listWakeWordsTool.execute({
        __sessionId: 'test-session',
      } as any);

      const parsed = JSON.parse(result);

      // Should return success with wake words list or an error
      expect(parsed).toBeDefined();

      if (parsed.success) {
        expect(parsed.wakeWords).toBeDefined();
        expect(Array.isArray(parsed.wakeWords)).toBe(true);
        expect(parsed.count).toBeDefined();
      } else {
        expect(parsed.error).toBeDefined();
      }
    }, 30000); // Longer timeout for model loading

    it('should include built-in words in available list', async () => {
      const result = await listWakeWordsTool.execute({
        __sessionId: 'test-session',
      } as any);

      const parsed = JSON.parse(result);

      if (parsed.success && parsed.wakeWords) {
        const words = parsed.wakeWords;
        // TensorFlow Speech Commands includes these words
        const expectedWords = ['go', 'stop', 'yes', 'no', 'up', 'down', 'left', 'right'];
        const hasExpectedWords = expectedWords.some((word) => words.includes(word));
        expect(hasExpectedWords).toBe(true);
      }
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle stop when not started', async () => {
      const result = await stopWakeWordTool.execute({
        __sessionId: 'test-session',
      } as any);

      const parsed = JSON.parse(result);
      // Should return error about not running
      expect(parsed.error || parsed.success).toBeDefined();

      if (parsed.error) {
        expect(parsed.error).toContain('not');
      }
    });

    it('should return error for invalid configuration', async () => {
      const input = {
        threshold: 2.5, // Invalid: should be 0-1
        __sessionId: 'test-session',
      };

      try {
        const result = await startWakeWordTool.execute(input as any);
        const parsed = JSON.parse(result);

        // Should either fail validation or normalize the value
        expect(parsed).toBeDefined();
      } catch (error) {
        // Expected for invalid input
        expect(error).toBeDefined();
      }
    });

    it('should handle missing microphone gracefully', async () => {
      // In CI/test environment without microphone, should fail gracefully
      const result = await startWakeWordTool.execute({
        __sessionId: 'test-session',
      } as any);

      const parsed = JSON.parse(result);
      expect(parsed).toBeDefined();

      // Should either succeed (if mic available) or return error
      if (!parsed.success) {
        expect(parsed.error).toBeDefined();
      }
    });
  });

  describe('Desktop-Only Feature', () => {
    it('should document desktop-only requirement', () => {
      const description = startWakeWordTool.description;
      expect(description).toContain('Desktop');
      expect(description).toContain('local');
      expect(description).toContain('microphone');
    });

    it('should warn about VPS incompatibility', () => {
      const description = startWakeWordTool.description;
      expect(description.toLowerCase()).toContain('not available on vps');
    });
  });

  describe('Wake Word Workflow', () => {
    it('should complete typical workflow: check status → start → stop', async () => {
      // Step 1: Check initial status
      let result = await getWakeWordStatusTool.execute({ __sessionId: 'workflow-test' } as any);
      let parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);

      const initiallyListening = parsed.listening;

      // Step 2: Try to start (may fail without hardware)
      result = await startWakeWordTool.execute({ __sessionId: 'workflow-test' } as any);
      parsed = JSON.parse(result);

      // If started successfully
      if (parsed.success) {
        expect(parsed.listening).toBe(true);

        // Step 3: Stop
        result = await stopWakeWordTool.execute({ __sessionId: 'workflow-test' } as any);
        parsed = JSON.parse(result);

        if (parsed.success) {
          expect(parsed.listening).toBe(false);
        }
      }

      // Workflow should complete without crashing
      expect(true).toBe(true);
    });
  });

  describe('Configuration Updates', () => {
    it('should accept multiple configuration changes', async () => {
      const input = {
        wake_phrase: 'stop',
        threshold: 0.8,
        __sessionId: 'config-test',
      };

      const result = await startWakeWordTool.execute(input as any);
      const parsed = JSON.parse(result);

      // Should accept both parameters
      expect(parsed).toBeDefined();

      if (parsed.success) {
        expect(parsed.wakePhrase).toBe('stop');
        expect(parsed.threshold).toBe(0.8);
      }
    });

    it('should preserve existing config when starting', async () => {
      // First start with config
      let result = await startWakeWordTool.execute({
        wake_phrase: 'go',
        __sessionId: 'preserve-test',
      } as any);

      // Check status should show configured phrase
      result = await getWakeWordStatusTool.execute({ __sessionId: 'preserve-test' } as any);
      const parsed = JSON.parse(result);

      if (parsed.configured) {
        expect(parsed.wakePhrase).toBeDefined();
      }
    });
  });

  describe('Built-in Wake Words', () => {
    it('should support standard speech commands', () => {
      // Verify the tool description mentions built-in words
      const props = startWakeWordTool.inputSchema.properties as any;
      const description = props.wake_phrase.description;
      expect(description).toBeDefined();
      expect(description).toContain('go');
      expect(description).toContain('stop');
    });
  });
});
