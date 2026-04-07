import { mobileGateway } from "../../gateway/mobile.ts";
import { createLogger } from "../../logger.ts";
import type { Tool } from "./index.js";

const log = createLogger("mobile-tools");

export const getMobileLocationTool: Tool = {
    name: "get_mobile_location",
    description: "Get the last known GPS location of a connected mobile companion device",
    inputSchema: {
        type: "object",
        properties: {
            userId: {
                type: "string",
                description: "The user ID of the mobile device (default: default-user)"
            }
        }
    },
    async execute(input: Record<string, unknown>) {
        const userId = (input.userId as string) || "default-user";
        const state = mobileGateway.getMobileState(userId);
        
        if (!state?.location) {
            await mobileGateway.requestLocationRefresh(userId);
            return JSON.stringify({
                success: false,
                message: "No cached location found. A refresh request has been sent to the mobile device."
            });
        }

        return JSON.stringify({
            success: true,
            latitude: state.location.latitude,
            longitude: state.location.longitude,
            accuracy: state.location.accuracy,
            timestamp: new Date(state.location.timestamp).toISOString()
        });
    }
};

export const requestCameraCaptureTool: Tool = {
    name: "request_camera_capture",
    description: "Request the mobile companion device to capture a photo using the camera",
    inputSchema: {
        type: "object",
        properties: {
            userId: {
                type: "string",
                description: "The user ID of the mobile device (default: default-user)"
            }
        }
    },
    async execute(input: Record<string, unknown>) {
        const userId = (input.userId as string) || "default-user";
        
        if (!mobileGateway.isConnected(userId)) {
            return JSON.stringify({
                success: false,
                message: "Mobile device not connected. Ensure the companion app is running and connected to Gravity Claw."
            });
        }

        const success = await mobileGateway.requestCameraCapture(userId);
        return JSON.stringify({
            success: true,
            message: success 
                ? "Camera capture request sent. The mobile device will capture and upload the image."
                : "Failed to send camera request to mobile device."
        });
    }
};

export const requestScreenRecordingTool: Tool = {
    name: "request_screen_recording",
    description: "Request the mobile companion device to start screen recording",
    inputSchema: {
        type: "object",
        properties: {
            userId: {
                type: "string",
                description: "The user ID of the mobile device (default: default-user)"
            },
            duration: {
                type: "number",
                description: "Duration in seconds (default: 30)"
            }
        }
    },
    async execute(input: Record<string, unknown>) {
        const userId = (input.userId as string) || "default-user";
        const duration = (input.duration as number) || 30;
        
        if (!mobileGateway.isConnected(userId)) {
            return JSON.stringify({
                success: false,
                message: "Mobile device not connected."
            });
        }

        const success = await mobileGateway.requestScreenRecording(userId, duration);
        return JSON.stringify({
            success: true,
            message: `Screen recording started for ${duration} seconds.`,
            duration
        });
    }
};

export const stopScreenRecordingTool: Tool = {
    name: "stop_screen_recording",
    description: "Stop an active screen recording on the mobile companion device",
    inputSchema: {
        type: "object",
        properties: {
            userId: {
                type: "string",
                description: "The user ID of the mobile device (default: default-user)"
            }
        }
    },
    async execute(input: Record<string, unknown>) {
        const userId = (input.userId as string) || "default-user";
        const success = await mobileGateway.stopScreenRecording(userId);
        return JSON.stringify({
            success,
            message: success ? "Screen recording stop request sent." : "Failed to stop recording."
        });
    }
};

export const sendPushNotificationTool: Tool = {
    name: "send_push_notification",
    description: "Send a push notification to the mobile companion device",
    inputSchema: {
        type: "object",
        properties: {
            title: {
                type: "string",
                description: "Notification title"
            },
            body: {
                type: "string",
                description: "Notification body text"
            },
            userId: {
                type: "string",
                description: "The user ID of the mobile device (default: default-user)"
            }
        },
        required: ["title", "body"]
    },
    async execute(input: Record<string, unknown>) {
        const title = input.title as string;
        const body = input.body as string;
        const userId = (input.userId as string) || "default-user";
        
        const success = await mobileGateway.sendPushNotification(userId, {
            title,
            body,
            data: {},
            priority: "high"
        });

        return JSON.stringify({
            success,
            message: success 
                ? `Push notification sent: "${title}"`
                : "Mobile device not connected."
        });
    }
};

export const getMobileDeviceInfoTool: Tool = {
    name: "get_mobile_device_info",
    description: "Get device information (OS, model, version) from the mobile companion",
    inputSchema: {
        type: "object",
        properties: {
            userId: {
                type: "string",
                description: "The user ID of the mobile device (default: default-user)"
            }
        }
    },
    async execute(input: Record<string, unknown>) {
        const userId = (input.userId as string) || "default-user";
        const state = mobileGateway.getMobileState(userId);
        
        if (!state?.deviceInfo) {
            return JSON.stringify({
                success: false,
                message: "No device info available."
            });
        }

        return JSON.stringify({
            success: true,
            platform: state.deviceInfo.platform,
            osVersion: state.deviceInfo.osVersion,
            appVersion: state.deviceInfo.appVersion,
            model: state.deviceInfo.model
        });
    }
};

export const getMobileBatteryStatusTool: Tool = {
    name: "get_mobile_battery_status",
    description: "Get battery level and charging status from the mobile companion",
    inputSchema: {
        type: "object",
        properties: {
            userId: {
                type: "string",
                description: "The user ID of the mobile device (default: default-user)"
            }
        }
    },
    async execute(input: Record<string, unknown>) {
        const userId = (input.userId as string) || "default-user";
        const state = mobileGateway.getMobileState(userId);
        
        if (state?.batteryLevel === undefined) {
            return JSON.stringify({
                success: false,
                message: "No battery status available."
            });
        }

        return JSON.stringify({
            success: true,
            level: state.batteryLevel,
            isCharging: state.isCharging || false
        });
    }
};

export const listMobileDevicesTool: Tool = {
    name: "list_mobile_devices",
    description: "List all connected mobile companion devices",
    inputSchema: {
        type: "object",
        properties: {}
    },
    async execute() {
        const connected = mobileGateway.getConnectedDevices();
        
        const devices = connected.map(id => {
            const state = mobileGateway.getMobileState(id);
            return {
                userId: id,
                connected: true,
                platform: state?.deviceInfo?.platform || "unknown",
                model: state?.deviceInfo?.model || "unknown",
                battery: state?.batteryLevel,
                hasLocation: !!state?.location
            };
        });

        return JSON.stringify({
            success: true,
            count: devices.length,
            devices
        });
    }
};

export const getLastCameraCaptureTool: Tool = {
    name: "get_last_camera_capture",
    description: "Get information about the last camera capture from the mobile device",
    inputSchema: {
        type: "object",
        properties: {
            userId: {
                type: "string",
                description: "The user ID of the mobile device (default: default-user)"
            }
        }
    },
    async execute(input: Record<string, unknown>) {
        const userId = (input.userId as string) || "default-user";
        const state = mobileGateway.getMobileState(userId);
        
        if (!state?.lastCameraCapture) {
            return JSON.stringify({
                success: false,
                message: "No camera capture found."
            });
        }

        return JSON.stringify({
            success: true,
            filename: state.lastCameraCapture.filename,
            timestamp: new Date(state.lastCameraCapture.timestamp).toISOString(),
            path: state.lastCameraCapture.path
        });
    }
};

export const getLastScreenRecordingTool: Tool = {
    name: "get_last_screen_recording",
    description: "Get information about the last screen recording from the mobile device",
    inputSchema: {
        type: "object",
        properties: {
            userId: {
                type: "string",
                description: "The user ID of the mobile device (default: default-user)"
            }
        }
    },
    async execute(input: Record<string, unknown>) {
        const userId = (input.userId as string) || "default-user";
        const state = mobileGateway.getMobileState(userId);
        
        if (!state?.lastScreenRecording) {
            return JSON.stringify({
                success: false,
                message: "No screen recording found."
            });
        }

        return JSON.stringify({
            success: true,
            filename: state.lastScreenRecording.filename,
            timestamp: new Date(state.lastScreenRecording.timestamp).toISOString(),
            duration: state.lastScreenRecording.duration,
            path: state.lastScreenRecording.path
        });
    }
};

export const requestLocationRefreshTool: Tool = {
    name: "request_location_refresh",
    description: "Request the mobile companion to refresh its GPS location",
    inputSchema: {
        type: "object",
        properties: {
            userId: {
                type: "string",
                description: "The user ID of the mobile device (default: default-user)"
            }
        }
    },
    async execute(input: Record<string, unknown>) {
        const userId = (input.userId as string) || "default-user";
        const success = await mobileGateway.requestLocationRefresh(userId);
        
        return JSON.stringify({
            success,
            message: success 
                ? "Location refresh request sent to mobile device."
                : "Mobile device not connected."
        });
    }
};

export const mobileTools = [
    getMobileLocationTool,
    requestCameraCaptureTool,
    requestScreenRecordingTool,
    stopScreenRecordingTool,
    sendPushNotificationTool,
    getMobileDeviceInfoTool,
    getMobileBatteryStatusTool,
    listMobileDevicesTool,
    getLastCameraCaptureTool,
    getLastScreenRecordingTool,
    requestLocationRefreshTool
];
