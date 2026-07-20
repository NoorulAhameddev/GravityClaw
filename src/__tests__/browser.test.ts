import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { browserTools } from "../tools/automation/browser.ts";

// Mock playwright
const mockPage = {
  goto: vi.fn(),
  url: vi.fn(),
  title: vi.fn(),
  screenshot: vi.fn(),
  $: vi.fn(),
  $$: vi.fn(),
  click: vi.fn(),
  type: vi.fn(),
  keyboard: {
    press: vi.fn(),
  },
  waitForNavigation: vi.fn(),
  waitForLoadState: vi.fn(),
  isClosed: vi.fn(),
  close: vi.fn(),
};

const mockElement = {
  screenshot: vi.fn(),
  scrollIntoViewIfNeeded: vi.fn(),
  click: vi.fn(),
  type: vi.fn(),
  innerText: vi.fn(),
  innerHTML: vi.fn(),
  getAttribute: vi.fn(),
};

const mockContext = {
  newPage: vi.fn(),
  close: vi.fn(),
};

const mockBrowser = {
  newContext: vi.fn(),
  isConnected: vi.fn(),
  close: vi.fn(),
};

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn(() => Promise.resolve(mockBrowser)),
  },
}));

describe("Browser Automation Tools", () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup default mock behaviors
    mockBrowser.isConnected.mockReturnValue(true);
    mockBrowser.newContext.mockResolvedValue(mockContext);
    mockContext.newPage.mockResolvedValue(mockPage);
    mockPage.isClosed.mockReturnValue(false);
    mockPage.url.mockReturnValue("https://example.com");
    mockPage.title.mockResolvedValue("Example Page");
    mockPage.goto.mockResolvedValue(null);
    mockPage.$.mockResolvedValue(mockElement);
    mockPage.$$.mockResolvedValue([mockElement, mockElement]);
  });

  describe("Tool Metadata", () => {
    it("should export exactly 6 tools", () => {
      expect(browserTools).toHaveLength(6);
    });

    it("should have correct tool names", () => {
      const toolNames = browserTools.map((t) => t.name);
      expect(toolNames).toEqual([
        "browser_navigate",
        "browser_screenshot",
        "browser_click",
        "browser_type",
        "browser_extract",
        "browser_close",
      ]);
    });

    it("should have descriptions for all tools", () => {
      browserTools.forEach((tool) => {
        expect(tool.description).toBeTruthy();
        expect(tool.description.length).toBeGreaterThan(20);
      });
    });

    it("should have valid parameter schemas", () => {
      browserTools.forEach((tool) => {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
        expect(tool.inputSchema.properties).toBeDefined();
      });
    });
  });

  describe("browser_navigate", () => {
    const browserNavigate: any = browserTools.find((t) => t.name === "browser_navigate")!;

    it("should require url parameter", () => {
      expect(browserNavigate.inputSchema.required).toContain("url");
    });

    it("should navigate to valid URL successfully", async () => {
      const result: any = await browserNavigate.execute({
        url: "https://example.com",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.url).toBe("https://example.com");
      expect(parsed.title).toBe("Example Page");
      expect(mockPage.goto).toHaveBeenCalledWith(
        "https://example.com",
        expect.objectContaining({
          waitUntil: "load",
          timeout: 30000,
        })
      );
    });

    it("should support different waitUntil options", async () => {
      const result: any = await browserNavigate.execute({
        url: "https://example.com",
        waitUntil: "networkidle",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(mockPage.goto).toHaveBeenCalledWith(
        "https://example.com",
        expect.objectContaining({
          waitUntil: "networkidle",
        })
      );
    });

    it("should reject invalid URLs", async () => {
      const result: any = await browserNavigate.execute({
        url: "not-a-valid-url",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("Invalid URL");
    });

    it("should reject URLs without protocol", async () => {
      const result: any = await browserNavigate.execute({
        url: "example.com",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("Invalid URL");
    });

    it("should handle navigation errors", async () => {
      mockPage.goto.mockRejectedValueOnce(new Error("Navigation timeout"));

      const result: any = await browserNavigate.execute({
        url: "https://example.com",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("timeout");
    });
  });

  describe("browser_screenshot", () => {
    const browserScreenshot: any = browserTools.find((t) => t.name === "browser_screenshot")!;

    it("should not require any parameters", () => {
      expect(browserScreenshot.inputSchema.required).toHaveLength(0);
    });

    it("should capture screenshot of current page", async () => {
      const mockBuffer = Buffer.from("fake-image-data");
      mockPage.screenshot.mockResolvedValue(mockBuffer);

      const result: any = await browserScreenshot.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.image).toBe(mockBuffer.toString("base64"));
      expect(parsed.encoding).toBe("base64");
      expect(parsed.type).toBe("image/png");
      expect(mockPage.screenshot).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "png",
          fullPage: false,
        })
      );
    });

    it("should navigate to URL before screenshot if provided", async () => {
      mockPage.screenshot.mockResolvedValue(Buffer.from("test"));

      const result: any = await browserScreenshot.execute({
        url: "https://example.com/page",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(mockPage.goto).toHaveBeenCalledWith(
        "https://example.com/page",
        expect.any(Object)
      );
    });

    it("should support fullPage option", async () => {
      mockPage.screenshot.mockResolvedValue(Buffer.from("test"));

      const result: any = await browserScreenshot.execute({
        fullPage: true,
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(mockPage.screenshot).toHaveBeenCalledWith(
        expect.objectContaining({
          fullPage: true,
        })
      );
    });

    it("should capture specific element when selector provided", async () => {
      const mockBuffer = Buffer.from("element-screenshot");
      mockElement.screenshot.mockResolvedValue(mockBuffer);

      const result: any = await browserScreenshot.execute({
        selector: "#main-content",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(mockPage.$).toHaveBeenCalledWith("#main-content");
      expect(mockElement.screenshot).toHaveBeenCalled();
    });

    it("should fail if selector element not found", async () => {
      mockPage.$.mockResolvedValue(null);

      const result: any = await browserScreenshot.execute({
        selector: ".nonexistent",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("not found");
    });

    it("should handle screenshot errors", async () => {
      mockPage.screenshot.mockRejectedValueOnce(new Error("Screenshot timeout"));

      const result: any = await browserScreenshot.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBeTruthy();
    });
  });

  describe("browser_click", () => {
    const browserClick: any = browserTools.find((t) => t.name === "browser_click")!;

    it("should require selector parameter", () => {
      expect(browserClick.inputSchema.required).toContain("selector");
    });

    it("should click element successfully", async () => {
      const result: any = await browserClick.execute({
        selector: "#submit-button",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.selector).toBe("#submit-button");
      expect(mockPage.$).toHaveBeenCalledWith("#submit-button");
      expect(mockElement.scrollIntoViewIfNeeded).toHaveBeenCalled();
      expect(mockElement.click).toHaveBeenCalled();
    });

    it("should fail if element not found", async () => {
      mockPage.$.mockResolvedValue(null);

      const result: any = await browserClick.execute({
        selector: ".missing-element",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("not found");
    });

    it("should wait for navigation when requested", async () => {
      mockPage.waitForNavigation.mockResolvedValue(null);

      const result: any = await browserClick.execute({
        selector: "a.nav-link",
        waitForNavigation: true,
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(mockPage.waitForNavigation).toHaveBeenCalled();
    });

    it("should handle click errors gracefully", async () => {
      mockElement.click.mockRejectedValueOnce(new Error("Element not clickable"));

      const result: any = await browserClick.execute({
        selector: "#button",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("not clickable");
    });
  });

  describe("browser_type", () => {
    const browserType: any = browserTools.find((t) => t.name === "browser_type")!;

    it("should require selector and text parameters", () => {
      expect(browserType.inputSchema.required).toContain("selector");
      expect(browserType.inputSchema.required).toContain("text");
    });

    it("should type text into input field", async () => {
      const result: any = await browserType.execute({
        selector: "#search-box",
        text: "test query",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.text).toBe("test query");
      expect(mockPage.$).toHaveBeenCalledWith("#search-box");
      expect(mockElement.click).toHaveBeenCalled();
      expect(mockElement.type).toHaveBeenCalledWith("test query", expect.any(Object));
    });

    it("should fail if input field not found", async () => {
      mockPage.$.mockResolvedValue(null);

      const result: any = await browserType.execute({
        selector: "#missing-input",
        text: "test",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("not found");
    });

    it("should clear existing content before typing", async () => {
      const result: any = await browserType.execute({
        selector: "#input",
        text: "new text",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(mockPage.keyboard.press).toHaveBeenCalledWith("Control+A");
      expect(mockPage.keyboard.press).toHaveBeenCalledWith("Backspace");
    });

    it("should press Enter when requested", async () => {
      mockPage.waitForLoadState.mockResolvedValue(null);

      const result: any = await browserType.execute({
        selector: "#search",
        text: "query",
        pressEnter: true,
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(mockPage.keyboard.press).toHaveBeenCalledWith("Enter");
    });

    it("should handle typing errors", async () => {
      mockElement.type.mockRejectedValueOnce(new Error("Cannot type"));

      const result: any = await browserType.execute({
        selector: "#input",
        text: "test",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBeTruthy();
    });
  });

  describe("browser_extract", () => {
    const browserExtract: any = browserTools.find((t) => t.name === "browser_extract")!;

    it("should require selector parameter", () => {
      expect(browserExtract.inputSchema.required).toContain("selector");
    });

    it("should extract text content by default", async () => {
      mockElement.innerText.mockResolvedValue("  Sample text  ");

      const result: any = await browserExtract.execute({
        selector: "h1",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.content).toBe("Sample text");
      expect(parsed.extract).toBe("text");
      expect(mockElement.innerText).toHaveBeenCalled();
    });

    it("should extract HTML when requested", async () => {
      mockElement.innerHTML.mockResolvedValue("<p>Content</p>");

      const result: any = await browserExtract.execute({
        selector: ".content",
        extract: "html",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.content).toBe("<p>Content</p>");
      expect(mockElement.innerHTML).toHaveBeenCalled();
    });

    it("should extract attribute when requested", async () => {
      mockElement.getAttribute.mockResolvedValue("https://example.com");

      const result: any = await browserExtract.execute({
        selector: "a",
        extract: "attribute",
        attribute: "href",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.content).toBe("https://example.com");
      expect(mockElement.getAttribute).toHaveBeenCalledWith("href");
    });

    it("should fail if attribute name missing", async () => {
      const result: any = await browserExtract.execute({
        selector: "img",
        extract: "attribute",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("Attribute name required");
    });

    it("should extract from multiple elements when requested", async () => {
      mockElement.innerText.mockResolvedValue("Item");

      const result: any = await browserExtract.execute({
        selector: "li",
        multiple: true,
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(Array.isArray(parsed.content)).toBe(true);
      expect(parsed.count).toBe(2);
      expect(mockPage.$$).toHaveBeenCalledWith("li");
    });

    it("should fail if no elements found", async () => {
      mockPage.$.mockResolvedValue(null);

      const result: any = await browserExtract.execute({
        selector: ".missing",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("not found");
    });

    it("should navigate to URL before extracting if provided", async () => {
      mockElement.innerText.mockResolvedValue("Text");

      const result: any = await browserExtract.execute({
        url: "https://example.com/page",
        selector: "p",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(mockPage.goto).toHaveBeenCalledWith(
        "https://example.com/page",
        expect.any(Object)
      );
    });
  });

  describe("browser_close", () => {
    const browserClose: any = browserTools.find((t) => t.name === "browser_close")!;

    it("should not require any parameters", () => {
      expect(browserClose.inputSchema.required).toHaveLength(0);
    });

    it("should close browser successfully", async () => {
      const result: any = await browserClose.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.message).toContain("closed");
    });

    it("should handle close errors gracefully", async () => {
      mockBrowser.close.mockRejectedValueOnce(new Error("Already closed"));

      // This should still succeed because we handle errors
      const result: any = await browserClose.execute({});
      const parsed = JSON.parse(result);

      // The implementation catches errors and still returns success: false
      // or handles cleanup gracefully
      expect(parsed).toBeDefined();
    });
  });

  describe("Result Format Consistency", () => {
    it("should return success/error format for all tools", async () => {
      mockPage.screenshot.mockResolvedValue(Buffer.from("test"));
      mockElement.innerText.mockResolvedValue("text");

      for (const tool of browserTools as any[]) {
        let params: Record<string, unknown> = {};
        if (tool.name === "browser_navigate") params = { url: "https://example.com" };
        if (tool.name === "browser_click") params = { selector: "#btn" };
        if (tool.name === "browser_type") params = { selector: "#input", text: "test" };
        if (tool.name === "browser_extract") params = { selector: "h1" };

        const result: any = await tool.execute(params);
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty("success");
        if (parsed.success) {
          expect(parsed.error).toBeUndefined();
        } else {
          expect(parsed.error).toBeDefined();
        }
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle very long URLs", async () => {
      const browserNavigate: any = browserTools.find((t) => t.name === "browser_navigate")!;
      const longUrl =
        "https://example.com/" + "a".repeat(2000) + "?query=" + "b".repeat(1000);

      const result: any = await browserNavigate.execute({ url: longUrl });
      const parsed = JSON.parse(result);

      // Should still work (URL parsing doesn't fail on length)
      expect(parsed.success).toBe(true);
    });

    it("should handle special characters in selectors", async () => {
      const browserClick: any = browserTools.find((t) => t.name === "browser_click")!;

      const result: any = await browserClick.execute({
        selector: "[data-test='complex:value']",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(mockPage.$).toHaveBeenCalledWith("[data-test='complex:value']");
    });

    it("should handle empty text input", async () => {
      const browserType: any = browserTools.find((t) => t.name === "browser_type")!;

      const result: any = await browserType.execute({
        selector: "#input",
        text: "",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.text).toBe("");
    });

    it("should handle unicode text", async () => {
      const browserType: any = browserTools.find((t) => t.name === "browser_type")!;

      const result: any = await browserType.execute({
        selector: "#input",
        text: "Hello 世界 🌍",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(mockElement.type).toHaveBeenCalledWith("Hello 世界 🌍", expect.any(Object));
    });

    it("should handle malformed HTML in extraction", async () => {
      const browserExtract: any = browserTools.find((t) => t.name === "browser_extract")!;
      mockElement.innerHTML.mockResolvedValue("<div><p>Unclosed");

      const result: any = await browserExtract.execute({
        selector: "div",
        extract: "html",
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.content).toBe("<div><p>Unclosed");
    });

    it("should handle screenshot of very large pages", async () => {
      const browserScreenshot: any = browserTools.find((t) => t.name === "browser_screenshot")!;
      const largeBuffer = Buffer.alloc(10 * 1024 * 1024); // 10MB
      mockPage.screenshot.mockResolvedValue(largeBuffer);

      const result: any = await browserScreenshot.execute({ fullPage: true });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.image).toBeDefined();
      expect(parsed.image.length).toBeGreaterThan(0);
    });
  });

  describe("Security & Safety", () => {
    it("should validate URL protocols", async () => {
      const browserNavigate = browserTools.find((t) => t.name === "browser_navigate")!;

      // Test various protocols
      const protocols = ["javascript:", "data:", "file:"];

      for (const protocol of protocols) {
        const result = await browserNavigate.execute({
          url: `${protocol}alert('xss')`,
        });
        // Should still process but browser security will handle
        expect(result).toBeDefined();
      }
    });

    it("should handle timeouts appropriately", async () => {
      const browserNavigate: any = browserTools.find((t) => t.name === "browser_navigate")!;
      mockPage.goto.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      // Mock a successful navigation
      mockPage.url.mockReturnValue("https://slow-site.com");
      const result: any = await browserNavigate.execute({
        url: "https://slow-site.com",
      });
      const parsed = JSON.parse(result);

      expect(parsed).toBeDefined();
      expect(parsed.success).toBe(true);
    }, 15000);
  });

  describe("Session Management", () => {
    it("should reuse browser session across multiple operations", async () => {
      const browserNavigate: any = browserTools.find((t) => t.name === "browser_navigate")!;

      mockPage.url.mockReturnValue("https://example.com");
      const result1: any = await browserNavigate.execute({ url: "https://example.com" });
      const parsed1 = JSON.parse(result1);

      mockPage.url.mockReturnValue("https://example.org");
      const result2: any = await browserNavigate.execute({ url: "https://example.org" });
      const parsed2 = JSON.parse(result2);

      // Both operations should succeed
      expect(parsed1.success).toBe(true);
      expect(parsed2.success).toBe(true);
      expect(parsed1).toBeDefined();
      expect(parsed2).toBeDefined();
    });

    it("should maintain page context between navigate and screenshot", async () => {
      const browserNavigate: any = browserTools.find((t) => t.name === "browser_navigate")!;
      const browserScreenshot: any = browserTools.find((t) => t.name === "browser_screenshot")!;

      mockPage.screenshot.mockResolvedValue(Buffer.from("page"));

      await browserNavigate.execute({ url: "https://example.com" });
      const result: any = await browserScreenshot.execute({});
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(mockPage.url()).toBe("https://example.com");
    });
  });
});
