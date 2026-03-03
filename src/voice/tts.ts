import OpenAI from 'openai';
import { createLogger } from '../logger.js';

const logger = createLogger('tts');

export type TTSProvider = 'openai' | 'elevenlabs';
export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
export type TTSModel = 'tts-1' | 'tts-1-hd';

/**
 * Text-to-Speech service with OpenAI API
 */
export class TTSService {
  private client: OpenAI;
  private model: TTSModel;
  private voice: TTSVoice;

  constructor(apiKey: string, model: TTSModel = 'tts-1', voice: TTSVoice = 'alloy') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
    this.voice = voice;
  }

  /**
   * Convert text to speech using OpenAI TTS API
   * @param text Text to convert
   * @returns Audio buffer (MP3 format)
   */
  async textToSpeech(text: string): Promise<Buffer> {
    try {
      if (!text || text.trim().length === 0) {
        throw new Error('Text cannot be empty');
      }

      logger.info(`Converting text to speech (${text.length} chars) with voice: ${this.voice}`);

      const response = await this.client.audio.speech.create({
        model: this.model,
        voice: this.voice,
        input: text,
      });

      // Convert response to buffer
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      logger.info(`Generated audio: ${buffer.length} bytes`);
      return buffer;
    } catch (error) {
      logger.error(`Text-to-speech conversion failed:`, error);
      throw error;
    }
  }

  /**
   * Convert text to speech with streaming (for large responses)
   * Chunks text into smaller pieces to avoid rate limits
   * @param text Text to convert
   * @param chunkSize Max characters per chunk (OpenAI has limits)
   * @returns Array of audio buffers
   */
  async textToSpeechStreaming(text: string, chunkSize: number = 1000): Promise<Buffer[]> {
    try {
      // Split text into chunks (respect sentence boundaries)
      const chunks: string[] = this.chunkText(text, chunkSize);
      logger.info(`Converting ${chunks.length} text chunks to speech`);

      const audioBuffers: Buffer[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk: string = chunks[i]!; // Type guard - we know chunk exists
        logger.info(`Converting chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`);
        const buffer = await this.textToSpeech(chunk);
        audioBuffers.push(buffer);

        // Small delay between requests to avoid rate limiting
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return audioBuffers;
    } catch (error) {
      logger.error(`Streaming text-to-speech failed:`, error);
      throw error;
    }
  }

  /**
   * Split text into chunks respecting sentence boundaries
   */
  private chunkText(text: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    let currentChunk = '';

    // Split by sentence endings
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length <= chunkSize) {
        currentChunk += sentence;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Get supported voices
   */
  getSupportedVoices(): TTSVoice[] {
    return ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
  }

  /**
   * Get supported models
   */
  getSupportedModels(): TTSModel[] {
    return ['tts-1', 'tts-1-hd'];
  }

  /**
   * Set voice
   */
  setVoice(voice: TTSVoice): void {
    if (!this.getSupportedVoices().includes(voice)) {
      throw new Error(`Unsupported voice: ${voice}`);
    }
    this.voice = voice;
  }

  /**
   * Set model
   */
  setModel(model: TTSModel): void {
    if (!this.getSupportedModels().includes(model)) {
      throw new Error(`Unsupported model: ${model}`);
    }
    this.model = model;
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return {
      model: this.model,
      voice: this.voice,
    };
  }
}

/**
 * Initialize TTS service from OpenAI API key
 */
export function createTTSService(
  apiKey: string,
  model?: TTSModel,
  voice?: TTSVoice
): TTSService {
  return new TTSService(apiKey, model, voice);
}
