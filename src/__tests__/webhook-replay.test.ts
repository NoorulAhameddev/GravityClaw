import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../db.ts";
import {
  createWebhook,
  getWebhook,
  recordDelivery,
  getLastFailedDelivery,
  webhookTools,
} from "../webhooks/index.ts";

describe("Webhook replay", () => {
  beforeEach(() => {
    db.exec("DELETE FROM webhook_deliveries");
    db.exec("DELETE FROM webhooks");
  });

  afterEach(() => {
    db.exec("DELETE FROM webhook_deliveries");
    db.exec("DELETE FROM webhooks");
  });

  it("should have replay_webhook in webhookTools array", () => {
    const names = webhookTools.map((t) => t.name);
    expect(names).toContain("replay_webhook");
  });

  it("should have valid input schema for replay tool", () => {
    const tool = webhookTools.find((t) => t.name === "replay_webhook")!;
    expect(tool.inputSchema).toBeDefined();
    expect(tool.inputSchema.required).toContain("webhook_id");
    expect(tool.inputSchema.properties?.webhook_id).toBeDefined();
  });

  it("should record a delivery", () => {
    const created = createWebhook({
      name: "test-hook",
      sessionId: "session-1",
    });

    const deliveryId = recordDelivery(created.id, '{"key":"value"}', "success", 200);
    expect(deliveryId).toBeGreaterThan(0);
  });

  it("should get last failed delivery", () => {
    const created = createWebhook({
      name: "test-hook",
      sessionId: "session-1",
    });

    recordDelivery(created.id, '{"first":"ok"}', "success", 200);
    recordDelivery(created.id, '{"second":"fail"}', "failed", 500, "Server error");
    recordDelivery(created.id, '{"third":"ok"}', "success", 200);

    const failed = getLastFailedDelivery(created.id);
    expect(failed).toBeDefined();
    expect(failed!.payload).toBe('{"second":"fail"}');
    expect(failed!.status).toBe("failed");
    expect(failed!.responseCode).toBe(500);
    expect(failed!.error).toBe("Server error");
  });

  it("should return null if no failed deliveries", () => {
    const created = createWebhook({
      name: "test-hook",
      sessionId: "session-1",
    });

    recordDelivery(created.id, '{"key":"val"}', "success", 200);

    const failed = getLastFailedDelivery(created.id);
    expect(failed).toBeNull();
  });

  it("should return error for non-existent webhook in replay tool", async () => {
    const tool = webhookTools.find((t) => t.name === "replay_webhook")!;
    const result = await tool.execute({ webhook_id: 99999 });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("not found");
  });

  it("should return error for missing webhook_id parameter", async () => {
    const tool = webhookTools.find((t) => t.name === "replay_webhook")!;
    const result = await tool.execute({});
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("webhook_id");
  });

  it("should reject non-numeric webhook_id", async () => {
    const tool = webhookTools.find((t) => t.name === "replay_webhook")!;
    const result = await tool.execute({ webhook_id: "not-a-number" });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("webhook_id");
  });

  it("should return error when no failed deliveries exist", async () => {
    const created = createWebhook({
      name: "test-hook",
      sessionId: "session-1",
    });

    const tool = webhookTools.find((t) => t.name === "replay_webhook")!;
    const result = await tool.execute({ webhook_id: created.id });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("No failed deliveries");
  });

  it("should have a description for replay tool", () => {
    const tool = webhookTools.find((t) => t.name === "replay_webhook")!;
    expect(tool.description).toBeTruthy();
    expect(tool.description.length).toBeGreaterThan(10);
  });
});
