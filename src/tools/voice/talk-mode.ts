/**
 * Talk Mode Tools
 * 
 * Provides hands-free continuous voice conversation for desktop/local use.
 * Requires microphone and speaker - not available on VPS.
 */

import type { Tool } from './index.js';
import { createLogger } from '../../logger.js';
import { createTalkModeHandler, type TalkModeHandler, type TalkModeCallbacks } from '../../voice/talk-mode.js';
import * as config from '../../config.js';

const logger = createLogger('talk-mode-tools');

// Singleton talk mode handler
let talkModeHandler: TalkModeHandler | null = null;
let currentSessionCallback: ((transcription: string) => void) | null = null;

/**
 * Initialize talk mode handler (lazy)
 */
function initializeTalkMode(): TalkModeHandler {
  if (!talkModeHandler) {
    talkModeHandler = createTalkModeHandler({
      wakePhrase: config.WAKE_WORD_PHRASE,
      wakeThreshold: config.WAKE_WORD_THRESHOLD,
    });
    logger.info('Talk mode handler initialized');
  }
  return talkModeHandler;
}

/**
 * Tool: Start Talk Mode
 */
export const startTalkModeTool: Tool = {
  name: 'start_talk_mode',
  description: `Start continuous hands-free voice conversation mode (Desktop/local only, not available on VPS).

Once started, the agent will:
1. Listen for wake word (default: "hey claw")
2. Record your voice until silence detected
3. Transcribe and process your request
4. Speak the response
5. Return to listening

This mode runs until explicitly stopped with stop_talk_mode.

REQUIRES: Microphone and speaker access. Not compatible with VPS/cloud deployments.`,

  inputSchema: {
    type: 'object',
    properties: {
      wake_phrase: {
        type: 'string',
        description: 'Custom wake phrase (optional, default: "hey claw")',
      },
      wake_threshold: {
        type: 'number',
        description: 'Wake word confidence threshold 0-1 (optional, default: 0.75)',
        minimum: 0,
        maximum: 1,
      },
      silence_duration: {
        type: 'number',
        description: 'Silence duration in ms to stop recording (optional, default: 1500)',
      },
      max_recording_duration: {
        type: 'number',
        description: 'Maximum recording duration in seconds (optional, default: 30)',
      },
    },
    required: [],
  },

  async execute(args: Record<string, unknown>): Promise<string> {
    try {
      // Check API key
      if (!config.OPENAI_API_KEY) {
        const error = 'OpenAI API key not configured. Talk mode requires Whisper transcription.';
        logger.error(error);
        return JSON.stringify({
          success: false,
          error,
        });
      }

      const handler = initializeTalkMode();

      // Check if already running
      if (handler.isActive()) {
        return JSON.stringify({
          success: false,
          error: 'Talk mode is already running. Use stop_talk_mode to stop it first.',
        });
      }

      // Update config if provided
      if (args.wake_phrase || args.wake_threshold || args.silence_duration || args.max_recording_duration) {
        const configUpdate: Record<string, any> = {};
        if (args.wake_phrase) configUpdate.wakePhrase = args.wake_phrase as string;
        if (args.wake_threshold !== undefined) configUpdate.wakeThreshold = args.wake_threshold as number;
        if (args.silence_duration !== undefined) configUpdate.silenceDuration = args.silence_duration as number;
        if (args.max_recording_duration !== undefined) configUpdate.maxRecordingDuration = args.max_recording_duration as number;
        handler.updateConfig(configUpdate);
      }

      const currentConfig = handler.getConfig();

      // Define callbacks
      const callbacks: TalkModeCallbacks = {
        onWakeWord: () => {
          logger.info('🎤 Wake word detected!');
        },
        onRecordingStart: () => {
          logger.info('🔴 Recording started...');
        },
        onRecordingStop: () => {
          logger.info('⏹️ Recording stopped');
        },
        onTranscription: (text: string) => {
          logger.info(`📝 Transcription: "${text}"`);
          // Pass transcription back to the session for LLM processing
          // This would be handled by the channel (e.g., Telegram)
          if (currentSessionCallback) {
            currentSessionCallback(text);
          }
        },
        onResponse: (text: string) => {
          logger.info(`💬 Response: "${text}"`);
        },
        onAudioReady: (audioBuffer: Buffer) => {
          logger.info(`🔊 Audio ready: ${audioBuffer.length} bytes`);
        },
        onError: (error: Error) => {
          logger.error('❌ Talk mode error:', error);
        },
      };

      // Start talk mode
      await handler.start(callbacks);

      logger.info('✓ Talk mode started');

      return JSON.stringify({
        success: true,
        message: 'Talk mode started. Listening for wake word...',
        config: {
          wake_phrase: currentConfig.wakePhrase,
          wake_threshold: currentConfig.wakeThreshold,
          silence_duration: currentConfig.silenceDuration,
          max_recording_duration: currentConfig.maxRecordingDuration,
        },
        instructions: 'Say the wake phrase to start a conversation. Use stop_talk_mode to stop.',
      });

    } catch (error) {
      const err = error as Error;
      logger.error('start_talk_mode failed:', err);
      return JSON.stringify({
        success: false,
        error: err.message,
      });
    }
  },
};

/**
 * Tool: Stop Talk Mode
 */
export const stopTalkModeTool: Tool = {
  name: 'stop_talk_mode',
  description: `Stop continuous voice conversation mode.

This will:
- Stop listening for the wake word
- Cancel any in-progress recording
- Release microphone access

After stopping, you can restart talk mode with start_talk_mode.`,

  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },

  async execute(_args: Record<string, unknown>): Promise<string> {
    try {
      if (!talkModeHandler) {
        return JSON.stringify({
          success: false,
          error: 'Talk mode is not initialized.',
        });
      }

      if (!talkModeHandler.isActive()) {
        return JSON.stringify({
          success: false,
          error: 'Talk mode is not currently running.',
        });
      }

      await talkModeHandler.stop();
      logger.info('✓ Talk mode stopped');

      return JSON.stringify({
        success: true,
        message: 'Talk mode stopped. Microphone released.',
      });

    } catch (error) {
      const err = error as Error;
      logger.error('stop_talk_mode failed:', err);
      return JSON.stringify({
        success: false,
        error: err.message,
      });
    }
  },
};

/**
 * Tool: Get Talk Mode Status
 */
export const getTalkModeStatusTool: Tool = {
  name: 'get_talk_mode_status',
  description: `Check if talk mode is currently active and view configuration.

Returns:
- Whether talk mode is running
- Current configuration (wake phrase, thresholds, etc.)
- Desktop/VPS compatibility warning`,

  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },

  async execute(_args: Record<string, unknown>): Promise<string> {
    try {
      const isActive = talkModeHandler?.isActive() ?? false;
      const currentConfig = talkModeHandler?.getConfig();

      return JSON.stringify({
        success: true,
        is_active: isActive,
        config: currentConfig || null,
        compatibility: {
          desktop: true,
          vps: false,
          requires: ['microphone', 'speaker', 'node-record-lpcm16'],
        },
        status: isActive ? 'Listening for wake word' : 'Stopped',
      });

    } catch (error) {
      const err = error as Error;
      logger.error('get_talk_mode_status failed:', err);
      return JSON.stringify({
        success: false,
        error: err.message,
      });
    }
  },
};

/**
 * Set session callback for transcriptions
 * This allows the channel (e.g., Telegram) to receive transcriptions
 */
export function setTalkModeSessionCallback(callback: (transcription: string) => void): void {
  currentSessionCallback = callback;
}

/**
 * Clear session callback
 */
export function clearTalkModeSessionCallback(): void {
  currentSessionCallback = null;
}

/**
 * Export all talk mode tools
 */
export const talkModeTools: Tool[] = [
  startTalkModeTool,
  stopTalkModeTool,
  getTalkModeStatusTool,
];
