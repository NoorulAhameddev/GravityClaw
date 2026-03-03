import type { Tool } from './index.js';
import { config } from '../../config.js';
import { createElevenLabsService, type ElevenLabsVoiceId, type ElevenLabsModel } from '../../voice/elevenlabs.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('elevenlabs-tools');

let elevenLabsService: ReturnType<typeof createElevenLabsService> | null = null;

function getElevenLabsService() {
  if (!elevenLabsService && config.ELEVENLABS_API_KEY) {
    const voiceId = (config.ELEVENLABS_VOICE_ID || 'bella') as ElevenLabsVoiceId;
    elevenLabsService = createElevenLabsService(config.ELEVENLABS_API_KEY, voiceId);
  }
  if (!elevenLabsService) {
    throw new Error('ElevenLabs API key not configured. Cannot initialize service.');
  }
  return elevenLabsService;
}

/**
 * Tool: Convert text to speech using ElevenLabs
 */
export const elevenLabsTextToSpeechTool: Tool = {
  name: 'elevenlabs_text_to_speech',
  description:
    'Convert text to speech using ElevenLabs API. Supports 14 voices and multiple languages with high-quality output.',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to convert to speech',
      },
      voice: {
        type: 'string',
        enum: [
          'bella',
          'eric',
          'essie',
          'isabella',
          'james',
          'jessica',
          'josh',
          'kunka',
          'lah',
          'michael',
          'rachel',
          'samantha',
          'sarah',
          'william',
        ],
        description: 'Voice to use. Default is bella.',
      },
      model: {
        type: 'string',
        enum: ['eleven_monolingual_v1', 'eleven_multilingual_v2'],
        description: 'Model to use. eleven_multilingual_v2 supports more languages.',
      },
      __sessionId: {
        type: 'string',
        description: 'Session ID (injected)',
      },
    },
    required: ['text'],
  },
  async execute(input) {
    try {
      const { text, voice, model } = input as Record<string, string | undefined>;

      if (!text) {
        return JSON.stringify({ error: 'text is required' });
      }

      const service = getElevenLabsService();

      if (voice) {
        service.setVoice(voice as ElevenLabsVoiceId);
      }
      if (model) {
        service.setModel(model as ElevenLabsModel);
      }

      const audioBuffer = await service.textToSpeech(text);

      return JSON.stringify({
        success: true,
        audioLength: audioBuffer.length,
        format: 'mp3',
        sizeKB: (audioBuffer.length / 1024).toFixed(2),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('elevenlabs_text_to_speech failed:', message);
      return JSON.stringify({ error: message });
    }
  },
};

/**
 * Tool: Convert long text to speech with ElevenLabs streaming
 */
export const elevenLabsTextToSpeechStreamingTool: Tool = {
  name: 'elevenlabs_text_to_speech_streaming',
  description:
    'Convert long text to speech in chunks using ElevenLabs. Useful for responses that exceed reasonable speech duration.',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Long text to convert to speech',
      },
      chunk_size: {
        type: 'number',
        description: 'Target size for each chunk in characters (default 1500, ElevenLabs limit is higher)',
      },
      __sessionId: {
        type: 'string',
        description: 'Session ID (injected)',
      },
    },
    required: ['text'],
  },
  async execute(input) {
    try {
      const { text, chunk_size } = input as Record<string, string | number | undefined>;

      if (!text) {
        return JSON.stringify({ error: 'text is required' });
      }

      const service = getElevenLabsService();
      const chunkSize = typeof chunk_size === 'number' ? chunk_size : 1500;

      const audioBuffers = await service.textToSpeechStreaming(text as string, chunkSize);

      const totalSize = audioBuffers.reduce((sum, buf) => sum + buf.length, 0);

      return JSON.stringify({
        success: true,
        chunks: audioBuffers.length,
        totalAudioLength: totalSize,
        format: 'mp3',
        totalSizeKB: (totalSize / 1024).toFixed(2),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('elevenlabs_text_to_speech_streaming failed:', message);
      return JSON.stringify({ error: message });
    }
  },
};

/**
 * ElevenLabs tools array for registration
 */
export const elevenLabsTools: Tool[] = [elevenLabsTextToSpeechTool, elevenLabsTextToSpeechStreamingTool];
