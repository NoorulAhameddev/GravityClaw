import "./src/config.ts";
import { registry } from "./src/tools/index.ts";
import { datetimeTool } from "./src/tools/datetime.ts";
import { shellTool } from "./src/tools/shell.ts";
import { saveFactTool, recallFactsTool } from "./src/tools/markdown-memory.ts";
import { saveEntityTool, saveRelationshipTool, queryGraphTool } from "./src/tools/graph.ts";
import { searchAttachmentsTool } from "./src/tools/attachments.ts";
import { searchMemorySemanticTool } from "./src/tools/supabase-memory.ts";
import { voiceTools } from "./src/tools/voice.ts";
import { ttsTools } from "./src/tools/tts.ts";
import { elevenLabsTools } from "./src/tools/elevenlabs.ts";
import { voiceSettingsTools } from "./src/tools/voice-settings.ts";
import { wakeWordTools } from "./src/tools/wake-word.ts";
import { talkModeTools } from "./src/tools/talk-mode.ts";
import { fileOperationTools } from "./src/tools/files.ts";
import { searchTools } from "./src/tools/search.ts";
import { browserTools } from "./src/tools/browser.ts";
import { schedulerTools } from "./src/scheduler/index.ts";
import { webhookTools } from "./webhooks/index.ts";
import { communicationTools } from "./src/tools/communication.ts";
import { heartbeatTools } from "./src/heartbeat/index.ts";
import { spawnAgentTool, aggregateResultsTool } from "./src/tools/swarm.ts";

async function checkTools() {
    registry.register(datetimeTool);
    registry.register(shellTool);
    registry.register(saveFactTool);
    registry.register(recallFactsTool);
    registry.register(saveEntityTool);
    registry.register(saveRelationshipTool);
    registry.register(queryGraphTool);
    registry.register(searchAttachmentsTool);
    registry.register(searchMemorySemanticTool);
    voiceTools.forEach(tool => registry.register(tool));
    ttsTools.forEach(tool => registry.register(tool));
    elevenLabsTools.forEach(tool => registry.register(tool));
    voiceSettingsTools.forEach(tool => registry.register(tool));
    wakeWordTools.forEach(tool => registry.register(tool));
    talkModeTools.forEach(tool => registry.register(tool));
    fileOperationTools.forEach(tool => registry.register(tool));
    searchTools.forEach(tool => registry.register(tool));
    browserTools.forEach(tool => registry.register(tool));
    schedulerTools.forEach(tool => registry.register(tool));
    webhookTools.forEach(tool => registry.register(tool));
    communicationTools.forEach(tool => registry.register(tool));
    heartbeatTools.forEach(tool => registry.register(tool));
    registry.register(spawnAgentTool);
    registry.register(aggregateResultsTool);

    // Mobile Tools
    registry.register({
        name: "get_mobile_location",
        description: "Get the current GPS location of the mobile device companion.",
        inputSchema: {
            type: "object",
            properties: { userId: { type: "string" } }
        },
        execute: async () => "result"
    });

    const tools = registry.getOpenAIDefinitions();
    console.log(`Total tools: ${tools.length}`);

    for (const t of tools) {
        if (!t.function.parameters) {
            console.error(`ERROR: Tool ${t.function.name} has no parameters!`);
        } else if (t.function.parameters.type !== "object") {
            console.error(`ERROR: Tool ${t.function.name} parameter type is not object!`);
        }
    }
    console.log("Validation complete.");
}

checkTools().catch(err => console.error(err));
