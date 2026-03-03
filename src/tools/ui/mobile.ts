import { mobileGateway } from "../../gateway/mobile.ts";
import { createLogger } from "../../logger.ts";

const log = createLogger("mobile-tools");

/**
 * Tool to fetch the last known GPS location of a mobile companion.
 */
export async function get_mobile_location(userId: string = "default-user") {
    const state = mobileGateway.getMobileState(userId);
    if (!state?.location) {
        // Trigger a refresh for next time
        await mobileGateway.requestAction(userId, "gps_refresh");
        return {
            success: false,
            message: "No cached location found. A refresh request has been sent to the mobile device."
        };
    }

    return {
        success: true,
        latitude: state.location.latitude,
        longitude: state.location.longitude,
        accuracy: state.location.accuracy,
        timestamp: new Date(state.location.timestamp).toISOString()
    };
}

/**
 * Tool to trigger a camera capture on the mobile device.
 */
export async function request_camera_capture(userId: string = "default-user") {
    const success = await mobileGateway.requestAction(userId, "camera");
    if (!success) {
        return { success: false, message: "Mobile device not connected via WebSocket." };
    }

    return {
        success: true,
        message: "Camera capture request sent. Waiting for mobile device to upload the image."
    };
}

/**
 * Tool to send an urgent push notification to the mobile device.
 */
export async function send_push_notification(text: string, userId: string = "default-user") {
    // In a real implementation, this would call FCM or Apple Push Notification service
    // For now, we send it over the active WebSocket as an "urgent" message
    const success = await mobileGateway.requestAction(userId, "gps_refresh"); // Just a placeholder for push logic
    await mobileGateway.sendMessage(userId, `🔔 URGENT: ${text}`);

    return {
        success: true,
        message: "Notification sent (simulated via WebSocket for connected devices)."
    };
}
