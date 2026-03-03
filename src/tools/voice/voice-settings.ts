import type { Tool } from './index.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('voice-settings');

/**
 * In-memory storage for voice settings per session
 * In production, this would be persisted in the database
 */
const voiceSettingsStore = new Map<
  string,
  {
    mode: 'off' | 'transcribe-only' | 'full-voice';
    ttsProvider: 'openai' | 'elevenlabs';
    voiceId?: string;
  }
>();

/**
 * Get voice settings for a session
 */
export function getVoiceSettings(sessionId: string) {
  return voiceSettingsStore.get(sessionId) || {
    mode: 'off' as const,
    ttsProvider: 'openai' as const,
  };
}

/**
 * Set voice settings for a session
 */
export function setVoiceSettings(sessionId: string, settings: Partial<ReturnType<typeof getVoiceSettings>>) {
  const current = getVoiceSettings(sessionId);
  const updated = { ...current, ...settings };
  voiceSettingsStore.set(sessionId, updated);
  return updated;
}

/**
 * Tool: Set voice mode for a session
 * Modes: 'off' (no voice), 'transcribe-only' (transcribe input), 'full-voice' (both input and output)
 */
export const setVoiceModeTool: Tool = {
  name: 'setVoiceMode',
  description:
    'Set voice mode for the current session. off: disable voice, transcribe-only: transcribe voice input only, full-voice: transcribe input and speak output.',
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['off', 'transcribe-only', 'full-voice'],
        description: 'Voice mode to set',
      },
      __sessionId: {
        type: 'string',
        description: 'Session ID (injected)',
      },
    },
    required: ['mode'],
  },
  async execute(input) {
    try {
      const { mode, __sessionId } = input as Record<string, string | undefined>;

      if (!mode) {
        return JSON.stringify({ error: 'mode is required' });
      }

      if (!__sessionId) {
        return JSON.stringify({ error: 'session ID not found' });
      }

      const updated = setVoiceSettings(__sessionId, { mode: mode as any });

      logger.info(`[${__sessionId}] Voice mode set to: ${mode}`);

      return JSON.stringify({
        success: true,
        mode: updated.mode,
        ttsProvider: updated.ttsProvider,
        message: `Voice mode set to ${mode}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('set_voice_mode failed:', message);
      return JSON.stringify({ error: message });
    }
  },
};

/**
 * Tool: Set TTS provider for a session
 * Supports: 'openai' or 'elevenlabs'
 */
export const setTTSProviderTool: Tool = {
  name: 'setTTSProvider',
  description: 'Set text-to-speech provider for voice responses. Choose between OpenAI and ElevenLabs.',
  inputSchema: {
    type: 'object',
    properties: {
      provider: {
        type: 'string',
        enum: ['openai', 'elevenlabs'],
        description: 'TTS provider to use',
      },
      voiceId: {
        type: 'string',
        description:
          'Optional voice ID. For OpenAI: alloy, echo, fable, onyx, nova, shimmer. For ElevenLabs: bella, rachel, william, etc.',
      },
      __sessionId: {
        type: 'string',
        description: 'Session ID (injected)',
      },
    },
    required: ['provider'],
  },
  async execute(input) {
    try {
      const { provider, voiceId, __sessionId } = input as Record<string, string | undefined>;

      if (!provider) {
        return JSON.stringify({ error: 'provider is required' });
      }

      if (!__sessionId) {
        return JSON.stringify({ error: 'session ID not found' });
      }

      const updateObj: any = {
        ttsProvider: provider,
      };
      if (voiceId) {
        updateObj.voiceId = voiceId;
      }

      const updated = setVoiceSettings(__sessionId, updateObj);

      logger.info(`[${__sessionId}] TTS provider set to: ${provider}${voiceId ? ` (voice: ${voiceId})` : ''}`);

      return JSON.stringify({
        success: true,
        ttsProvider: updated.ttsProvider,
        voiceId: updated.voiceId,
        message: `TTS provider set to ${provider}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('set_tts_provider failed:', message);
      return JSON.stringify({ error: message });
    }
  },
};

/**
 * Tool: Get current voice settings for a session
 */
export const getVoiceSettingsTool: Tool = {
  name: 'getVoiceSettings',
  description: 'Get current voice settings and status for the session.',
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
      const { __sessionId } = input as Record<string, string | undefined>;

      if (!__sessionId) {
        return JSON.stringify({ error: 'session ID not found' });
      }

      const settings = getVoiceSettings(__sessionId);

      return JSON.stringify({
        success: true,
        voiceMode: settings.mode,
        ttsProvider: settings.ttsProvider,
        voiceId: settings.voiceId || 'default',
        voiceEnabled: settings.mode !== 'off',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('get_voice_settings failed:', message);
      return JSON.stringify({ error: message });
    }
  },
};

export const voiceSettingsTools = [setVoiceModeTool, setTTSProviderTool, getVoiceSettingsTool];
