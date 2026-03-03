import type { Tool } from './index.js';
import { config } from '../../config.js';
import { createWakeWordDetector, getAvailableWakeWords, type WakeWordCallback } from '../../voice/wake-word.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('wake-word-tools');

let wakeWordDetector: ReturnType<typeof createWakeWordDetector> | null = null;
let wakeWordCallback: WakeWordCallback | null = null;

/**
 * Get or create wake word detector instance
 */
function getWakeWordDetector() {
  if (!wakeWordDetector && config.OPENAI_API_KEY) {
    wakeWordDetector = createWakeWordDetector(config.OPENAI_API_KEY, {
      wakePhrase: config.WAKE_WORD_PHRASE || 'hey claw',
      threshold: config.WAKE_WORD_THRESHOLD || 0.75,
    });
  }
  if (!wakeWordDetector) {
    throw new Error('Wake word detector not configured. OpenAI API key required.');
  }
  return wakeWordDetector;
}

/**
 * Tool: Start wake word detection
 * NOTE: Desktop/local only - requires microphone access
 */
export const startWakeWordTool: Tool = {
  name: 'start_wake_word_detection',
  description:
    'Start listening for wake word ("Hey Claw" or custom phrase) via microphone. Desktop/local only - requires microphone access. Not available on VPS.',
  inputSchema: {
    type: 'object',
    properties: {
      wake_phrase: {
        type: 'string',
        description: 'Custom wake phrase to detect (default: "hey claw"). Use built-in words like "go", "stop", "yes", "no".',
      },
      threshold: {
        type: 'number',
        description: 'Confidence threshold (0-1, default: 0.75)',
      },
      __sessionId: {
        type: 'string',
        description: 'Session ID (injected)',
      },
    },
    required: [],
  },
  async execute(input) {
    try {
      const { wake_phrase, threshold } = input as Record<string, string | number | undefined>;

      const detector = getWakeWordDetector();

      // Update config if provided
      if (wake_phrase || threshold) {
        detector.updateConfig({
          ...(wake_phrase && { wakePhrase: String(wake_phrase) }),
          ...(threshold && { threshold: Number(threshold) }),
        });
      }

      // Check if already listening
      if (detector.isListening()) {
        return JSON.stringify({
          error: 'Wake word detection is already running. Use stop_wake_word_detection first.',
        });
      }

      // Define callback for when wake word is detected
      wakeWordCallback = async (transcribedText: string) => {
        logger.info(`Wake word triggered with command: ${transcribedText}`);
        // The agent will process this text in the main loop
        // For now, just log it - integration with agent loop is external
      };

      await detector.start(wakeWordCallback);

      const detectorConfig = detector.getConfig();

      return JSON.stringify({
        success: true,
        listening: true,
        wakePhrase: detectorConfig.wakePhrase,
        threshold: detectorConfig.threshold,
        message: `Listening for wake phrase: "${detectorConfig.wakePhrase}"`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('start_wake_word_detection failed:', message);
      return JSON.stringify({ error: message });
    }
  },
};

/**
 * Tool: Stop wake word detection
 */
export const stopWakeWordTool: Tool = {
  name: 'stop_wake_word_detection',
  description: 'Stop listening for wake word and release microphone.',
  inputSchema: {
    type: 'object',
    properties: {
      __sessionId: {
        type: 'string',
        description: 'Session ID (injected)',
      },
    },
    required: [],
  },
  async execute(input) {
    try {
      if (!wakeWordDetector) {
        return JSON.stringify({
          error: 'Wake word detector not initialized',
        });
      }

      if (!wakeWordDetector.isListening()) {
        return JSON.stringify({
          error: 'Wake word detection is not currently running',
        });
      }

      await wakeWordDetector.stop();

      return JSON.stringify({
        success: true,
        listening: false,
        message: 'Wake word detection stopped',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('stop_wake_word_detection failed:', message);
      return JSON.stringify({ error: message });
    }
  },
};

/**
 * Tool: Get wake word detection status
 */
export const getWakeWordStatusTool: Tool = {
  name: 'get_wake_word_status',
  description: 'Get current status of wake word detection (listening, configuration, etc.).',
  inputSchema: {
    type: 'object',
    properties: {
      __sessionId: {
        type: 'string',
        description: 'Session ID (injected)',
      },
    },
    required: [],
  },
  async execute(input) {
    try {
      if (!wakeWordDetector) {
        return JSON.stringify({
          success: true,
          listening: false,
          configured: false,
          message: 'Wake word detector not initialized',
        });
      }

      const detectorConfig = wakeWordDetector.getConfig();
      const listening = wakeWordDetector.isListening();

      return JSON.stringify({
        success: true,
        listening,
        configured: true,
        wakePhrase: detectorConfig.wakePhrase,
        threshold: detectorConfig.threshold,
        recordingDuration: detectorConfig.recordingDuration,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('get_wake_word_status failed:', message);
      return JSON.stringify({ error: message });
    }
  },
};

/**
 * Tool: List available wake words from TensorFlow model
 */
export const listWakeWordsTool: Tool = {
  name: 'list_available_wake_words',
  description:
    'List all built-in wake words supported by the TensorFlow.js Speech Commands model (e.g., go, stop, yes, no, up, down).',
  inputSchema: {
    type: 'object',
    properties: {
      __sessionId: {
        type: 'string',
        description: 'Session ID (injected)',
      },
    },
    required: [],
  },
  async execute(input) {
    try {
      const availableWords = await getAvailableWakeWords();

      return JSON.stringify({
        success: true,
        wakeWords: availableWords,
        count: availableWords.length,
        message: `Available wake words: ${availableWords.join(', ')}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('list_available_wake_words failed:', message);
      return JSON.stringify({ error: message });
    }
  },
};

export const wakeWordTools = [startWakeWordTool, stopWakeWordTool, getWakeWordStatusTool, listWakeWordsTool];
