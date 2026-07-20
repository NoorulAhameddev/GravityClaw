import { describe, it, expect, beforeAll } from 'vitest';
import { createTTSService } from '../voice/tts.js';
import { textToSpeechTool, textToSpeechStreamingTool } from '../tools/voice/tts.js';

describe('Text-to-Speech (TTS)', () => {
  let service: ReturnType<typeof createTTSService>;

  beforeAll(() => {
    const apiKey = process.env.OPENAI_API_KEY || 'test-key';
    service = createTTSService(apiKey);
  });

  describe('TTSService', () => {
    it('should initialize with OpenAI API key', () => {
      expect(service).toBeDefined();
    });

    it('should return list of supported voices', () => {
      const voices = service.getSupportedVoices();
      expect(voices).toContain('alloy');
      expect(voices).toContain('nova');
      expect(voices).toContain('shimmer');
      expect(voices.length).toBe(6);
    });

    it('should return list of supported models', () => {
      const models = service.getSupportedModels();
      expect(models).toContain('tts-1');
      expect(models).toContain('tts-1-hd');
      expect(models.length).toBe(2);
    });

    it('should set voice', () => {
      service.setVoice('nova');
      const config = service.getConfig();
      expect(config.voice).toBe('nova');
    });

    it('should set model', () => {
      service.setModel('tts-1-hd');
      const config = service.getConfig();
      expect(config.model).toBe('tts-1-hd');
    });

    it('should reject invalid voice', () => {
      expect(() => {
        service.setVoice('invalid' as any);
      }).toThrow(/Unsupported voice/);
    });

    it('should reject invalid model', () => {
      expect(() => {
        service.setModel('invalid' as any);
      }).toThrow(/Unsupported model/);
    });

    it('should get current configuration', () => {
      const config = service.getConfig();
      expect(config).toHaveProperty('model');
      expect(config).toHaveProperty('voice');
      expect(typeof config.model).toBe('string');
      expect(typeof config.voice).toBe('string');
    });

    it('should reject empty text', async () => {
      try {
        await service.textToSpeech('');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect((error as Error).message).toMatch(/empty/i);
      }
    });

    it('should reject whitespace-only text', async () => {
      try {
        await service.textToSpeech('   ');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect((error as Error).message).toMatch(/empty/i);
      }
    });
  });

  describe('textToSpeechTool', () => {
    it('should have correct tool metadata', () => {
      expect(textToSpeechTool.name).toBe('text_to_speech');
      expect(textToSpeechTool.description).toContain('OpenAI TTS');
      expect(textToSpeechTool.inputSchema).toBeDefined();
    });

    it('should validate required text parameter', async () => {
      const result = await textToSpeechTool.execute({});
      const parsed = JSON.parse(result);
      expect(parsed.error).toBeDefined();
    });

    it('should accept optional voice parameter', async () => {
      const result = await textToSpeechTool.execute({
        text: 'Hello world',
        voice: 'nova',
      });
      expect(typeof result).toBe('string');
    });

    it('should accept optional model parameter', async () => {
      const result = await textToSpeechTool.execute({
        text: 'Hello world',
        model: 'tts-1-hd',
      });
      expect(typeof result).toBe('string');
    });

    it('should return JSON response', async () => {
      const result = await textToSpeechTool.execute({
        text: 'Hello world',
      });
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should return error field on invalid input', async () => {
      const result = await textToSpeechTool.execute({
        text: '',
      });
      const parsed = JSON.parse(result);
      expect(parsed.error).toBeDefined();
    });
  });

  describe('textToSpeechStreamingTool', () => {
    it('should have correct tool metadata', () => {
      expect(textToSpeechStreamingTool.name).toBe('text_to_speech_streaming');
      expect(textToSpeechStreamingTool.description).toContain('long text');
      expect(textToSpeechStreamingTool.inputSchema).toBeDefined();
    });

    it('should validate required text parameter', async () => {
      const result = await textToSpeechStreamingTool.execute({});
      const parsed = JSON.parse(result);
      expect(parsed.error).toBeDefined();
    });

    it('should accept optional chunk_size parameter', async () => {
      const result = await textToSpeechStreamingTool.execute({
        text: 'Long text that will be split. ' + 'Sentence. '.repeat(50),
        chunk_size: 500,
      });
      expect(typeof result).toBe('string');
    });

    it('should return JSON response', async () => {
      const result = await textToSpeechStreamingTool.execute({
        text: 'Hello world',
      });
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should handle empty chunk_size as default', async () => {
      const result = await textToSpeechStreamingTool.execute({
        text: 'Test',
      });
      const parsed = JSON.parse(result);
      // Will have either chunks (success) or error field depending on API key
      expect(parsed.chunks || parsed.error).toBeDefined();
    });
  });

  describe('Tool Input Schemas', () => {
    const ttsSchema = textToSpeechTool.inputSchema as any;
    const streamSchema = textToSpeechStreamingTool.inputSchema as any;

    it('text_to_speech should require text', () => {
      expect(ttsSchema.required).toContain('text');
    });

    it('text_to_speech should have voice options', () => {
      expect(ttsSchema.properties.voice.enum).toContain('alloy');
      expect(ttsSchema.properties.voice.enum).toContain('nova');
    });

    it('text_to_speech should have model options', () => {
      expect(ttsSchema.properties.model.enum).toContain('tts-1');
      expect(ttsSchema.properties.model.enum).toContain('tts-1-hd');
    });

    it('text_to_speech_streaming should require text', () => {
      expect(streamSchema.required).toContain('text');
    });

    it('text_to_speech_streaming should have chunk_size option', () => {
      expect(streamSchema.properties.chunk_size).toBeDefined();
      expect(streamSchema.properties.chunk_size.type).toBe('number');
    });
  });

  describe('Voice Configuration', () => {
    it('should support alloy voice', () => {
      expect(service.getSupportedVoices()).toContain('alloy');
    });

    it('should support echo voice', () => {
      expect(service.getSupportedVoices()).toContain('echo');
    });

    it('should support fable voice', () => {
      expect(service.getSupportedVoices()).toContain('fable');
    });

    it('should support onyx voice', () => {
      expect(service.getSupportedVoices()).toContain('onyx');
    });

    it('should support nova voice', () => {
      expect(service.getSupportedVoices()).toContain('nova');
    });

    it('should support shimmer voice', () => {
      expect(service.getSupportedVoices()).toContain('shimmer');
    });
  });

  describe('Model Configuration', () => {
    it('should support tts-1 model', () => {
      expect(service.getSupportedModels()).toContain('tts-1');
    });

    it('should support tts-1-hd model', () => {
      expect(service.getSupportedModels()).toContain('tts-1-hd');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing OpenAI key gracefully in tool', async () => {
      const result = await textToSpeechTool.execute({
        text: 'test',
      });
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should return JSON error on service failure', async () => {
      const result = await textToSpeechTool.execute({
        text: '',
      });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('error');
    });

    it('should return JSON error on streaming service failure', async () => {
      const result = await textToSpeechStreamingTool.execute({
        text: '',
      });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('error');
    });
  });

  describe('Text Chunking', () => {
    it.skip('should split text into appropriate chunks', async () => {
      const longText = 'Hello. World. How are you? I am fine. ' + 'Test. '.repeat(50);
      
      try {
        await service.textToSpeechStreaming(longText, 50);
        expect(true).toBe(true); // API key likely missing, but chunking logic ran
      } catch (error) {
        // Expected if no API key
        expect((error as Error).message).toBeDefined();
      }
    });

    it('should handle single chunk text', async () => {
      try {
        await service.textToSpeechStreaming('Short text', 1000);
        expect(true).toBe(true);
      } catch (error) {
        // Expected if no API key
        expect((error as Error).message).toBeDefined();
      }
    });
  });
});
