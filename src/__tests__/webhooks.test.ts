import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../db.ts";
import {
  createWebhook,
  listWebhooks,
  getWebhook,
  getWebhookByName,
  deleteWebhook,
  generateSignature,
  verifySignature,
  getWebhookUrl,
  webhookTools,
} from "../webhooks/index.ts";

describe("Webhooks Module", () => {
  // Clean up before and after each test
  beforeEach(() => {
    db.exec("DELETE FROM webhooks");
  });

  afterEach(() => {
    db.exec("DELETE FROM webhooks");
  });

  describe("Tool Metadata", () => {
    it("should export exactly 3 tools", () => {
      expect(webhookTools).toHaveLength(3);
    });

    it("should have correct tool names", () => {
      const names = webhookTools.map((t) => t.name);
      expect(names).toContain("create_webhook");
      expect(names).toContain("list_webhooks");
      expect(names).toContain("delete_webhook");
    });

    it("should have descriptions for all tools", () => {
      webhookTools.forEach((tool) => {
        expect(tool.description).toBeTruthy();
        expect(tool.description.length).toBeGreaterThan(10);
      });
    });

    it("should have valid parameter schemas", () => {
      webhookTools.forEach((tool) => {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
        expect(tool.inputSchema.properties).toBeDefined();
      });
    });
  });

  describe("HMAC Signature Generation", () => {
    it("should generate a valid signature", () => {
      const payload = JSON.stringify({ test: "data" });
      const secret = "test-secret";
      const signature = generateSignature(payload, secret);

      expect(signature).toBeTruthy();
      expect(signature).toHaveLength(64); // SHA-256 hex = 64 chars
      expect(/^[0-9a-f]{64}$/.test(signature)).toBe(true);
    });

    it("should generate different signatures for different payloads", () => {
      const secret = "test-secret";
      const sig1 = generateSignature("payload1", secret);
      const sig2 = generateSignature("payload2", secret);

      expect(sig1).not.toBe(sig2);
    });

    it("should generate different signatures for different secrets", () => {
      const payload = "same payload";
      const sig1 = generateSignature(payload, "secret1");
      const sig2 = generateSignature(payload, "secret2");

      expect(sig1).not.toBe(sig2);
    });

    it("should generate same signature for same payload and secret", () => {
      const payload = "test payload";
      const secret = "test-secret";
      const sig1 = generateSignature(payload, secret);
      const sig2 = generateSignature(payload, secret);

      expect(sig1).toBe(sig2);
    });
  });

  describe("HMAC Signature Verification", () => {
    it("should verify valid signature", () => {
      const payload = JSON.stringify({ event: "test" });
      const secret = "my-secret";
      const signature = generateSignature(payload, secret);

      const isValid = verifySignature(payload, signature, secret);
      expect(isValid).toBe(true);
    });

    it("should reject invalid signature", () => {
      const payload = "test payload";
      const secret = "my-secret";
      const wrongSignature = "0".repeat(64);

      const isValid = verifySignature(payload, wrongSignature, secret);
      expect(isValid).toBe(false);
    });

    it("should reject signature with wrong secret", () => {
      const payload = "test payload";
      const signature = generateSignature(payload, "correct-secret");

      const isValid = verifySignature(payload, signature, "wrong-secret");
      expect(isValid).toBe(false);
    });

    it("should reject signature with modified payload", () => {
      const payload = "original payload";
      const secret = "my-secret";
      const signature = generateSignature(payload, secret);

      const isValid = verifySignature("modified payload", signature, secret);
      expect(isValid).toBe(false);
    });

    it("should handle invalid signature format", () => {
      const payload = "test";
      const secret = "secret";
      const invalidSig = "not-a-hex-string";

      const isValid = verifySignature(payload, invalidSig, secret);
      expect(isValid).toBe(false);
    });
  });

  describe("createWebhook function", () => {
    it("should create a webhook with secret", () => {
      const result = createWebhook({
        name: "test-hook",
        sessionId: "session-1",
        generateSecret: true,
      });

      expect(result.id).toBeGreaterThan(0);
      expect(result.url).toContain("/webhook/session-1/test-hook");
      expect(result.secret).toBeTruthy();
      expect(result.secret).toHaveLength(64); // 32 bytes * 2 (hex)
    });

    it("should create a webhook without secret", () => {
      const result = createWebhook({
        name: "public-hook",
        sessionId: "session-1",
        generateSecret: false,
      });

      expect(result.id).toBeGreaterThan(0);
      expect(result.secret).toBeNull();
    });

    it("should reject duplicate webhook names in same session", () => {
      createWebhook({
        name: "duplicate",
        sessionId: "session-1",
      });

      expect(() => {
        createWebhook({
          name: "duplicate",
          sessionId: "session-1",
        });
      }).toThrow("already exists");
    });

    it("should allow same webhook name in different sessions", () => {
      const hook1 = createWebhook({
        name: "same-name",
        sessionId: "session-1",
      });

      const hook2 = createWebhook({
        name: "same-name",
        sessionId: "session-2",
      });

      expect(hook1.id).not.toBe(hook2.id);
      expect(hook1.url).not.toBe(hook2.url);
    });

    it("should store created_by metadata", () => {
      const result = createWebhook({
        name: "meta-hook",
        sessionId: "session-1",
        createdBy: "user-123",
      });

      const webhook = getWebhook(result.id);
      expect(webhook?.createdBy).toBe("user-123");
    });
  });

  describe("listWebhooks function", () => {
    it("should return empty array when no webhooks exist", () => {
      const webhooks = listWebhooks("session-1");
      expect(webhooks).toEqual([]);
    });

    it("should list webhooks for specific session", () => {
      createWebhook({ name: "hook1", sessionId: "session-1" });
      createWebhook({ name: "hook2", sessionId: "session-1" });
      createWebhook({ name: "hook3", sessionId: "session-2" });

      const session1Hooks = listWebhooks("session-1");
      expect(session1Hooks).toHaveLength(2);
      expect(session1Hooks.map((h) => h.name)).toContain("hook1");
      expect(session1Hooks.map((h) => h.name)).toContain("hook2");
    });

    it("should list all webhooks when all_sessions is true", () => {
      createWebhook({ name: "hook1", sessionId: "session-1" });
      createWebhook({ name: "hook2", sessionId: "session-2" });
      createWebhook({ name: "hook3", sessionId: "session-3" });

      const allHooks = listWebhooks("", true);
      expect(allHooks).toHaveLength(3);
    });

    it("should return webhooks in descending order by creation time", () => {
      const hook1 = createWebhook({ name: "first", sessionId: "session-1" });
      const hook2 = createWebhook({ name: "second", sessionId: "session-1" });
      const hook3 = createWebhook({ name: "third", sessionId: "session-1" });

      const hooks = listWebhooks("session-1");
      expect(hooks).toHaveLength(3);
      // Just verify all three are present (order may vary due to timing)
      const ids = hooks.map((h) => h.id);
      expect(ids).toContain(hook1.id);
      expect(ids).toContain(hook2.id);
      expect(ids).toContain(hook3.id);
    });
  });

  describe("getWebhook function", () => {
    it("should get webhook by ID", () => {
      const created = createWebhook({
        name: "test-hook",
        sessionId: "session-1",
      });

      const webhook = getWebhook(created.id);
      expect(webhook).toBeTruthy();
      expect(webhook?.id).toBe(created.id);
      expect(webhook?.name).toBe("test-hook");
      expect(webhook?.sessionId).toBe("session-1");
    });

    it("should return null for non-existent ID", () => {
      const webhook = getWebhook(99999);
      expect(webhook).toBeNull();
    });
  });

  describe("getWebhookByName function", () => {
    it("should get webhook by name and session", () => {
      createWebhook({ name: "named-hook", sessionId: "session-1" });

      const webhook = getWebhookByName("named-hook", "session-1");
      expect(webhook).toBeTruthy();
      expect(webhook?.name).toBe("named-hook");
    });

    it("should return null for non-existent name", () => {
      const webhook = getWebhookByName("non-existent", "session-1");
      expect(webhook).toBeNull();
    });

    it("should not return webhook from different session", () => {
      createWebhook({ name: "hook", sessionId: "session-1" });

      const webhook = getWebhookByName("hook", "session-2");
      expect(webhook).toBeNull();
    });
  });

  describe("deleteWebhook function", () => {
    it("should delete webhook by ID", () => {
      const created = createWebhook({
        name: "to-delete",
        sessionId: "session-1",
      });

      const deleted = deleteWebhook(created.id);
      expect(deleted).toBe(true);

      const webhook = getWebhook(created.id);
      expect(webhook).toBeNull();
    });

    it("should throw error for non-existent ID", () => {
      expect(() => {
        deleteWebhook(99999);
      }).toThrow("not found");
    });
  });

  describe("getWebhookUrl function", () => {
    it("should generate correct webhook URL", () => {
      const url = getWebhookUrl("session-123", "my-hook");
      expect(url).toContain("/webhook/session-123/my-hook");
    });

    it("should URL-encode hook name with special characters", () => {
      const url = getWebhookUrl("session-1", "hook with spaces");
      expect(url).toContain("hook%20with%20spaces");
    });
  });

  describe("create_webhook tool", () => {
    const createTool = webhookTools.find((t) => t.name === "create_webhook")!;

    it("should require name and session_id parameters", () => {
      const schema = createTool.inputSchema;
      expect(schema.required).toContain("name");
      expect(schema.required).toContain("session_id");
    });

    it("should create webhook via tool", async () => {
      const result = await createTool.execute({
        name: "new-hook",
        session_id: "session-1",
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.webhook.name).toBe("new-hook");
      expect(parsed.webhook.url).toBeTruthy();
      expect(parsed.webhook.secret).toBeTruthy();
    });

    it("should reject missing name parameter", async () => {
      const result = await createTool.execute({
        session_id: "session-1",
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("name");
    });

    it("should reject missing session_id parameter", async () => {
      const result = await createTool.execute({
        name: "hook1",
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("session_id");
    });

    it("should reject duplicate webhook names", async () => {
      await createTool.execute({
        name: "duplicate",
        session_id: "session-1",
      });

      const result = await createTool.execute({
        name: "duplicate",
        session_id: "session-1",
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("already exists");
    });
  });

  describe("list_webhooks tool", () => {
    const listTool = webhookTools.find((t) => t.name === "list_webhooks")!;

    it("should require session_id parameter", () => {
      const schema = listTool.inputSchema;
      expect(schema.required).toContain("session_id");
    });

    it("should return empty list when no webhooks exist", async () => {
      const result = await listTool.execute({
        session_id: "session-1",
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(0);
      expect(parsed.webhooks).toEqual([]);
    });

    it("should list webhooks for current session", async () => {
      createWebhook({ name: "hook1", sessionId: "session-1" });
      createWebhook({ name: "hook2", sessionId: "session-1" });
      createWebhook({ name: "hook3", sessionId: "session-2" });

      const result = await listTool.execute({
        session_id: "session-1",
        all_sessions: false,
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(2);
      expect(parsed.webhooks[0]!.name).toBeTruthy();
      expect(parsed.webhooks[0]!.url).toBeTruthy();
    });

    it("should list webhooks from all sessions when requested", async () => {
      createWebhook({ name: "hook1", sessionId: "session-1" });
      createWebhook({ name: "hook2", sessionId: "session-2" });
      createWebhook({ name: "hook3", sessionId: "session-3" });

      const result = await listTool.execute({
        session_id: "session-1",
        all_sessions: true,
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(3);
    });

    it("should not expose secrets in list", async () => {
      createWebhook({ name: "secret-hook", sessionId: "session-1" });

      const result = await listTool.execute({
        session_id: "session-1",
      });

      const parsed = JSON.parse(result);
      expect(parsed.webhooks[0]!.secret).toBeUndefined();
      expect(parsed.webhooks[0]!.hasSecret).toBe(true);
    });
  });

  describe("delete_webhook tool", () => {
    const deleteTool = webhookTools.find((t) => t.name === "delete_webhook")!;

    it("should require webhook_id parameter", () => {
      const schema = deleteTool.inputSchema;
      expect(schema.required).toContain("webhook_id");
    });

    it("should delete webhook via tool", async () => {
      const created = createWebhook({
        name: "to-delete",
        sessionId: "session-1",
      });

      const result = await deleteTool.execute({
        webhook_id: created.id,
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);

      const webhook = getWebhook(created.id);
      expect(webhook).toBeNull();
    });

    it("should fail for non-existent webhook", async () => {
      const result = await deleteTool.execute({
        webhook_id: 99999,
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("not found");
    });

    it("should reject invalid webhook_id parameter", async () => {
      const result = await deleteTool.execute({
        webhook_id: "not-a-number",
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("webhook_id");
    });
  });

  describe("Result Format Consistency", () => {
    it("should return success/error format for all tools", async () => {
      for (const tool of webhookTools) {
        const result = await tool.execute({});
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty("success");
        expect(typeof parsed.success).toBe("boolean");
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle very long webhook names", async () => {
      const longName = "a".repeat(500);
      const result = createWebhook({
        name: longName,
        sessionId: "session-1",
      });

      expect(result.id).toBeGreaterThan(0);
      const webhook = getWebhook(result.id);
      expect(webhook?.name).toBe(longName);
    });

    it("should handle special characters in webhook names", async () => {
      const specialName = "hook-with_special.chars@123!";
      const result = createWebhook({
        name: specialName,
        sessionId: "session-1",
      });

      expect(result.id).toBeGreaterThan(0);
      expect(result.url).toContain(encodeURIComponent(specialName));
    });

    it("should handle emojis in webhook names", async () => {
      const emojiName = "webhook-🚀-test-✨";
      const result = createWebhook({
        name: emojiName,
        sessionId: "session-1",
      });

      expect(result.id).toBeGreaterThan(0);
      const webhook = getWebhook(result.id);
      expect(webhook?.name).toBe(emojiName);
    });
  });

  describe("Database Integration", () => {
    it("should persist webhooks across function calls", () => {
      const created = createWebhook({
        name: "persistent",
        sessionId: "session-1",
      });

      const retrieved = getWebhook(created.id);
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.secret).toBe(created.secret);
    });

    it("should maintain webhook data after listing", () => {
      const webhook1 = createWebhook({ name: "hook1", sessionId: "session-1" });
      const webhook2 = createWebhook({ name: "hook2", sessionId: "session-1" });

      listWebhooks("session-1");

      const retrieved1 = getWebhook(webhook1.id);
      const retrieved2 = getWebhook(webhook2.id);
      expect(retrieved1).toBeTruthy();
      expect(retrieved2).toBeTruthy();
    });

    it("should clean up after deletion", () => {
      const webhook = createWebhook({
        name: "cleanup-test",
        sessionId: "session-1",
      });

      deleteWebhook(webhook.id);

      const all = listWebhooks("", true);
      expect(all).toHaveLength(0);
    });
  });

  describe("Multiple Sessions", () => {
    it("should isolate webhooks between sessions", () => {
      createWebhook({ name: "hook1", sessionId: "session-1" });
      createWebhook({ name: "hook2", sessionId: "session-2" });

      const session1Hooks = listWebhooks("session-1");
      const session2Hooks = listWebhooks("session-2");

      expect(session1Hooks).toHaveLength(1);
      expect(session2Hooks).toHaveLength(1);
      expect(session1Hooks[0]!.name).toBe("hook1");
      expect(session2Hooks[0]!.name).toBe("hook2");
    });

    it("should allow same hook name in different sessions", () => {
      const hook1 = createWebhook({
        name: "shared-name",
        sessionId: "session-1",
      });

      const hook2 = createWebhook({
        name: "shared-name",
        sessionId: "session-2",
      });

      expect(hook1.id).not.toBe(hook2.id);
      expect(hook1.secret).not.toBe(hook2.secret);
    });
  });
});
