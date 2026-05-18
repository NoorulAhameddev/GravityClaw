import type { SpeechCommandRecognizer } from '@tensorflow-models/speech-commands';
import recordModule from 'node-record-lpcm16';
import { createLogger } from '../logger.ts';
import { createTranscriptionService } from './transcription.ts';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const log = createLogger('wake-word');

export type WakeWordCallback = (transcribedText: string) => Promise<void>;

export interface WakeWordConfig {
  wakePhrase: string;
  recordingDuration: number; // seconds to record after wake word detected
  threshold: number; // confidence threshold (0-1)
  sampleRate: number;
  channels: number;
}

const DEFAULT_CONFIG: WakeWordConfig = {
  wakePhrase: 'hey claw',
  recordingDuration: 5, // 5 seconds
  threshold: 0.75, // 75% confidence
  sampleRate: 16000,
  channels: 1,
};

export interface WakeWordDetector {
  start(onWakeWord: WakeWordCallback): Promise<void>;
  stop(): Promise<void>;
  isListening(): boolean;
  updateConfig(config: Partial<WakeWordConfig>): void;
  getConfig(): WakeWordConfig;
}

/**
 * Create a wake word detector that listens for a custom phrase
 * 
 * NOTE: This feature requires:
 * - Microphone access (local machine only, not VPS)
 * - Node.js environment (not browser)
 * - Audio input device configured
 * 
 * Desktop/local development only - not for production VPS deployment
 */
export function createWakeWordDetector(
  openaiApiKey: string,
  config: Partial<WakeWordConfig> = {}
): WakeWordDetector {
  let detectorConfig: WakeWordConfig = { ...DEFAULT_CONFIG, ...config };
  let recognizer: SpeechCommandRecognizer | null = null;
  let isActive = false;
  let microphoneStream: any = null;
  let recordingStream: any = null;
  let currentCallback: WakeWordCallback | null = null;

  const transcriptionService = createTranscriptionService(openaiApiKey);

  /**
   * Initialize the speech commands model (18 built-in commands)
   */
  async function initializeModel(): Promise<void> {
    if (recognizer) return;

    log.info('Loading TensorFlow.js Speech Commands model...');
    try {
      // Dynamic import to prevent startup crash if native bindings are broken
      const speechCommands = await import('@tensorflow-models/speech-commands');
      // Ensure tfjs-node is also loaded for performance, but ignore if it fails
      try {
        await import('@tensorflow/tfjs-node');
      } catch (e) {
        log.warn('Could not load @tensorflow/tfjs-node, falling back to CPU. Wake word detection might be slower.');
      }

      recognizer = speechCommands.create('BROWSER_FFT');
      await recognizer.ensureModelLoaded();
      log.info(`Model loaded. Available words: ${recognizer.wordLabels().join(', ')}`);
    } catch (error) {
      log.error('Failed to load speech commands model:', error);
      throw new Error('Wake word model initialization failed. Ensure @tensorflow/tfjs-node or @tensorflow/tfjs is installed.');
    }
  }

  /**
   * Start recording audio for a fixed duration after wake word detection
   */
  async function recordAndTranscribe(): Promise<string | null> {
    try {
      const tempPath = join(tmpdir(), `wake-word-recording-${Date.now()}.wav`);
      const audioChunks: Buffer[] = [];

      log.info(`🎤 Recording for ${detectorConfig.recordingDuration} seconds...`);

      recordingStream = recordModule({
        sampleRate: detectorConfig.sampleRate,
        channels: detectorConfig.channels,
        threshold: 0,
        silence: '2.0', // Stop after 2 seconds of silence
      });

      // Collect audio data
      recordingStream.stream().on('data', (chunk: Buffer) => {
        audioChunks.push(chunk);
      });

      // Wait for recording duration
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          if (recordingStream) {
            recordingStream.stop();
          }
          resolve();
        }, detectorConfig.recordingDuration * 1000);
      });

      // If no audio captured, return null
      if (audioChunks.length === 0) {
        log.warn('No audio captured during recording');
        return null;
      }

      // Save audio to temp file
      const audioBuffer = Buffer.concat(audioChunks);
      writeFileSync(tempPath, audioBuffer);

      // Transcribe
      const transcribedText = await transcriptionService.transcribeAudio(tempPath);

      // Cleanup
      try {
        unlinkSync(tempPath);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log.warn(`Failed to cleanup temp file ${tempPath}: ${msg}`);
      }

      return transcribedText;
    } catch (error) {
      log.error('Recording/transcription failed:', error);
      return null;
    }
  }

  /**
   * Check if detected word matches wake phrase
   */
  function matchesWakePhrase(detectedWord: string): boolean {
    const normalizedDetected = detectedWord.toLowerCase().trim();
    const normalizedPhrase = detectorConfig.wakePhrase.toLowerCase().trim();

    // Exact match
    if (normalizedDetected === normalizedPhrase) return true;

    // For multi-word phrases, check if detected word is part of phrase
    const words = normalizedPhrase.split(' ');
    return words.some((word) => word === normalizedDetected);
  }

  /**
   * Listen to microphone and detect speech commands
   */
  async function startListening(onWakeWord: WakeWordCallback): Promise<void> {
    if (!recognizer) {
      await initializeModel();
    }

    if (!recognizer) {
      throw new Error('Recognizer not initialized');
    }

    if (isActive) {
      log.warn('Wake word detector is already listening');
      return;
    }

    currentCallback = onWakeWord;
    isActive = true;

    log.info(`👂 Listening for wake phrase: "${detectorConfig.wakePhrase}"`);
    log.info(`Confidence threshold: ${(detectorConfig.threshold * 100).toFixed(0)}%`);

    // Start continuous listening
    await recognizer.listen(
      async (result: any) => {
        const scores = result.scores as number[] | Float32Array | undefined;
        const words = recognizer!.wordLabels();

        // Find the word with highest confidence
        let maxScore = 0;
        let detectedWord = '';

        if (!scores || !words) {
          return;
        }

        for (let i = 0; i < scores.length; i++) {
          const score = typeof scores[i] === 'number' ? scores[i] as number : 0;
          if (score !== undefined && score > maxScore) {
            maxScore = score;
            detectedWord = words[i] || '';
          }
        }

        // Check if detected word meets threshold
        if (maxScore >= detectorConfig.threshold) {
          log.info(`Detected: ${detectedWord} (confidence: ${(maxScore * 100).toFixed(1)}%)`);

          // Check if it matches our wake phrase
          if (matchesWakePhrase(detectedWord)) {
            log.info(`✅ Wake phrase detected! Recording command...`);

            // Temporarily pause listening while recording
            if (recognizer) {
              await recognizer.stopListening();
            }

            // Record and transcribe the command
            const transcribedText = await recordAndTranscribe();

            if (transcribedText && currentCallback) {
              log.info(`Command transcribed: ${transcribedText}`);
              await currentCallback(transcribedText);
            }

            // Resume listening
            if (isActive && recognizer) {
              log.info('👂 Resuming wake word detection...');
              await startListening(onWakeWord);
            }
          }
        }
      },
      {
        includeSpectrogram: false,
        probabilityThreshold: detectorConfig.threshold,
        invokeCallbackOnNoiseAndUnknown: false,
        overlapFactor: 0.5, // 50% overlap for better detection
      }
    );
  }

  /**
   * Stop listening and clean up resources
   */
  async function stopListening(): Promise<void> {
    if (!isActive) {
      log.warn('Wake word detector is not currently listening');
      return;
    }

    log.info('Stopping wake word detector...');
    isActive = false;
    currentCallback = null;

    if (recognizer) {
      await recognizer.stopListening();
    }

    if (recordingStream) {
      recordingStream.stop();
      recordingStream = null;
    }

    log.info('✅ Wake word detector stopped');
  }

  return {
    start: startListening,
    stop: stopListening,
    isListening: () => isActive,
    updateConfig: (newConfig: Partial<WakeWordConfig>) => {
      detectorConfig = { ...detectorConfig, ...newConfig };
      log.info(`Wake word config updated: ${JSON.stringify(detectorConfig)}`);
    },
    getConfig: () => ({ ...detectorConfig }),
  };
}

/**
 * Get list of available wake words from TensorFlow.js Speech Commands model
 * Built-in words: zero, one, two, three, four, five, six, seven, eight, nine,
 * up, down, left, right, go, stop, yes, no
 */
export async function getAvailableWakeWords(): Promise<string[]> {
  try {
    const speechCommands = await import('@tensorflow-models/speech-commands');
    // Try to load tfjs-node if possible (optional, for better performance)
    try { await import('@tensorflow/tfjs-node'); } catch { log.debug('tfjs-node not available, using fallback'); }

    const recognizer = speechCommands.create('BROWSER_FFT');
    await recognizer.ensureModelLoaded();
    return recognizer.wordLabels();
  } catch (error) {
    log.error('Failed to load available wake words:', error);
    return [];
  }
}
