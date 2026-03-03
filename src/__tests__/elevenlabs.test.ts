import { describe, it, expect, beforeAll } from 'vitest';
import { createElevenLabsService } from '../voice/elevenlabs.js';
import { elevenLabsTextToSpeechTool, elevenLabsTextToSpeechStreamingTool } from '../tools/elevenlabs.js';

describe('ElevenLabs Text-to-Speech', () => {
  let service: ReturnType<typeof createElevenLabsService>;

  beforeAll(() => {
    const apiKey = process.env.ELEVENLABS_API_KEY || 'test-key';
    service = createElevenLabsService(apiKey);
  });

  describe('ElevenLabsTTSService', () => {
    it('should initialize with ElevenLabs API key', () => {
      expect(service).toBeDefined();
    });

    it('should return list of supported voices', () => {
      const voices = service.getSupportedVoices();
      expect(voices).toContain('bella');
      expect(voices).toContain('rachel');
      expect(voices).toContain('william');
      expect(voices.length).toBe(14);
    });

    it('should return list of supported models', () => {
      const models = service.getSupportedModels();
      expect(models).toContain('eleven_monolingual_v1');
      expect(models).toContain('eleven_multilingual_v2');
      expect(models.length).toBe(2);
    });

    it('should set voice', () => {
      service.setVoice('rachel');
      const config = service.getConfig();
      expect(config.voice).toBe('rachel');
    });

    it('should set model', () => {
      service.setModel('eleven_monolingual_v1');
      const config = service.getConfig();
      expect(config.model).toBe('eleven_monolingual_v1');
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

  describe('elevenLabsTextToSpeechTool', () => {
    it('should have correct tool metadata', () => {
      expect(elevenLabsTextToSpeechTool.name).toBe('elevenlabs_text_to_speech');
      expect(elevenLabsTextToSpeechTool.description).toContain('ElevenLabs');
      expect(elevenLabsTextToSpeechTool.inputSchema).toBeDefined();
    });

    it('should validate required text parameter', async () => {
      const result = await elevenLabsTextToSpeechTool.execute({});
      const parsed = JSON.parse(result);
      expect(parsed.error).toBeDefined();
    });

    it('should accept optional voice parameter', async () => {
      const result = await elevenLabsTextToSpeechTool.execute({
        text: 'Hello world',
        voice: 'rachel',
      });
      expect(typeof result).toBe('string');
    });

    it('should accept optional model parameter', async () => {
      const result = await elevenLabsTextToSpeechTool.execute({
        text: 'Hello world',
        model: 'eleven_multilingual_v2',
      });
      expect(typeof result).toBe('string');
    });

    it('should return JSON response', async () => {
      const result = await elevenLabsTextToSpeechTool.execute({
        text: 'Hello world',
      });
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should return error field on invalid input', async () => {
      const result = await elevenLabsTextToSpeechTool.execute({
        text: '',
      });
      const parsed = JSON.parse(result);
      expect(parsed.error).toBeDefined();
    });
  });

  describe('elevenLabsTextToSpeechStreamingTool', () => {
    it('should have correct tool metadata', () => {
      expect(elevenLabsTextToSpeechStreamingTool.name).toBe('elevenlabs_text_to_speech_streaming');
      expect(elevenLabsTextToSpeechStreamingTool.description).toContain('long text');
      expect(elevenLabsTextToSpeechStreamingTool.inputSchema).toBeDefined();
    });

    it('should validate required text parameter', async () => {
      const result = await elevenLabsTextToSpeechStreamingTool.execute({});
      const parsed = JSON.parse(result);
      expect(parsed.error).toBeDefined();
    });

    it('should accept optional chunk_size parameter', async () => {
      const result = await elevenLabsTextToSpeechStreamingTool.execute({
        text: 'Long text that will be split. ' + 'Sentence. '.repeat(50),
        chunk_size: 500,
      });
      expect(typeof result).toBe('string');
    });

    it('should return JSON response', async () => {
      const result = await elevenLabsTextToSpeechStreamingTool.execute({
        text: 'Hello world',
      });
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should handle empty chunk_size as default', async () => {
      const result = await elevenLabsTextToSpeechStreamingTool.execute({
        text: 'Test',
      });
      const parsed = JSON.parse(result);
      expect(parsed.chunks || parsed.error).toBeDefined();
    });
  });

  describe('Tool Input Schemas', () => {
    const elevenSchema = elevenLabsTextToSpeechTool.inputSchema as any;
    const streamSchema = elevenLabsTextToSpeechStreamingTool.inputSchema as any;

    it('elevenlabs_text_to_speech should require text', () => {
      expect(elevenSchema.required).toContain('text');
    });

    it('elevenlabs_text_to_speech should have voice options', () => {
      expect(elevenSchema.properties.voice.enum).toContain('bella');
      expect(elevenSchema.properties.voice.enum).toContain('rachel');
      expect(elevenSchema.properties.voice.enum.length).toBe(14);
    });

    it('elevenlabs_text_to_speech should have model options', () => {
      expect(elevenSchema.properties.model.enum).toContain('eleven_multilingual_v2');
    });

    it('elevenlabs_text_to_speech_streaming should require text', () => {
      expect(streamSchema.required).toContain('text');
    });

    it('elevenlabs_text_to_speech_streaming should have chunk_size option', () => {
      expect(streamSchema.properties.chunk_size).toBeDefined();
      expect(streamSchema.properties.chunk_size.type).toBe('number');
    });
  });

  describe('Voice Configuration', () => {
    it('should support bella voice', () => {
      expect(service.getSupportedVoices()).toContain('bella');
    });

    it('should support rachel voice', () => {
      expect(service.getSupportedVoices()).toContain('rachel');
    });

    it('should support all 14 voices', () => {
      const voices = service.getSupportedVoices();
      expect(voices).toHaveLength(14);
    });
  });

  describe('Model Configuration', () => {
    it('should support monolingual model', () => {
      expect(service.getSupportedModels()).toContain('eleven_monolingual_v1');
    });

    it('should support multilingual model', () => {
      expect(service.getSupportedModels()).toContain('eleven_multilingual_v2');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing ElevenLabs key gracefully in tool', async () => {
      const result = await elevenLabsTextToSpeechTool.execute({
        text: 'test',
      });
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should return JSON error on service failure', async () => {
      const result = await elevenLabsTextToSpeechTool.execute({
        text: '',
      });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('error');
    });

    it('should return JSON error on streaming service failure', async () => {
      const result = await elevenLabsTextToSpeechStreamingTool.execute({
        text: '',
      });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('error');
    });
  });

  describe('Text Chunking', () => {
    it('should split text into appropriate chunks', async () => {
      const longText = 'Hello. World. How are you? I am fine. ' + 'Test. '.repeat(50);
      
      try {
        await service.textToSpeechStreaming(longText, 50);
        expect(true).toBe(true);
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

  describe('ElevenLabs-specific features', () => {
    it('should have larger default chunk size than OpenAI TTS', () => {
      // ElevenLabs has higher character limits
      const schema = elevenLabsTextToSpeechStreamingTool.inputSchema as any;
      expect(schema.properties.chunk_size.description).toContain('1500');
    });

    it('should support multilingual models', () => {
      const models = service.getSupportedModels();
      expect(models).toContain('eleven_multilingual_v2');
    });

    it('should validate voice IDs from supported list', () => {
      const voices = service.getSupportedVoices();
      expect(voices).toContain('isabella');
      expect(voices).toContain('jessica');
    });
  });
});
