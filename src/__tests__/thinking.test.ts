import { describe, it, expect } from "vitest";
import {
  getThinkingConfig,
  applyThinkingToSystemPrompt,
  applyThinkingToMessage,
  isValidThinkingLevel,
  getAvailableThinkingLevels,
  formatThinkingLevelsForDisplay,
  type ThinkingLevel,
} from "../thinking.ts";

describe("Thinking Levels", () => {
  const BASE_SYSTEM_PROMPT = "You are a helpful AI assistant.";
  const TEST_MESSAGE = "What is 2+2?";

  describe("getThinkingConfig", () => {
    it("should return config for 'off' level", () => {
      const config = getThinkingConfig("off");
      expect(config.name).toBe("Off");
      expect(config.systemPromptAddition).toBe("");
    });

    it("should return config for 'low' level", () => {
      const config = getThinkingConfig("low");
      expect(config.name).toBe("Low");
      expect(config.systemPromptAddition).toContain("reasoning steps");
    });

    it("should return config for 'medium' level", () => {
      const config = getThinkingConfig("medium");
      expect(config.name).toBe("Medium");
      expect(config.systemPromptAddition).toContain("step-by-step");
    });

    it("should return config for 'high' level", () => {
      const config = getThinkingConfig("high");
      expect(config.name).toBe("High");
      expect(config.systemPromptAddition).toContain("<thinking>");
    });
  });

  describe("applyThinkingToSystemPrompt", () => {
    it("should not modify prompt for 'off' level", () => {
      const result = applyThinkingToSystemPrompt(BASE_SYSTEM_PROMPT, "off");
      expect(result).toBe(BASE_SYSTEM_PROMPT);
    });

    it("should add reasoning instructions for 'low' level", () => {
      const result = applyThinkingToSystemPrompt(BASE_SYSTEM_PROMPT, "low");
      expect(result).toContain(BASE_SYSTEM_PROMPT);
      expect(result).toContain("reasoning steps");
      expect(result.length).toBeGreaterThan(BASE_SYSTEM_PROMPT.length);
    });

    it("should add step-by-step instructions for 'medium' level", () => {
      const result = applyThinkingToSystemPrompt(BASE_SYSTEM_PROMPT, "medium");
      expect(result).toContain(BASE_SYSTEM_PROMPT);
      expect(result).toContain("step-by-step");
      expect(result).toContain("REASONING APPROACH");
    });

    it("should add chain-of-thought instructions for 'high' level", () => {
      const result = applyThinkingToSystemPrompt(BASE_SYSTEM_PROMPT, "high");
      expect(result).toContain(BASE_SYSTEM_PROMPT);
      expect(result).toContain("<thinking>");
      expect(result).toContain("EXTENDED REASONING MODE");
    });
  });

  describe("applyThinkingToMessage", () => {
    it("should not modify message for 'off' level", () => {
      const result = applyThinkingToMessage(TEST_MESSAGE, "off");
      expect(result).toBe(TEST_MESSAGE);
    });

    it("should not modify message for 'low' level", () => {
      const result = applyThinkingToMessage(TEST_MESSAGE, "low");
      expect(result).toBe(TEST_MESSAGE);
    });

    it("should prepend thinking prompt for 'medium' level", () => {
      const result = applyThinkingToMessage(TEST_MESSAGE, "medium");
      expect(result).toContain(TEST_MESSAGE);
      expect(result).toContain("Think step-by-step");
      expect(result.length).toBeGreaterThan(TEST_MESSAGE.length);
    });

    it("should prepend extended thinking prompt for 'high' level", () => {
      const result = applyThinkingToMessage(TEST_MESSAGE, "high");
      expect(result).toContain(TEST_MESSAGE);
      expect(result).toContain("chain-of-thought");
      expect(result).toContain("<thinking>");
    });
  });

  describe("isValidThinkingLevel", () => {
    it("should return true for valid levels", () => {
      expect(isValidThinkingLevel("off")).toBe(true);
      expect(isValidThinkingLevel("low")).toBe(true);
      expect(isValidThinkingLevel("medium")).toBe(true);
      expect(isValidThinkingLevel("high")).toBe(true);
    });

    it("should return false for invalid levels", () => {
      expect(isValidThinkingLevel("invalid")).toBe(false);
      expect(isValidThinkingLevel("extreme")).toBe(false);
      expect(isValidThinkingLevel("")).toBe(false);
      expect(isValidThinkingLevel("Off")).toBe(false); // Case sensitive
    });
  });

  describe("getAvailableThinkingLevels", () => {
    it("should return all 4 thinking levels", () => {
      const levels = getAvailableThinkingLevels();
      expect(levels.length).toBe(4);
    });

    it("should include level, name, and description for each", () => {
      const levels = getAvailableThinkingLevels();
      for (const level of levels) {
        expect(level.level).toBeTruthy();
        expect(level.name).toBeTruthy();
        expect(level.description).toBeTruthy();
      }
    });

    it("should include expected level names", () => {
      const levels = getAvailableThinkingLevels();
      const levelValues = levels.map(l => l.level);
      expect(levelValues).toContain("off");
      expect(levelValues).toContain("low");
      expect(levelValues).toContain("medium");
      expect(levelValues).toContain("high");
    });
  });

  describe("formatThinkingLevelsForDisplay", () => {
    it("should return formatted string", () => {
      const display = formatThinkingLevelsForDisplay();
      expect(display).toContain("Available Thinking Levels");
      expect(display).toContain("off");
      expect(display).toContain("low");
      expect(display).toContain("medium");
      expect(display).toContain("high");
    });

    it("should include usage instructions", () => {
      const display = formatThinkingLevelsForDisplay();
      expect(display).toContain("/think");
      expect(display).toContain("Example");
    });
  });

  describe("Thinking Level Integration", () => {
    it("should progressively enhance prompts from off to high", () => {
      const offPrompt = applyThinkingToSystemPrompt(BASE_SYSTEM_PROMPT, "off");
      const lowPrompt = applyThinkingToSystemPrompt(BASE_SYSTEM_PROMPT, "low");
      const mediumPrompt = applyThinkingToSystemPrompt(BASE_SYSTEM_PROMPT, "medium");
      const highPrompt = applyThinkingToSystemPrompt(BASE_SYSTEM_PROMPT, "high");

      // Each level should be progressively longer
      expect(offPrompt.length).toBeLessThan(lowPrompt.length);
      expect(lowPrompt.length).toBeLessThan(mediumPrompt.length);
      expect(mediumPrompt.length).toBeLessThan(highPrompt.length);
    });

    it("should preserve original content when transforming", () => {
      const levels: ThinkingLevel[] = ["off", "low", "medium", "high"];
      
      for (const level of levels) {
        const transformedPrompt = applyThinkingToSystemPrompt(BASE_SYSTEM_PROMPT, level);
        const transformedMessage = applyThinkingToMessage(TEST_MESSAGE, level);
        
        // Original prompt should be present
        expect(transformedPrompt).toContain(BASE_SYSTEM_PROMPT);
        
        // Original message should be present (except for off/low which don't modify it)
        expect(transformedMessage).toContain(TEST_MESSAGE);
      }
    });
  });

  describe("Message Transformation Behavior", () => {
    it("should only transform messages for medium and high levels", () => {
      const offMsg = applyThinkingToMessage(TEST_MESSAGE, "off");
      const lowMsg = applyThinkingToMessage(TEST_MESSAGE, "low");
      const mediumMsg = applyThinkingToMessage(TEST_MESSAGE, "medium");
      const highMsg = applyThinkingToMessage(TEST_MESSAGE, "high");

      // Off and low should not transform
      expect(offMsg).toBe(TEST_MESSAGE);
      expect(lowMsg).toBe(TEST_MESSAGE);

      // Medium and high should transform
      expect(mediumMsg).not.toBe(TEST_MESSAGE);
      expect(highMsg).not.toBe(TEST_MESSAGE);
    });

    it("should handle empty messages gracefully", () => {
      const emptyMessage = "";
      const levels: ThinkingLevel[] = ["off", "low", "medium", "high"];

      for (const level of levels) {
        const result = applyThinkingToMessage(emptyMessage, level);
        expect(result).toBeDefined();
        expect(typeof result).toBe("string");
      }
    });

    it("should handle long messages", () => {
      const longMessage = "A".repeat(10000);
      const levels: ThinkingLevel[] = ["off", "low", "medium", "high"];

      for (const level of levels) {
        const result = applyThinkingToMessage(longMessage, level);
        expect(result).toContain(longMessage);
      }
    });
  });
});
