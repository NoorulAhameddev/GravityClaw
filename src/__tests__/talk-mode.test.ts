/**
 * Tests for Talk Mode
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock config to provide fake API key while keeping other config intact
vi.mock('../config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config.ts')>();
  return {
    ...actual,
    config: {
      ...actual.config,
      OPENAI_API_KEY: 'test-api-key',
      WAKE_WORD_PHRASE: 'hey claw',
      WAKE_WORD_THRESHOLD: 0.75,
    }
  };
});

// Shared mock handler state (singleton behavior)
let mockHandlerState = {
  active: false,
  config: {
    wakePhrase: 'hey claw',
    wakeThreshold: 0.75,
    vadThreshold: 0.3,
    silenceDuration: 1500,
    maxRecordingDuration: 30,
    sampleRate: 16000,
    channels: 1,
  },
  callbacks: null as any,
};

// Mock the voice modules to avoid native dependencies
vi.mock('../voice/talk-mode.ts', () => {
  return {
    createTalkModeHandler: vi.fn(() => {
      return {
        start: vi.fn(async (cbs: any) => {
          if (mockHandlerState.active) {
            throw new Error('Already running');
          }
          mockHandlerState.active = true;
          mockHandlerState.callbacks = cbs;
        }),
        stop: vi.fn(async () => {
          mockHandlerState.active = false;
          mockHandlerState.callbacks = null;
        }),
        isActive: vi.fn(() => mockHandlerState.active),
        updateConfig: vi.fn((newConfig: any) => {
          mockHandlerState.config = { ...mockHandlerState.config, ...newConfig };
        }),
        getConfig: vi.fn(() => ({ ...mockHandlerState.config })),
      };
    }),
  };
});

// Import after mocking
import { 
  startTalkModeTool, 
  stopTalkModeTool, 
  getTalkModeStatusTool,
} from '../tools/voice/talk-mode.ts';

describe('Talk Mode', () => {
  // Reset mock state before each test
  beforeEach(() => {
    mockHandlerState.active = false;
    mockHandlerState.config = {
      wakePhrase: 'hey claw',
      wakeThreshold: 0.75,
      vadThreshold: 0.3,
      silenceDuration: 1500,
      maxRecordingDuration: 30,
      sampleRate: 16000,
      channels: 1,
    };
    mockHandlerState.callbacks = null;
  });
  
  describe('Tool Metadata', () => {
    it('startTalkModeTool should have correct metadata', () => {
      expect(startTalkModeTool.name).toBe('start_talk_mode');
      expect(startTalkModeTool.description).toContain('continuous');
      expect(startTalkModeTool.description).toContain('Desktop');
      expect(startTalkModeTool.inputSchema).toBeDefined();
      expect(startTalkModeTool.inputSchema.type).toBe('object');
    });

    it('stopTalkModeTool should have correct metadata', () => {
      expect(stopTalkModeTool.name).toBe('stop_talk_mode');
      expect(stopTalkModeTool.description).toContain('Stop');
      expect(stopTalkModeTool.inputSchema).toBeDefined();
    });

    it('getTalkModeStatusTool should have correct metadata', () => {
      expect(getTalkModeStatusTool.name).toBe('get_talk_mode_status');
      expect(getTalkModeStatusTool.description).toContain('active');
      expect(getTalkModeStatusTool.inputSchema).toBeDefined();
    });
  });

  describe('Tool Input Schemas', () => {
    it('start_talk_mode should have optional configuration parameters', () => {
      const schema = startTalkModeTool.inputSchema;
      expect(schema.properties).toHaveProperty('wake_phrase');
      expect(schema.properties).toHaveProperty('wake_threshold');
      expect(schema.properties).toHaveProperty('silence_duration');
      expect(schema.properties).toHaveProperty('max_recording_duration');
      expect(schema.required).toEqual([]);
    });

    it('start_talk_mode wake_threshold should have constraints', () => {
      const schema = startTalkModeTool.inputSchema;
      const properties = schema.properties as any;
      expect(properties.wake_threshold).toHaveProperty('minimum', 0);
      expect(properties.wake_threshold).toHaveProperty('maximum', 1);
    });

    it('stop_talk_mode should have no required parameters', () => {
      const schema = stopTalkModeTool.inputSchema;
      expect(schema.required).toEqual([]);
    });

    it('get_talk_mode_status should have no required parameters', () => {
      const schema = getTalkModeStatusTool.inputSchema;
      expect(schema.required).toEqual([]);
    });
  });

  describe('Talk Mode Configuration', () => {
    it('should start with default configuration', async () => {
      const result = await startTalkModeTool.execute({});
      const response = JSON.parse(result);
      
      expect(response.success).toBe(true);
      expect(response.config).toBeDefined();
      expect(response.config.wake_phrase).toBe('hey claw');
      expect(response.config.wake_threshold).toBe(0.75);
    });

    it('should accept custom wake phrase', async () => {
      const result = await startTalkModeTool.execute({
        wake_phrase: 'hey assistant',
      });
      const response = JSON.parse(result);
      
      expect(response.success).toBe(true);
      expect(response.config.wake_phrase).toBe('hey assistant');
    });

    it('should accept custom threshold', async () => {
      const result = await startTalkModeTool.execute({
        wake_threshold: 0.9,
      });
      const response = JSON.parse(result);
      
      expect(response.success).toBe(true);
      expect(response.config.wake_threshold).toBe(0.9);
    });

    it('should accept custom silence duration', async () => {
      const result = await startTalkModeTool.execute({
        silence_duration: 2000,
      });
      const response = JSON.parse(result);
      
      expect(response.success).toBe(true);
      expect(response.config.silence_duration).toBe(2000);
    });
  });

  describe('Talk Mode Status', () => {
    it('should report not active when stopped', async () => {
      const result = await getTalkModeStatusTool.execute({});
      const response = JSON.parse(result);
      
      expect(response.success).toBe(true);
      expect(response.is_active).toBe(false);
      expect(response.status).toContain('Stopped');
    });

    it('should include compatibility information', async () => {
      const result = await getTalkModeStatusTool.execute({});
      const response = JSON.parse(result);
      
      expect(response.success).toBe(true);
      expect(response.compatibility).toBeDefined();
      expect(response.compatibility.desktop).toBe(true);
      expect(response.compatibility.vps).toBe(false);
      expect(response.compatibility.requires).toContain('microphone');
    });

    it('should include current configuration', async () => {
      const result = await getTalkModeStatusTool.execute({});
      const response = JSON.parse(result);
      
      expect(response.success).toBe(true);
      // Config might be null if not initialized
      if (response.config) {
        expect(response.config).toHaveProperty('wakePhrase');
        expect(response.config).toHaveProperty('wakeThreshold');
      }
    });
  });

  describe('Error Handling', () => {
    it('should prevent starting talk mode twice', async () => {
      await startTalkModeTool.execute({});
      
      const result = await startTalkModeTool.execute({});
      const response = JSON.parse(result);
      
      expect(response.success).toBe(false);
      expect(response.error).toContain('already running');
      
      // Cleanup
      await stopTalkModeTool.execute({});
    });

    it('should handle stop when not running gracefully', async () => {
      const result = await stopTalkModeTool.execute({});
      const response = JSON.parse(result);
      
      expect(response.success).toBe(false);
      expect(response.error).toContain('not');
    });
  });

  describe('Desktop-Only Feature', () => {
    it('should document desktop-only requirement in start tool', () => {
      expect(startTalkModeTool.description).toContain('Desktop');
      expect(startTalkModeTool.description).toContain('not available on VPS');
    });

    it('should document microphone requirement', () => {
      expect(startTalkModeTool.description.toLowerCase()).toContain('microphone');
    });

    it('should warn about VPS incompatibility in description', () => {
      expect(startTalkModeTool.description.toLowerCase()).toContain('vps');
    });
  });

  describe('Talk Mode Workflow', () => {
    it('should complete typical workflow: check status → start → check status → stop', async () => {
      // Check initial status
      const status1 = await getTalkModeStatusTool.execute({});
      const statusResponse1 = JSON.parse(status1);
      expect(statusResponse1.success).toBe(true);
      
      // Start talk mode
      const start = await startTalkModeTool.execute({});
      const startResponse = JSON.parse(start);
      expect(startResponse.success).toBe(true);
      
      // Check status while running
      const status2 = await getTalkModeStatusTool.execute({});
      const statusResponse2 = JSON.parse(status2);
      expect(statusResponse2.success).toBe(true);
      expect(statusResponse2.is_active).toBe(true);
      
      // Stop talk mode
      const stop = await stopTalkModeTool.execute({});
      const stopResponse = JSON.parse(stop);
      expect(stopResponse.success).toBe(true);
    });
  });

  describe('Configuration Updates', () => {
    it('should accept multiple configuration changes', async () => {
      const result = await startTalkModeTool.execute({
        wake_phrase: 'hello robot',
        wake_threshold: 0.8,
        silence_duration: 2000,
        max_recording_duration: 45,
      });
      const response = JSON.parse(result);
      
      expect(response.success).toBe(true);
      expect(response.config.wake_phrase).toBe('hello robot');
      expect(response.config.wake_threshold).toBe(0.8);
      expect(response.config.silence_duration).toBe(2000);
      expect(response.config.max_recording_duration).toBe(45);
      
      // Cleanup
      await stopTalkModeTool.execute({});
    });
  });

  describe('Talk Mode Instructions', () => {
    it('should provide usage instructions when starting', async () => {
      const result = await startTalkModeTool.execute({});
      const response = JSON.parse(result);
      
      expect(response.success).toBe(true);
      expect(response.instructions).toBeDefined();
      expect(response.instructions).toContain('wake phrase');
      
      // Cleanup
      await stopTalkModeTool.execute({});
    });

    it('should provide helpful message when stopping', async () => {
      await startTalkModeTool.execute({});
      
      const result = await stopTalkModeTool.execute({});
      const response = JSON.parse(result);
      
      expect(response.success).toBe(true);
      expect(response.message).toBeDefined();
      expect(response.message).toContain('stopped');
    });
  });

  describe('Talk Mode Features', () => {
    it('should support wake word detection', () => {
      expect(startTalkModeTool.description).toContain('wake word');
    });

    it('should support voice activity detection', () => {
      expect(startTalkModeTool.description).toContain('silence');
    });

    it('should support transcription', () => {
      expect(startTalkModeTool.description).toContain('Transcribe');
    });

    it('should support continuous conversation', () => {
      expect(startTalkModeTool.description).toContain('continuous');
    });
  });

  describe('API Response Format', () => {
    it('should return JSON with success field', async () => {
      const result = await getTalkModeStatusTool.execute({});
      const response = JSON.parse(result);
      
      expect(response).toHaveProperty('success');
      expect(typeof response.success).toBe('boolean');
    });

    it('should return error field on failure', async () => {
      const result = await stopTalkModeTool.execute({});
      const response = JSON.parse(result);
      
      if (!response.success) {
        expect(response).toHaveProperty('error');
        expect(typeof response.error).toBe('string');
      }
    });
  });
});
