import OpenAI from 'openai';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { extname } from 'path';
import { createLogger } from '../logger.js';

const logger = createLogger('transcription');

/**
 * Voice transcription service using OpenAI Whisper API
 */
export class TranscriptionService {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Transcribe audio file using Whisper API
   * @param filePath Path to audio file (mp3, mp4, mpeg, mpga, m4a, wav, webm)
   * @param language Optional ISO-639-1 language code (e.g., 'en', 'es', 'fr')
   * @returns Transcribed text
   */
  async transcribeAudio(filePath: string, language?: string): Promise<string> {
    try {
      // Validate file exists and get size
      const fileStats = await stat(filePath);
      const fileSizeMB = fileStats.size / (1024 * 1024);

      if (fileSizeMB > 25) {
        throw new Error(`Audio file too large: ${fileSizeMB.toFixed(2)}MB (max 25MB)`);
      }

      const ext = extname(filePath).toLowerCase();
      const supportedFormats = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm'];

      if (!supportedFormats.includes(ext)) {
        throw new Error(
          `Unsupported audio format: ${ext}. Supported: ${supportedFormats.join(', ')}`
        );
      }

      logger.info(`Transcribing audio file: ${filePath} (${fileSizeMB.toFixed(2)}MB)`);

      // Call Whisper API
      const fileStream = createReadStream(filePath);

      // Build request - handle undefined language field for exactOptionalPropertyTypes
      const requestBody: Record<string, any> = {
        file: fileStream,
        model: 'whisper-1',
        temperature: 0,
      };

      if (language !== undefined) {
        requestBody.language = language;
      }

      const response = await (this.client.audio.transcriptions.create as any)(requestBody);

      logger.info(`Transcription complete: ${response.text.length} characters`);
      return response.text;
    } catch (error) {
      logger.error(`Transcription failed for ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Transcribe audio from URL
   * @param audioUrl URL of audio file
   * @param language Optional language code
   * @returns Transcribed text
   */
  async transcribeAudioUrl(audioUrl: string, language?: string): Promise<string> {
    try {
      logger.info(`Transcribing audio from URL: ${audioUrl}`);

      // For URL-based transcription, we need to fetch and convert to file
      // Whisper API in openai-node requires a file stream
      // Unfortunately, it doesn't support direct URL transcription
      // We'd need to download the file first
      throw new Error(
        'Direct URL transcription not supported. Download file first and use transcribeAudio()'
      );
    } catch (error) {
      logger.error(`URL transcription failed: ${audioUrl}`, error);
      throw error;
    }
  }

  /**
   * Get supported audio formats
   */
  getSupportedFormats(): string[] {
    return ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'];
  }
}

/**
 * Initialize transcription service from OpenAI API key
 */
export function createTranscriptionService(apiKey: string): TranscriptionService {
  return new TranscriptionService(apiKey);
}

/**
 * Transcribe audio directly using OpenAI Whisper API
 */
export async function transcribeAudio(filePath: string, apiKey: string, language?: string): Promise<string> {
  const service = createTranscriptionService(apiKey);
  return service.transcribeAudio(filePath, language);
}

/**
 * Utility to check if a file is audio based on extension
 */
export function isAudioFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase().slice(1);
  const audioFormats = ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'wav'];
  return audioFormats.includes(ext);
}
