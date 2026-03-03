/**
 * Talk Mode - Continuous Voice Conversation
 * 
 * Provides hands-free voice interaction loop:
 * 1. Wait for wake word
 * 2. Record audio until silence detected (VAD)
 * 3. Transcribe with Whisper
 * 4. Process with LLM
 * 5. Speak response with TTS
 * 6. Return to step 1
 * 
 * Desktop/local only - requires microphone and speaker
 */

import recordModule from 'node-record-lpcm16';
import { createLogger } from '../logger.js';
import { createWakeWordDetector, type WakeWordDetector } from './wake-word.js';
import { transcribeAudio } from './transcription.js';

type AudioRecorder = ReturnType<typeof recordModule>;

const logger = createLogger('talk-mode');

export interface TalkModeConfig {
  /** Wake phrase to trigger recording (e.g., "hey claw") */
  wakePhrase: string;
  /** Confidence threshold for wake word detection (0-1) */
  wakeThreshold: number;
  /** Voice Activity Detection threshold (silence detection) */
  vadThreshold: number;
  /** Silence duration in ms to stop recording (default: 1500ms = 1.5s) */
  silenceDuration: number;
  /** Maximum recording duration in seconds (default: 30s) */
  maxRecordingDuration: number;
  /** Audio sample rate (default: 16000 Hz) */
  sampleRate: number;
  /** Audio channels (default: 1 = mono) */
  channels: number;
}

export interface TalkModeCallbacks {
  /** Called when wake word detected */
  onWakeWord?: () => void;
  /** Called when recording starts */
  onRecordingStart?: () => void;
  /** Called when recording stops */
  onRecordingStop?: () => void;
  /** Called when transcription complete */
  onTranscription?: (text: string) => void;
  /** Called when LLM response ready */
  onResponse?: (text: string) => void;
  /** Called when TTS audio generated */
  onAudioReady?: (audioBuffer: Buffer) => void;
  /** Called on errors */
  onError?: (error: Error) => void;
}

export interface TalkModeHandler {
  /** Start talk mode loop */
  start(callbacks: TalkModeCallbacks): Promise<void>;
  /** Stop talk mode loop */
  stop(): Promise<void>;
  /** Check if talk mode is active */
  isActive(): boolean;
  /** Update configuration */
  updateConfig(config: Partial<TalkModeConfig>): void;
  /** Get current configuration */
  getConfig(): TalkModeConfig;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: TalkModeConfig = {
  wakePhrase: 'hey claw',
  wakeThreshold: 0.75,
  vadThreshold: 0.3,
  silenceDuration: 1500,
  maxRecordingDuration: 30,
  sampleRate: 16000,
  channels: 1,
};

/**
 * Create a talk mode handler
 */
export function createTalkModeHandler(
  initialConfig: Partial<TalkModeConfig> = {}
): TalkModeHandler {
  let config: TalkModeConfig = { ...DEFAULT_CONFIG, ...initialConfig };
  let isRunning = false;
  let wakeWordDetector: WakeWordDetector | null = null;
  let currentCallbacks: TalkModeCallbacks = {};
  let recorder: AudioRecorder | null = null;
  let audioChunks: Buffer[] = [];
  let silenceTimer: NodeJS.Timeout | null = null;
  let recordingTimer: NodeJS.Timeout | null = null;

  /**
   * Calculate audio energy (simple VAD)
   */
  function calculateEnergy(buffer: Buffer): number {
    let sum = 0;
    for (let i = 0; i < buffer.length; i += 2) {
      const sample = buffer.readInt16LE(i);
      sum += Math.abs(sample);
    }
    return sum / (buffer.length / 2);
  }

  /**
   * Start recording audio with VAD
   */
  async function startRecording(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        // Dynamic import to avoid loading node-record-lpcm16 in test environments
        const record = require('node-record-lpcm16');

        audioChunks = [];
        let isSilent = false;

        logger.info('Starting audio recording with VAD');
        currentCallbacks.onRecordingStart?.();

        const recordingOptions = {
          sampleRate: config.sampleRate,
          channels: config.channels,
          threshold: 0, // We'll handle VAD manually
          silence: '0.0', // Disable built-in silence detection
          recordProgram: process.platform === 'darwin' ? 'rec' : 'sox', // macOS uses rec, others use sox
        };

        recorder = recordModule(recordingOptions);

        // Handle data chunks
        if (recorder) {
          recorder.stream().on('data', (chunk: Buffer) => {
            audioChunks.push(chunk);

            // Calculate audio energy for VAD
            const energy = calculateEnergy(chunk);
            const normalizedEnergy = energy / 32768; // Normalize to 0-1

            if (normalizedEnergy < config.vadThreshold) {
              // Silence detected
              if (!isSilent) {
                isSilent = true;
                logger.debug(`Silence detected (energy: ${normalizedEnergy.toFixed(3)})`);

                // Start silence timer
                silenceTimer = setTimeout(() => {
                  logger.info(`Silence duration reached (${config.silenceDuration}ms), stopping recording`);
                  stopCurrentRecording(resolve);
                }, config.silenceDuration);
              }
            } else {
              // Sound detected, reset silence timer
              if (isSilent) {
                isSilent = false;
                if (silenceTimer) {
                  clearTimeout(silenceTimer);
                  silenceTimer = null;
                }
                logger.debug(`Sound detected (energy: ${normalizedEnergy.toFixed(3)}), continuing recording`);
              }
            }
          });

          // Handle errors
          recorder.stream().on('error', (err: Error) => {
            logger.error('Recording error:', err);
            currentCallbacks.onError?.(err);
            reject(err);
          });
        }

        // Maximum recording duration
        recordingTimer = setTimeout(() => {
          logger.info(`Max recording duration reached (${config.maxRecordingDuration}s), stopping`);
          stopCurrentRecording(resolve);
        }, config.maxRecordingDuration * 1000);

      } catch (error) {
        const err = error as Error;
        logger.error('Failed to start recording:', err);
        currentCallbacks.onError?.(err);
        reject(err);
      }
    });

    function stopCurrentRecording(resolve: (buffer: Buffer) => void) {
      if (recorder) {
        recorder.stop();
        recorder = null;
      }
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
      if (recordingTimer) {
        clearTimeout(recordingTimer);
        recordingTimer = null;
      }

      currentCallbacks.onRecordingStop?.();

      const audioBuffer = Buffer.concat(audioChunks);
      logger.info(`Recording complete: ${audioBuffer.length} bytes (${(audioBuffer.length / config.sampleRate / 2).toFixed(2)}s)`);
      resolve(audioBuffer);
    }
  }

  /**
   * Process recorded audio: transcribe and callback
   */
  async function processAudio(audioBuffer: Buffer): Promise<void> {
    try {
      // Save to temp file for transcription
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');

      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, `talk-mode-${Date.now()}.wav`);

      // Write WAV header + audio data
      const wavHeader = createWavHeader(audioBuffer.length, config.sampleRate, config.channels);
      const wavBuffer = Buffer.concat([wavHeader, audioBuffer]);
      fs.writeFileSync(tempFile, wavBuffer);

      logger.info(`Transcribing audio from ${tempFile}`);

      // Transcribe with Whisper
      const openaiKey = process.env.OPENAI_API_KEY || '';
      const transcription = await transcribeAudio(tempFile, openaiKey);

      // Cleanup temp file
      fs.unlinkSync(tempFile);

      if (!transcription || transcription.trim().length === 0) {
        logger.warn('Empty transcription, ignoring');
        return;
      }

      logger.info(`Transcription: "${transcription}"`);
      currentCallbacks.onTranscription?.(transcription);

    } catch (error) {
      const err = error as Error;
      logger.error('Audio processing error:', err);
      currentCallbacks.onError?.(err);
    }
  }

  /**
   * Main talk mode loop
   */
  async function talkLoop(): Promise<void> {
    while (isRunning) {
      try {
        // Wait for wake word (this blocks until wake word detected or stopped)
        logger.info('Waiting for wake word...');
        
        const wakeWordPromise = new Promise<string>((resolve, reject) => {
          if (!wakeWordDetector) {
            reject(new Error('Wake word detector not initialized'));
            return;
          }

          wakeWordDetector.start(async (transcription) => {
            resolve(transcription);
          });
        });

        // Check if we should stop
        const stopCheckInterval = setInterval(() => {
          if (!isRunning && wakeWordDetector) {
            wakeWordDetector.stop();
          }
        }, 100);

        const transcription = await wakeWordPromise;
        clearInterval(stopCheckInterval);

        if (!isRunning) break; // Stopped during wake word wait

        logger.info(`Wake word detected: "${transcription}"`);
        currentCallbacks.onWakeWord?.();

        // Now record until silence
        const audioBuffer = await startRecording();

        if (!isRunning) break; // Stopped during recording

        // Process the recording
        await processAudio(audioBuffer);

        // Note: LLM processing and TTS are handled by the callback
        // The caller (tool) will receive onTranscription and handle the rest

      } catch (error) {
        const err = error as Error;
        logger.error('Talk loop error:', err);
        currentCallbacks.onError?.(err);
        
        // Wait a bit before retrying to avoid tight error loop
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logger.info('Talk mode loop ended');
  }

  return {
    async start(callbacks: TalkModeCallbacks): Promise<void> {
      if (isRunning) {
        throw new Error('Talk mode is already running');
      }

      currentCallbacks = callbacks;
      isRunning = true;

      // Initialize wake word detector
      const openaiKey = process.env.OPENAI_API_KEY || '';
      wakeWordDetector = createWakeWordDetector(openaiKey, {
        wakePhrase: config.wakePhrase,
        threshold: config.wakeThreshold,
      });

      logger.info(`Starting talk mode with wake phrase: "${config.wakePhrase}"`);

      // Start the loop (non-blocking)
      talkLoop().catch((error) => {
        logger.error('Talk loop fatal error:', error);
        currentCallbacks.onError?.(error);
        isRunning = false;
      });
    },

    async stop(): Promise<void> {
      if (!isRunning) {
        return;
      }

      logger.info('Stopping talk mode');
      isRunning = false;

      // Stop wake word detection
      if (wakeWordDetector) {
        wakeWordDetector.stop();
        wakeWordDetector = null;
      }

      // Stop recording if active
      if (recorder) {
        recorder.stop();
        recorder = null;
      }

      // Clear timers
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
      if (recordingTimer) {
        clearTimeout(recordingTimer);
        recordingTimer = null;
      }

      currentCallbacks = {};
    },

    isActive(): boolean {
      return isRunning;
    },

    updateConfig(newConfig: Partial<TalkModeConfig>): void {
      config = { ...config, ...newConfig };
      logger.info(`Config updated: ${JSON.stringify(config)}`);
    },

    getConfig(): TalkModeConfig {
      return { ...config };
    },
  };
}

/**
 * Create WAV file header
 */
function createWavHeader(dataLength: number, sampleRate: number, channels: number): Buffer {
  const header = Buffer.alloc(44);
  
  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8);
  
  // fmt chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28); // byte rate
  header.writeUInt16LE(channels * 2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  
  // data chunk
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40);
  
  return header;
}

