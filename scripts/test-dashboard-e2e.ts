/**
 * Test Dashboard Tools - End to End
 * Tests that all dashboard tools execute correctly
 */

import "../src/config.ts";
import { registry } from "../src/tools/index.ts";
import { dashboardTools } from "../src/tools/ui/index.ts";
import { voiceSettingsTools } from "../src/tools/voice/index.ts";
import { recordUsage } from "../src/usage.ts";
import { setSessionSettings } from "../src/session.ts";

// Register tools
dashboardTools.forEach(tool => registry.register(tool));
voiceSettingsTools.forEach(tool => registry.register(tool));

const testSessionId = "test-dashboard-e2e-" + Date.now();

console.log(`🧪 Testing Dashboard Tools (Session: ${testSessionId})\n`);

// Create some test data
console.log("📝 Creating test data...");

// Add usage records
recordUsage({
  sessionId: testSessionId,
  model: "gpt-4",
  promptTokens: 100,
  completionTokens: 50,
  latency: 250,
  provider: "openai"
});

recordUsage({
  sessionId: testSessionId,
  model: "claude-3-sonnet",
  promptTokens: 200,
  completionTokens: 100,
  latency: 300,
  provider: "anthropic"
});

// Set session settings
setSessionSettings(testSessionId, {
  thinkingLevel: "medium",
  voiceMode: "full",
  notifications: {
    successNotifications: true,
    errorNotifications: true,
    frequency: "realtime"
  }
});

console.log("✅ Test data created\n");

// Test each tool
async function testTool(toolName: string, input: Record<string, unknown>) {
  const tool = registry.get(toolName);
  if (!tool) {
    console.log(`❌ ${toolName} - Tool not found`);
    return false;
  }
  
  try {
    const result = await tool.execute(input);
    const parsed = JSON.parse(result);
    
    if (parsed.success !== false && !parsed.error) {
      console.log(`✅ ${toolName} - OK`);
      return true;
    } else {
      console.log(`⚠️  ${toolName} - Failed: ${parsed.error || 'Unknown error'}`);
      return false;
    }
  } catch (err) {
    console.log(`❌ ${toolName} - Error: ${err}`);
    return false;
  }
}

(async () => {
  console.log("🔬 Testing Tools...\n");
  
  const tests = [
    // Voice Settings
    ["getVoiceSettings", { __sessionId: testSessionId }],
    ["setVoiceMode", { mode: "full-voice", __sessionId: testSessionId }],
    ["setTTSProvider", { provider: "openai", voiceId: "nova", __sessionId: testSessionId }],
    
    // Session Info
    ["getSessionInfo", { sessionId: testSessionId }],
    
    // Notifications
    ["getNotificationPreferences", { sessionId: testSessionId }],
    ["setNotificationPreferences", { 
      sessionId: testSessionId,
      notifications: {
        successNotifications: true,
        warningNotifications: false,
        errorNotifications: true,
        frequency: "batched"
      }
    }],
    
    // Usage & Analytics
    ["getUsageStats", { sessionId: testSessionId }],
    ["getUsageHistory", { sessionId: testSessionId, limit: 10 }],
    ["getModelBreakdown", { sessionId: testSessionId }],
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const [toolName, input] of tests) {
    const success = await testTool(toolName as string, input as Record<string, unknown>);
    if (success) {
      passed++;
    } else {
      failed++;
    }
  }
  
  console.log("\n" + "=".repeat(50));
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log("✅ All dashboard tools working correctly!");
    console.log("\n🎉 Backend integration COMPLETE - Ready for frontend wiring!");
    process.exit(0);
  } else {
    console.log("❌ Some tests failed");
    process.exit(1);
  }
})();
