import "./src/config.ts";
import { runAgent } from "./src/agent.ts";
import { registry } from "./src/tools/index.ts";
import { datetimeTool } from "./src/tools/datetime.ts";
import { get_mobile_location, request_camera_capture, send_push_notification } from "./src/tools/mobile.ts";

async function test() {
    registry.register(datetimeTool);

    // Inline mobile tools registration logic from index.ts
    registry.register({
        name: "get_mobile_location",
        description: "Get the current GPS location of the mobile device companion.",
        inputSchema: {
            type: "object",
            properties: { userId: { type: "string" } }
        },
        execute: async (args: any) => JSON.stringify(await get_mobile_location(args.userId))
    });
    registry.register({
        name: "request_camera_capture",
        description: "Trigger the camera on the mobile device to take a photo.",
        inputSchema: {
            type: "object",
            properties: { userId: { type: "string" } }
        },
        execute: async (args: any) => JSON.stringify(await request_camera_capture(args.userId))
    });
    registry.register({
        name: "send_push_notification",
        description: "Send an urgent push notification to the mobile device.",
        inputSchema: {
            type: "object",
            properties: {
                text: { type: "string" },
                userId: { type: "string" }
            },
            required: ["text"]
        },
        execute: async (args: any) => JSON.stringify(await send_push_notification(args.text, args.userId))
    });

    console.log("Starting test run with mobile tools...");
    try {
        const result = await runAgent({
            message: "where is my phone?",
            sessionId: "debug-session-" + Date.now(),
        });
        console.log("Result:", result.text);
    } catch (err: any) {
        console.error("Caught error message:", err.message);
        console.error("Error status:", err.status);
        console.error("Error headers:", err.headers);
        console.error("Error body:", err.error);
    }
}

test();
