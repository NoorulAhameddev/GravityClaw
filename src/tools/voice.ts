import type { Tool } from './index.js';
import { config } from '../config.js';
import { createTranscriptionService } from '../voice/transcription.js';
import { createLogger } from '../logger.js';

const logger = createLogger('voice-tools');

let transcriptionService: ReturnType<typeof createTranscriptionService> | null = null;

function getTranscriptionService() {
  if (!transcriptionService && config.OPENAI_API_KEY) {
    transcriptionService = createTranscriptionService(config.OPENAI_API_KEY);
  }
  if (!transcriptionService) {
    throw new Error('OpenAI API key not configured. Cannot initialize transcription service.');
  }
  return transcriptionService;
}

/**
 * Tool: Transcribe audio file to text using OpenAI Whisper
 */
export const transcribeAudioTool: Tool = {
  name: 'transcribe_audio',
  description:
    'Transcribe an audio file to text using OpenAI Whisper API. Supports mp3, mp4, mpeg, mpga, m4a, wav, webm (max 25MB)',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Path to audio file to transcribe',
      },
      language: {
        type: 'string',
        description:
          'Optional ISO-639-1 language code (e.g., "en" for English, "es" for Spanish). Helps with accuracy.',
      },
      __sessionId: {
        type: 'string',
        description: 'Session ID (injected)',
      },
    },
    required: ['file_path'],
  },
  async execute(input: Record<string, string | undefined>) {
    try {
      const { file_path, language } = input;

      if (!file_path) {
        return JSON.stringify({ error: 'file_path is required' });
      }

      const service = getTranscriptionService();
      const text = await service.transcribeAudio(file_path, language);

      return JSON.stringify({
        success: true,
        text,
        filePath: file_path,
        characterCount: text.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('transcribe_audio failed:', message);
      return JSON.stringify({ error: message });
    }
  },
};

/**
 * Get list of supported audio formats for voice tools
 */
export const getSupportedAudioFormats = (): string[] => {
  try {
    const service = getTranscriptionService();
    return service.getSupportedFormats();
  } catch {
    return ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'];
  }
};

/**
 * Voice tools array for registration
 */
export const voiceTools: Tool[] = [transcribeAudioTool];
