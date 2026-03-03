import { createLogger } from '../logger.js';

const logger = createLogger('elevenlabs-tts');

export type ElevenLabsVoiceId =
  | 'bella'
  | 'eric'
  | 'essie'
  | 'isabella'
  | 'james'
  | 'jessica'
  | 'josh'
  | 'kunka'
  | 'lah'
  | 'michael'
  | 'rachel'
  | 'samantha'
  | 'sarah'
  | 'william';

export type ElevenLabsModel = 'eleven_monolingual_v1' | 'eleven_multilingual_v2';

export interface ElevenLabsConfig {
  apiKey: string;
  voiceId?: ElevenLabsVoiceId;
  model?: ElevenLabsModel;
}

/**
 * ElevenLabs Text-to-Speech service
 */
export class ElevenLabsTTSService {
  private apiKey: string;
  private voiceId: ElevenLabsVoiceId;
  private model: ElevenLabsModel;
  private baseUrl = 'https://api.elevenlabs.io/v1';

  constructor(config: ElevenLabsConfig) {
    this.apiKey = config.apiKey;
    this.voiceId = config.voiceId || 'bella';
    this.model = config.model || 'eleven_multilingual_v2';
  }

  /**
   * Convert text to speech using ElevenLabs API
   * @param text Text to convert
   * @returns Audio buffer (MP3 format)
   */
  async textToSpeech(text: string): Promise<Buffer> {
    try {
      if (!text || text.trim().length === 0) {
        throw new Error('Text cannot be empty');
      }

      logger.info(`Converting text to speech (${text.length} chars) with voice: ${this.voiceId}`);

      const url = `${this.baseUrl}/text-to-speech/${this.voiceId}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: this.model,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`ElevenLabs API error (${response.status}): ${error}`);
      }

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
   * Convert text to speech with streaming for large texts
   * @param text Text to convert
   * @param chunkSize Max characters per chunk
   * @returns Array of audio buffers
   */
  async textToSpeechStreaming(text: string, chunkSize: number = 1500): Promise<Buffer[]> {
    try {
      const chunks = this.chunkText(text, chunkSize);
      logger.info(`Converting ${chunks.length} text chunks to speech`);

      const audioBuffers: Buffer[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]!;
        logger.info(`Converting chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`);
        const buffer = await this.textToSpeech(chunk);
        audioBuffers.push(buffer);

        // Delay between requests
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
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
  getSupportedVoices(): ElevenLabsVoiceId[] {
    return [
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
    ];
  }

  /**
   * Get supported models
   */
  getSupportedModels(): ElevenLabsModel[] {
    return ['eleven_monolingual_v1', 'eleven_multilingual_v2'];
  }

  /**
   * Set voice
   */
  setVoice(voiceId: ElevenLabsVoiceId): void {
    if (!this.getSupportedVoices().includes(voiceId)) {
      throw new Error(`Unsupported voice: ${voiceId}`);
    }
    this.voiceId = voiceId;
  }

  /**
   * Set model
   */
  setModel(model: ElevenLabsModel): void {
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
      voice: this.voiceId,
    };
  }
}

/**
 * Create ElevenLabs TTS service
 */
export function createElevenLabsService(
  apiKey: string,
  voiceId?: ElevenLabsVoiceId,
  model?: ElevenLabsModel
): ElevenLabsTTSService {
  const config: ElevenLabsConfig = { apiKey };
  if (voiceId !== undefined) {
    config.voiceId = voiceId;
  }
  if (model !== undefined) {
    config.model = model;
  }
  return new ElevenLabsTTSService(config);
}
