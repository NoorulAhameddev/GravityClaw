import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getVoiceSettings, setVoiceSettings, setVoiceModeTool, setTTSProviderTool, getVoiceSettingsTool } from '../tools/voice-settings.ts';

describe('Voice Settings Management', () => {
  beforeEach(() => {
    // Clear any stored settings before each test
    const store = new Map();
  });

  describe('getVoiceSettings', () => {
    it('should return default settings for new sessions', () => {
      const settings = getVoiceSettings('new-session');
      expect(settings.mode).toBe('off');
      expect(settings.ttsProvider).toBe('openai');
    });

    it('should return stored settings for existing sessions', () => {
      const sessionId = 'test-session-123';
      setVoiceSettings(sessionId, { mode: 'full-voice', ttsProvider: 'elevenlabs' });
      
      const settings = getVoiceSettings(sessionId);
      expect(settings.mode).toBe('full-voice');
      expect(settings.ttsProvider).toBe('elevenlabs');
    });
  });

  describe('setVoiceSettings', () => {
    it('should update voice mode', () => {
      const sessionId = 'test-session-1';
      const result = setVoiceSettings(sessionId, { mode: 'transcribe-only' });
      
      expect(result.mode).toBe('transcribe-only');
      expect(getVoiceSettings(sessionId).mode).toBe('transcribe-only');
    });

    it('should update TTS provider', () => {
      const sessionId = 'test-session-2';
      const result = setVoiceSettings(sessionId, { ttsProvider: 'elevenlabs' });
      
      expect(result.ttsProvider).toBe('elevenlabs');
      expect(getVoiceSettings(sessionId).ttsProvider).toBe('elevenlabs');
    });

    it('should update voice ID', () => {
      const sessionId = 'test-session-3';
      const result = setVoiceSettings(sessionId, { voiceId: 'rachel' });
      
      expect(result.voiceId).toBe('rachel');
      expect(getVoiceSettings(sessionId).voiceId).toBe('rachel');
    });

    it('should preserve existing settings when updating', () => {
      const sessionId = 'test-session-4';
      setVoiceSettings(sessionId, { mode: 'full-voice', ttsProvider: 'openai' });
      setVoiceSettings(sessionId, { ttsProvider: 'elevenlabs' });
      
      const settings = getVoiceSettings(sessionId);
      expect(settings.mode).toBe('full-voice');
      expect(settings.ttsProvider).toBe('elevenlabs');
    });
  });

  describe('setVoiceModeTool', () => {
    it('should require mode parameter', async () => {
      const result = await setVoiceModeTool.execute({} as any);
      const parsed = JSON.parse(result);
      expect(parsed.error).toBeDefined();
      expect(parsed.success).toBeUndefined();
    });

    it('should require session ID', async () => {
      const result = await setVoiceModeTool.execute({ mode: 'off' } as any);
      const parsed = JSON.parse(result);
      expect(parsed.error).toBeDefined();
    });

    it('should set voice mode successfully', async () => {
      const input = {
        mode: 'full-voice',
        __sessionId: 'session-voice-test',
      };
      
      const result = await setVoiceModeTool.execute(input as any);
      const parsed = JSON.parse(result);
      
      expect(parsed.success).toBe(true);
      expect(parsed.mode).toBe('full-voice');
    });

    it('should accept all valid modes', async () => {
      const modes = ['off', 'transcribe-only', 'full-voice'];
      
      for (const mode of modes) {
        const result = await setVoiceModeTool.execute({
          mode,
          __sessionId: 'mode-test-' + mode,
        } as any);
        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(true);
        expect(parsed.mode).toBe(mode);
      }
    });

    it('should have correct tool metadata', () => {
      expect(setVoiceModeTool.name).toBe('set_voice_mode');
      expect(setVoiceModeTool.description).toBeDefined();
      expect(setVoiceModeTool.inputSchema).toBeDefined();
      const props = setVoiceModeTool.inputSchema.properties as any;
      expect(props.mode.enum).toContain('off');
      expect(props.mode.enum).toContain('full-voice');
    });
  });

  describe('setTTSProviderTool', () => {
    it('should require provider parameter', async () => {
      const result = await setTTSProviderTool.execute({} as any);
      const parsed = JSON.parse(result);
      expect(parsed.error).toBeDefined();
    });

    it('should require session ID', async () => {
      const result = await setTTSProviderTool.execute({ provider: 'openai' } as any);
      const parsed = JSON.parse(result);
      expect(parsed.error).toBeDefined();
    });

    it('should set TTS provider successfully', async () => {
      const input = {
        provider: 'elevenlabs',
        __sessionId: 'session-tts-test',
      };
      
      const result = await setTTSProviderTool.execute(input as any);
      const parsed = JSON.parse(result);
      
      expect(parsed.success).toBe(true);
      expect(parsed.ttsProvider).toBe('elevenlabs');
    });

    it('should accept voice ID parameter', async () => {
      const input = {
        provider: 'elevenlabs',
        voiceId: 'rachel',
        __sessionId: 'session-voice-id-test',
      };
      
      const result = await setTTSProviderTool.execute(input as any);
      const parsed = JSON.parse(result);
      
      expect(parsed.success).toBe(true);
      expect(parsed.voiceId).toBe('rachel');
    });

    it('should accept all valid providers', async () => {
      const providers = ['openai', 'elevenlabs'];
      
      for (const provider of providers) {
        const result = await setTTSProviderTool.execute({
          provider,
          __sessionId: 'provider-test-' + provider,
        } as any);
        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(true);
        expect(parsed.ttsProvider).toBe(provider);
      }
    });

    it('should have correct tool metadata', () => {
      expect(setTTSProviderTool.name).toBe('set_tts_provider');
      expect(setTTSProviderTool.description).toBeDefined();
      expect(setTTSProviderTool.inputSchema).toBeDefined();
      const props = setTTSProviderTool.inputSchema.properties as any;
      expect(props.provider.enum).toContain('openai');
      expect(props.provider.enum).toContain('elevenlabs');
    });
  });

  describe('getVoiceSettingsTool', () => {
    it('should require session ID', async () => {
      const result = await getVoiceSettingsTool.execute({} as any);
      const parsed = JSON.parse(result);
      expect(parsed.error).toBeDefined();
    });

    it('should return current settings', async () => {
      const sessionId = 'settings-test-session';
      setVoiceSettings(sessionId, { mode: 'full-voice', ttsProvider: 'elevenlabs', voiceId: 'bella' });
      
      const result = await getVoiceSettingsTool.execute({
        __sessionId: sessionId,
      } as any);
      const parsed = JSON.parse(result);
      
      expect(parsed.success).toBe(true);
      expect(parsed.voiceMode).toBe('full-voice');
      expect(parsed.ttsProvider).toBe('elevenlabs');
      expect(parsed.voiceId).toBe('bella');
    });

    it('should return default settings for new session', async () => {
      const result = await getVoiceSettingsTool.execute({
        __sessionId: 'new-settings-session',
      } as any);
      const parsed = JSON.parse(result);
      
      expect(parsed.success).toBe(true);
      expect(parsed.voiceMode).toBe('off');
      expect(parsed.ttsProvider).toBe('openai');
      expect(parsed.voiceEnabled).toBe(false);
    });

    it('should indicate when voice is enabled', async () => {
      const sessionId = 'enabled-test';
      setVoiceSettings(sessionId, { mode: 'full-voice' });
      
      const result = await getVoiceSettingsTool.execute({
        __sessionId: sessionId,
      } as any);
      const parsed = JSON.parse(result);
      
      expect(parsed.voiceEnabled).toBe(true);
    });

    it('should have correct tool metadata', () => {
      expect(getVoiceSettingsTool.name).toBe('get_voice_settings');
      expect(getVoiceSettingsTool.description).toBeDefined();
      expect(getVoiceSettingsTool.inputSchema).toBeDefined();
    });
  });

  describe('Voice Settings Workflow', () => {
    it('should complete a full user workflow', async () => {
      const sessionId = 'workflow-test';
      
      // Step 1: Get initial settings
      let result = await getVoiceSettingsTool.execute({ __sessionId: sessionId } as any);
      let parsed = JSON.parse(result);
      expect(parsed.voiceMode).toBe('off');
      
      // Step 2: Enable voice mode
      result = await setVoiceModeTool.execute({
        mode: 'full-voice',
        __sessionId: sessionId,
      } as any);
      parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      
      // Step 3: Switch to ElevenLabs
      result = await setTTSProviderTool.execute({
        provider: 'elevenlabs',
        voiceId: 'rachel',
        __sessionId: sessionId,
      } as any);
      parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      
      // Step 4: Verify settings
      result = await getVoiceSettingsTool.execute({ __sessionId: sessionId } as any);
      parsed = JSON.parse(result);
      expect(parsed.voiceMode).toBe('full-voice');
      expect(parsed.ttsProvider).toBe('elevenlabs');
      expect(parsed.voiceId).toBe('rachel');
      expect(parsed.voiceEnabled).toBe(true);
    });

    it('should handle provider switching', async () => {
      const sessionId = 'switch-test';
      
      // Start with ElevenLabs
      setVoiceSettings(sessionId, { ttsProvider: 'elevenlabs', voiceId: 'bella' });
      
      // Switch to OpenAI (voiceId becomes irrelevant)
      const result = await setTTSProviderTool.execute({
        provider: 'openai',
        __sessionId: sessionId,
      } as any);
      const parsed = JSON.parse(result);
      
      expect(parsed.ttsProvider).toBe('openai');
      expect(getVoiceSettings(sessionId).ttsProvider).toBe('openai');
    });
  });

  describe('Voice Settings Persistence', () => {
    it('should maintain settings across multiple calls', () => {
      const sessionId = 'persistence-test';
      
      setVoiceSettings(sessionId, { mode: 'transcribe-only' });
      expect(getVoiceSettings(sessionId).mode).toBe('transcribe-only');
      
      setVoiceSettings(sessionId, { ttsProvider: 'elevenlabs' });
      expect(getVoiceSettings(sessionId).mode).toBe('transcribe-only');
      expect(getVoiceSettings(sessionId).ttsProvider).toBe('elevenlabs');
    });

    it('should isolate sessions from each other', () => {
      const session1 = 'session-1';
      const session2 = 'session-2';
      
      setVoiceSettings(session1, { mode: 'full-voice', ttsProvider: 'openai' });
      setVoiceSettings(session2, { mode: 'off', ttsProvider: 'elevenlabs' });
      
      expect(getVoiceSettings(session1).mode).toBe('full-voice');
      expect(getVoiceSettings(session2).mode).toBe('off');
    });
  });
});
