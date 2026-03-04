/**
 * Check Dashboard Tools Registration
 * Verifies that all required dashboard backend tools are registered
 */

import "../src/config.ts";
import { registry } from "../src/tools/index.ts";
import { dashboardTools } from "../src/tools/ui/index.ts";
import { voiceSettingsTools } from "../src/tools/voice/index.ts";

// Register dashboard tools
dashboardTools.forEach(tool => registry.register(tool));
voiceSettingsTools.forEach(tool => registry.register(tool));

const requiredTools = [
  // Voice Settings
  "getVoiceSettings",
  "setVoiceMode",
  "setTTSProvider",
  
  // Session & Notifications
  "getSessionInfo",
  "getNotificationPreferences",
  "setNotificationPreferences",
  
  // Usage & Analytics
  "getUsageStats",
  "getUsageHistory",
  "getModelBreakdown",
];

console.log("🔍 Checking Dashboard Tool Registration...\n");

let allPresent = true;

for (const toolName of requiredTools) {
  const tool = registry.get(toolName);
  if (tool) {
    console.log(`✅ ${toolName}`);
  } else {
    console.log(`❌ ${toolName} - NOT FOUND`);
    allPresent = false;
  }
}

console.log("\n" + "=".repeat(50));

if (allPresent) {
  console.log("✅ All required dashboard tools are registered!");
  console.log("\n📋 Tool Definitions:");
  
  const defs = registry.getOpenAIDefinitions();
  const dashboardDefs = defs.filter(d => 
    requiredTools.includes(d.function.name)
  );
  
  console.log(`Found ${dashboardDefs.length} dashboard tools total`);
  
  process.exit(0);
} else {
  console.log("❌ Some required tools are missing!");
  process.exit(1);
}
