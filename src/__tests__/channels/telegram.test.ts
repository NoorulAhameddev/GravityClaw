import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TelegramChannel } from "../../channels/telegram.ts";
import { config } from "../../config.ts";
import type { UnifiedMessage } from "../../types/channels.js";
import { db } from "../../db.ts";

// Mock config
vi.mock("../../config.ts", () => ({
  config: {
    TELEGRAM_BOT_TOKEN: "test-token",
    TELEGRAM_ALLOWED_USER_ID: 123456,
  },
}));

// Mock grammy
const mockSendMessage = vi.fn();
const mockSendVoice = vi.fn();
const mockSendChatAction = vi.fn();
const mockStart = vi.fn();
const mockStop = vi.fn();
const mockUse = vi.fn();
const mockCommand = vi.fn();
const mockOn = vi.fn();
const mockCatch = vi.fn();

vi.mock("grammy", () => {
  return {
    Bot: class {
      api = {
        sendMessage: mockSendMessage,
        sendVoice: mockSendVoice,
        sendChatAction: mockSendChatAction,
      };
      start = mockStart;
      stop = mockStop;
      use = mockUse;
      command = mockCommand;
      on = mockOn;
      catch = mockCatch;
    },
  };
});

// Mock database interactions to avoid sqlite initialization issues in tests
vi.mock("../../db.ts", () => ({
  db: {
    prepare: vi.fn(() => ({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(),
    })),
  },
}));

vi.mock("../../groups/index.ts", () => ({
  getGroupSessionId: vi.fn((_, chatId) => `group-session-${chatId}`),
  getGroupSettings: vi.fn(() => ({ voiceMode: "off", thinkingLevel: "off", ttsProvider: "openai", disabledTools: [] })),
  updateGroupSettings: vi.fn(),
  isGroupAdmin: vi.fn(() => false),
  addGroupAdmin: vi.fn(),
  getGroupAdmins: vi.fn(() => []),
  isBotMentioned: vi.fn((text, botName) => text.includes(`@${botName}`)),
  removeBotMention: vi.fn((text) => text.replace(/@\w+/g, "").trim()),
}));

describe("TelegramChannel", () => {
  let channel: TelegramChannel;

  beforeEach(() => {
    vi.clearAllMocks();
    channel = new TelegramChannel();
  });

  describe("Lifecycle", () => {
    it("should start the bot", async () => {
      mockStart.mockResolvedValueOnce(undefined);
      const onMessage = vi.fn();
      
      await channel.start(onMessage);
      
      expect(mockStart).toHaveBeenCalled();
      expect(mockUse).toHaveBeenCalled();
      expect(mockCommand).toHaveBeenCalledWith("start", expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith("message:text", expect.any(Function));
    });

    it("should stop the bot", async () => {
      mockStop.mockResolvedValueOnce(undefined);
      await channel.stop();
      expect(mockStop).toHaveBeenCalled();
    });
  });

  describe("sendMessage", () => {
    it("should try to send HTML format first", async () => {
      mockSendMessage.mockResolvedValueOnce(undefined);
      
      await channel.sendMessage("chat123", "Hello **world**");
      
      expect(mockSendMessage).toHaveBeenCalledWith(
        "chat123",
        expect.stringContaining("Hello <b>world</b>"),
        { parse_mode: "HTML" }
      );
    });

    it("should fallback to MarkdownV2 if HTML fails", async () => {
      mockSendMessage
        .mockRejectedValueOnce(new Error("HTML parse error"))
        .mockResolvedValueOnce(undefined);
      
      await channel.sendMessage("chat123", "Hello *world*");
      
      expect(mockSendMessage).toHaveBeenCalledTimes(2);
      expect(mockSendMessage).toHaveBeenNthCalledWith(
        2,
        "chat123",
        expect.any(String),
        { parse_mode: "MarkdownV2" }
      );
    });

    it("should chunk long messages", async () => {
      mockSendMessage.mockResolvedValue(undefined);
      
      // Create a message > 4000 chars
      const longText = "A".repeat(5000);
      await channel.sendMessage("chat123", longText);
      
      // Should split into at least 2 chunks
      expect(mockSendMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe("sendTyping", () => {
    it("should send typing chat action", async () => {
      mockSendChatAction.mockResolvedValueOnce(undefined);
      await channel.sendTyping("chat123");
      expect(mockSendChatAction).toHaveBeenCalledWith("chat123", "typing");
    });
  });
});
