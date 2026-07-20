import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChannelRouter } from "../../channels/router.ts";
import { MockChannel } from "../utils/mock-channel.ts";
import { db } from "../../db.ts";
import * as session from "../../session.ts";

vi.mock("../../db.ts", () => ({
  db: {
    prepare: vi.fn(() => ({
      run: vi.fn(),
      all: vi.fn(() => []),
      get: vi.fn(),
    })),
  },
}));

vi.mock("../../session.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../session.ts")>();
  return {
    ...actual,
    getSessionSettings: vi.fn(() => ({})),
    updateSessionSetting: vi.fn(),
  };
});

// Mock modules that router imports
vi.mock("../../memory/pruning.ts", () => ({
  pruneContext: vi.fn(),
  getPruningStatus: vi.fn(() => ({ isNearLimit: false, messageCount: 0 })),
  formatPruningResult: vi.fn(),
  isContextNearLimit: vi.fn(),
}));

vi.mock("../../heartbeat/index.ts", () => ({
  getHeartbeatStatus: vi.fn(() => ({ enabled: false })),
  setHeartbeatEnabled: vi.fn(() => ({ success: true, affected: 1 })),
  heartbeatTools: [],
}));

vi.mock("../../recommendations/index.ts", () => ({
  getRecommendationsStatus: vi.fn(() => ({ enabled: false })),
  setRecommendationsEnabled: vi.fn(),
}));

vi.mock("../../recap/index.ts", () => ({
  ensureEveningRecapTask: vi.fn(),
  buildEveningRecap: vi.fn(),
}));

vi.mock("../../memory/graph.ts", () => ({
  queryGraph: vi.fn(),
  formatGraphAsMermaid: vi.fn(),
}));

vi.mock("../../plugins/registry.ts", () => ({
  pluginRegistry: {
    listPlugins: vi.fn(() => []),
  },
}));

describe("ChannelRouter", () => {
  let router: ChannelRouter;
  let mockChannel1: MockChannel;
  let mockChannel2: MockChannel;

  beforeEach(() => {
    vi.clearAllMocks();
    router = new ChannelRouter();
    mockChannel1 = new MockChannel("mock1");
    mockChannel2 = new MockChannel("mock2");
  });

  describe("Lifecycle", () => {
    it("should register channels", async () => {
      router.register(mockChannel1);
      router.register(mockChannel2);
      
      await router.startAll();
      const statuses = router.getChannelStatuses();
      expect(statuses).toHaveLength(2);
      expect(statuses.map(s => s.id)).toEqual(expect.arrayContaining(["mock1", "mock2"]));
    });

    it("should prevent duplicate channel registration", () => {
      router.register(mockChannel1);
      expect(() => router.register(mockChannel1)).toThrow(/already registered/);
    });

    it("should start all channels", async () => {
      router.register(mockChannel1);
      const statuses = await router.startAll();
      
      expect(mockChannel1.isStarted).toBe(true);
      expect(statuses[0]?.started).toBe(true);
      expect(router.isChannelAvailable("mock1")).toBe(true);
    });

    it("should stop all channels", async () => {
      router.register(mockChannel1);
      await router.startAll();
      await router.stopAll();
      
      expect(mockChannel1.isStarted).toBe(false);
    });
  });

  describe("Command Routing", () => {
    beforeEach(async () => {
      router.register(mockChannel1);
      await router.startAll();
    });

    it("should handle /reset command", async () => {
      await mockChannel1.simulateIncomingMessage({
        chatId: "chat123",
        text: "/reset",
      });

      expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM memory"));
      expect(mockChannel1.messagesSent[0]?.text).toContain("history cleared");
    });

    it("should handle /model command", async () => {
      await mockChannel1.simulateIncomingMessage({
        chatId: "chat123",
        text: "/model openai gpt-4",
      });

      expect(session.updateSessionSetting).toHaveBeenCalledWith("mock1:chat123", "provider", "openai");
      expect(session.updateSessionSetting).toHaveBeenCalledWith("mock1:chat123", "model", "gpt-4");
      expect(mockChannel1.messagesSent[0]?.text).toContain("Model switched!");
    });
    
    it("should handle /plugins command when no plugins are loaded", async () => {
      await mockChannel1.simulateIncomingMessage({
        chatId: "chat123",
        text: "/plugins",
      });

      expect(mockChannel1.messagesSent[0]?.text).toContain("No plugins currently loaded");
    });
  });
});
