import type { Tool } from './index.js';
import { config } from '../../config.js';
import { createTTSService, type TTSModel, type TTSVoice } from '../../voice/tts.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('tts-tools');

let ttsService: ReturnType<typeof createTTSService> | null = null;

function getTTSService() {
  if (!ttsService && config.OPENAI_API_KEY) {
    ttsService = createTTSService(config.OPENAI_API_KEY);
  }
  if (!ttsService) {
    throw new Error('OpenAI API key not configured. Cannot initialize TTS service.');
  }
  return ttsService;
}

/**
 * Tool: Convert text to speech
 */
export const textToSpeechTool: Tool = {
  name: 'text_to_speech',
  description: 'Convert text to speech using OpenAI TTS API. Returns MP3 audio buffer.',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to convert to speech',
      },
      voice: {
        type: 'string',
        enum: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
        description:
          'Voice to use (alloy, echo, fable, onyx, nova, shimmer). Default is alloy.',
      },
      model: {
        type: 'string',
        enum: ['tts-1', 'tts-1-hd'],
        description: 'Model to use (tts-1 for speed, tts-1-hd for quality). Default is tts-1.',
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

      const service = getTTSService();

      // Apply config if provided
      if (voice) {
        service.setVoice(voice as TTSVoice);
      }
      if (model) {
        service.setModel(model as TTSModel);
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
      logger.error('text_to_speech failed:', message);
      return JSON.stringify({ error: message });
    }
  },
};

/**
 * Tool: Convert text to speech with streaming for large texts
 */
export const textToSpeechStreamingTool: Tool = {
  name: 'text_to_speech_streaming',
  description:
    'Convert long text to speech in chunks. Useful for responses that exceed reasonable speech duration.',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Long text to convert to speech',
      },
      chunk_size: {
        type: 'number',
        description: 'Target size for each chunk in characters (default 1000)',
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

      const service = getTTSService();
      const chunkSize = typeof chunk_size === 'number' ? chunk_size : 1000;

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
      logger.error('text_to_speech_streaming failed:', message);
      return JSON.stringify({ error: message });
    }
  },
};

/**
 * TTS tools array for registration
 */
export const ttsTools: Tool[] = [textToSpeechTool, textToSpeechStreamingTool];
