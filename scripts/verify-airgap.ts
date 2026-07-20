#!/usr/bin/env node

/**
 * Air-Gap Mode Verification Script
 * Verifies that all air-gap related files can be imported and basic functionality works
 */

import { AIR_GAPPED, config } from './src/config.ts';
import { 
  enforceAirGap, 
  getAirGapProvider, 
  checkAirGapTool 
} from './src/airgap/enforcement.ts';
import { 
  localTextToSpeech, 
  getLocalTTSBackend 
} from './src/voice/local-tts.ts';
import { 
  localTranscribe, 
  getLocalTranscriptionBackend 
} from './src/voice/local-transcription.ts';

async function verify() {
  console.log('🧪 Air-Gapped Mode Verification');
  console.log('================================\n');

  // Check configuration
  console.log('✓ Configuration loaded');
  console.log(`  - AIR_GAPPED: ${AIR_GAPPED}`);
  console.log(`  - LLM_PROVIDER: ${config.LLM_PROVIDER}`);
  console.log(`  - OLLAMA_BASE_URL: ${config.OLLAMA_BASE_URL}`);

  // Check enforcement functions exist
  console.log('\n✓ Enforcement functions available');
  console.log(`  - enforceAirGap: ${typeof enforceAirGap}`);
  console.log(`  - getAirGapProvider: ${typeof getAirGapProvider}`);
  console.log(`  - checkAirGapTool: ${typeof checkAirGapTool}`);

  // Check TTS functions
  console.log('\n✓ Local TTS functions available');
  console.log(`  - localTextToSpeech: ${typeof localTextToSpeech}`);
  console.log(`  - getLocalTTSBackend: ${typeof getLocalTTSBackend}`);
  const ttsBackend = getLocalTTSBackend();
  console.log(`  - TTS Backend: ${ttsBackend}`);

  // Check STT functions
  console.log('\n✓ Local STT functions available');
  console.log(`  - localTranscribe: ${typeof localTranscribe}`);
  console.log(`  - getLocalTranscriptionBackend: ${typeof getLocalTranscriptionBackend}`);
  const sttBackend = getLocalTranscriptionBackend();
  console.log(`  - STT Backend: ${sttBackend}`);

  // Test provider selection
  console.log('\n✓ Provider selection test');
  const provider = getAirGapProvider();
  console.log(`  - Current provider: ${provider}`);
  if (AIR_GAPPED) {
    if (provider === 'ollama') {
      console.log('  ✓ Provider correctly forced to ollama');
    } else {
      console.log('  ✗ ERROR: Provider not forced to ollama in air-gap mode');
    }
  }

  // Test tool blocking (when air-gapped)
  if (AIR_GAPPED) {
    console.log('\n✓ Tool blocking test (air-gapped mode)');
    try {
      checkAirGapTool('web_search');
      console.log('  ✗ ERROR: web_search not blocked');
    } catch (err) {
      console.log('  ✓ web_search correctly blocked');
      console.log(`  - Error message includes guidance: ${(err as Error).message.includes('docs/AIRGAP')}`);
    }
  } else {
    console.log('\n✓ Tool blocking test (cloud mode)');
    try {
      checkAirGapTool('web_search');
      console.log('  ✓ web_search not blocked (correct for cloud mode)');
    } catch (err) {
      console.log('  ✗ ERROR: web_search blocked in cloud mode');
    }
  }

  // Test TTS
  console.log('\n✓ Local TTS test');
  try {
    const result = await localTextToSpeech('test', { fallbackToText: true });
    console.log(`  - TTS result type: ${result === null ? 'null' : 'Buffer'}`);
    console.log('  ✓ Local TTS function works');
  } catch (err) {
    console.log(`  ✗ ERROR: ${(err as Error).message}`);
  }

  console.log('\n✅ All verification checks complete!');
  console.log('\nFor full tests, run: npm test -- airgap\n');
}

verify().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
