import type { Tool } from './index.js';
import { chromium } from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";
import { createLogger } from "../logger.ts";
import { AIR_GAPPED } from "../config.ts";
import { checkAirGapTool } from "../airgap/enforcement.ts";

const logger = createLogger("browser");

/**
 * Browser session manager for maintaining browser context across tool calls
 */
class BrowserSessionManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private lastActivityTime: number = Date.now();
  private readonly sessionTimeoutMs = 5 * 60 * 1000; // 5 minutes

  /**
   * Get or create browser instance
   */
  async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      logger.info("Launching new browser instance");
      this.browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    }
    return this.browser;
  }

  /**
   * Get or create browser context
   */
  async getContext(): Promise<BrowserContext> {
    if (!this.context) {
      const browser = await this.getBrowser();
      this.context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      });
    }
    this.lastActivityTime = Date.now();
    return this.context;
  }

  /**
   * Get or create page
   */
  async getPage(): Promise<Page> {
    if (!this.page || this.page.isClosed()) {
      const context = await this.getContext();
      this.page = await context.newPage();
    }
    this.lastActivityTime = Date.now();
    return this.page;
  }

  /**
   * Close browser session
   */
  async close(): Promise<void> {
    try {
      if (this.page && !this.page.isClosed()) {
        await this.page.close();
      }
      if (this.context) {
        await this.context.close();
      }
      if (this.browser && this.browser.isConnected()) {
        await this.browser.close();
      }
    } catch (error) {
      logger.error("Error closing browser session", { error });
    } finally {
      this.page = null;
      this.context = null;
      this.browser = null;
    }
  }

  /**
   * Check and close session if idle for too long
   */
  async checkIdleTimeout(): Promise<void> {
    const idleTime = Date.now() - this.lastActivityTime;
    if (idleTime > this.sessionTimeoutMs && this.browser) {
      logger.info("Browser session idle timeout, closing");
      await this.close();
    }
  }
}

// Global session manager
const sessionManager = new BrowserSessionManager();

// Check idle timeout every minute
setInterval(() => {
  sessionManager.checkIdleTimeout().catch((err) => {
    logger.error("Error checking browser idle timeout", { error: err });
  });
}, 60 * 1000);

/**
 * Navigate to a URL
 */
const browserNavigate: Tool = {
  name: "browser_navigate",
  description:
    "Navigate to a URL in the browser. Returns page title and URL after navigation. Maintains browser session for subsequent operations.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL to navigate to (must include protocol, e.g., https://)",
      },
      waitUntil: {
        type: "string",
        enum: ["load", "domcontentloaded", "networkidle"],
        description:
          "When to consider navigation succeeded (default: load). 'load' waits for load event, 'domcontentloaded' waits for DOMContentLoaded, 'networkidle' waits for no network activity.",
      },
    },
    required: ["url"],
  },
  execute: async ({ url, waitUntil = "load" }: { url: string; waitUntil?: string }) => {
    try {
      // Check air-gap mode
      if (AIR_GAPPED) {
        checkAirGapTool('browser_navigate');
      }

      // Validate URL
      try {
        new URL(url);
      } catch {
        return JSON.stringify({
          success: false,
          error: "Invalid URL format. Must include protocol (e.g., https://example.com)",
        });
      }

      const page = await sessionManager.getPage();

      // Navigate with timeout
      await page.goto(url, {
        waitUntil: waitUntil as "load" | "domcontentloaded" | "networkidle",
        timeout: 30000,
      });

      const title = await page.title();
      const finalUrl = page.url();

      return JSON.stringify({
        success: true,
        title,
        url: finalUrl,
        message: `Navigated to ${title} (${finalUrl})`,
      });
    } catch (error: any) {
      logger.error("Browser navigation error", { url, error });
      return JSON.stringify({
        success: false,
        error: error.message || "Navigation failed",
      });
    }
  },
};

/**
 * Take a screenshot of the current page or a specific URL
 */
const browserScreenshot: Tool = {
  name: "browser_screenshot",
  description:
    "Take a screenshot of a webpage. Can navigate to a new URL or capture the current page. Returns base64-encoded PNG image.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description:
          "URL to navigate to before taking screenshot (optional, uses current page if omitted)",
      },
      fullPage: {
        type: "boolean",
        description: "Capture full scrollable page (default: false, captures viewport only)",
      },
      selector: {
        type: "string",
        description:
          "CSS selector to capture specific element only (optional, captures whole page if omitted)",
      },
    },
    required: [],
  },
  execute: async ({ url, fullPage = false, selector }: { url?: string; fullPage?: boolean; selector?: string }) => {
    try {
      // Check air-gap mode
      if (AIR_GAPPED) {
        checkAirGapTool('browser_screenshot');
      }

      const page = await sessionManager.getPage();

      // Navigate if URL provided
      if (url) {
        try {
          new URL(url);
          await page.goto(url, { waitUntil: "load", timeout: 30000 });
        } catch {
          return JSON.stringify({
            success: false,
            error: "Invalid URL format",
          });
        }
      }

      // Take screenshot
      let screenshot: Buffer;
      if (selector) {
        const element = await page.$(selector);
        if (!element) {
          return JSON.stringify({
            success: false,
            error: `Element not found: ${selector}`,
          });
        }
        screenshot = await element.screenshot({ type: "png" });
      } else {
        screenshot = await page.screenshot({
          type: "png",
          fullPage,
          timeout: 30000,
        });
      }

      const base64 = screenshot.toString("base64");
      const currentUrl = page.url();
      const title = await page.title();

      return JSON.stringify({
        success: true,
        url: currentUrl,
        title,
        image: base64,
        encoding: "base64",
        type: "image/png",
        message: `Screenshot captured from ${title}`,
      });
    } catch (error: any) {
      logger.error("Browser screenshot error", { error });
      return JSON.stringify({
        success: false,
        error: error.message || "Screenshot failed",
      });
    }
  },
};

/**
 * Click an element on the page
 */
const browserClick: Tool = {
  name: "browser_click",
  description:
    "Click an element on the current page using a CSS selector. Use after browser_navigate to interact with page elements.",
  inputSchema: {
    type: "object",
    properties: {
      selector: {
        type: "string",
        description: "CSS selector for the element to click (e.g., '#submit-button', '.nav-link')",
      },
      waitForNavigation: {
        type: "boolean",
        description:
          "Wait for navigation after click (default: false). Use for submit buttons or links.",
      },
    },
    required: ["selector"],
  },
  execute: async ({ selector, waitForNavigation = false }: { selector: string; waitForNavigation?: boolean }) => {
    try {
      // Check air-gap mode
      if (AIR_GAPPED) {
        checkAirGapTool('browser_click');
      }

      const page = await sessionManager.getPage();

      // Check if element exists
      const element = await page.$(selector);
      if (!element) {
        return JSON.stringify({
          success: false,
          error: `Element not found: ${selector}`,
        });
      }

      // Scroll into view
      await element.scrollIntoViewIfNeeded();

      // Click with optional navigation wait
      if (waitForNavigation) {
        await Promise.all([
          page.waitForNavigation({ timeout: 30000 }).catch(() => {
            // Navigation might not happen, that's ok
          }),
          element.click(),
        ]);
      } else {
        await element.click();
      }

      const currentUrl = page.url();
      const title = await page.title();

      return JSON.stringify({
        success: true,
        selector,
        url: currentUrl,
        title,
        message: `Clicked element: ${selector}`,
      });
    } catch (error: any) {
      logger.error("Browser click error", { selector, error });
      return JSON.stringify({
        success: false,
        error: error.message || "Click failed",
      });
    }
  },
};

/**
 * Type text into an input field
 */
const browserType: Tool = {
  name: "browser_type",
  description:
    "Type text into an input field on the current page using a CSS selector. Clears existing content before typing.",
  inputSchema: {
    type: "object",
    properties: {
      selector: {
        type: "string",
        description: "CSS selector for the input field (e.g., '#search-box', 'input[name=email]')",
      },
      text: {
        type: "string",
        description: "Text to type into the field",
      },
      pressEnter: {
        type: "boolean",
        description: "Press Enter after typing (default: false). Useful for search boxes.",
      },
    },
    required: ["selector", "text"],
  },
  execute: async ({ selector, text, pressEnter = false }: { selector: string; text: string; pressEnter?: boolean }) => {
    try {
      // Check air-gap mode
      if (AIR_GAPPED) {
        checkAirGapTool('browser_type');
      }

      const page = await sessionManager.getPage();

      // Check if element exists
      const element = await page.$(selector);
      if (!element) {
        return JSON.stringify({
          success: false,
          error: `Element not found: ${selector}`,
        });
      }

      // Focus and clear
      await element.click();
      await page.keyboard.press("Control+A");
      await page.keyboard.press("Backspace");

      // Type text
      await element.type(text, { delay: 50 }); // Human-like typing

      // Press Enter if requested
      if (pressEnter) {
        await page.keyboard.press("Enter");
        await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {
          // Network might not settle, that's ok
        });
      }

      const currentUrl = page.url();
      const title = await page.title();

      return JSON.stringify({
        success: true,
        selector,
        text,
        url: currentUrl,
        title,
        message: `Typed '${text}' into ${selector}`,
      });
    } catch (error: any) {
      logger.error("Browser type error", { selector, error });
      return JSON.stringify({
        success: false,
        error: error.message || "Type operation failed",
      });
    }
  },
};

/**
 * Extract content from page using CSS selector
 */
const browserExtract: Tool = {
  name: "browser_extract",
  description:
    "Extract text content, HTML, or attributes from elements on the current page or a specific URL using CSS selectors.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL to navigate to before extracting (optional, uses current page if omitted)",
      },
      selector: {
        type: "string",
        description: "CSS selector for elements to extract (e.g., 'h1', '.article-content', 'a')",
      },
      extract: {
        type: "string",
        enum: ["text", "html", "attribute"],
        description:
          "What to extract: 'text' for innerText, 'html' for innerHTML, 'attribute' for attribute value (default: text)",
      },
      attribute: {
        type: "string",
        description: "Attribute name to extract when extract='attribute' (e.g., 'href', 'src')",
      },
      multiple: {
        type: "boolean",
        description:
          "Extract from all matching elements (default: false, extracts from first match only)",
      },
    },
    required: ["selector"],
  },
  execute: async ({ url, selector, extract = "text", attribute, multiple = false }: { url?: string; selector: string; extract?: string; attribute?: string; multiple?: boolean }) => {
    try {
      // Check air-gap mode
      if (AIR_GAPPED) {
        checkAirGapTool('browser_extract');
      }

      const page = await sessionManager.getPage();

      // Navigate if URL provided
      if (url) {
        try {
          new URL(url);
          await page.goto(url, { waitUntil: "load", timeout: 30000 });
        } catch {
          return JSON.stringify({
            success: false,
            error: "Invalid URL format",
          });
        }
      }

      let content: string | string[];

      if (multiple) {
        // Extract from all matching elements
        const elements = await page.$$(selector);
        if (elements.length === 0) {
          return JSON.stringify({
            success: false,
            error: `No elements found: ${selector}`,
          });
        }

        const results: string[] = [];
        for (const element of elements) {
          if (extract === "text") {
            const text = await element.innerText();
            results.push(text.trim());
          } else if (extract === "html") {
            const html = await element.innerHTML();
            results.push(html.trim());
          } else if (extract === "attribute") {
            if (!attribute) {
              return JSON.stringify({
                success: false,
                error: "Attribute name required when extract='attribute'",
              });
            }
            const value = await element.getAttribute(attribute);
            if (value) results.push(value);
          }
        }
        content = results;
      } else {
        // Extract from first matching element
        const element = await page.$(selector);
        if (!element) {
          return JSON.stringify({
            success: false,
            error: `Element not found: ${selector}`,
          });
        }

        if (extract === "text") {
          content = (await element.innerText()).trim();
        } else if (extract === "html") {
          content = (await element.innerHTML()).trim();
        } else if (extract === "attribute") {
          if (!attribute) {
            return JSON.stringify({
              success: false,
              error: "Attribute name required when extract='attribute'",
            });
          }
          const value = await element.getAttribute(attribute);
          if (!value) {
            return JSON.stringify({
              success: false,
              error: `Attribute '${attribute}' not found on element`,
            });
          }
          content = value;
        } else {
          content = "";
        }
      }

      const currentUrl = page.url();
      const title = await page.title();

      return JSON.stringify({
        success: true,
        selector,
        extract,
        content,
        count: Array.isArray(content) ? content.length : 1,
        url: currentUrl,
        title,
        message: `Extracted ${extract} from ${selector}`,
      });
    } catch (error: any) {
      logger.error("Browser extract error", { selector, error });
      return JSON.stringify({
        success: false,
        error: error.message || "Extract operation failed",
      });
    }
  },
};

/**
 * Close the browser session
 */
const browserClose: Tool = {
  name: "browser_close",
  description:
    "Close the browser session and clean up resources. The browser will automatically close after 5 minutes of inactivity, but you can use this to close it immediately.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  execute: async () => {
    try {
      await sessionManager.close();
      return JSON.stringify({
        success: true,
        message: "Browser session closed successfully",
      });
    } catch (error: any) {
      logger.error("Browser close error", { error });
      return JSON.stringify({
        success: false,
        error: error.message || "Failed to close browser",
      });
    }
  },
};

/**
 * Export browser automation tools
 */
export const browserTools: Tool[] = [
  browserNavigate,
  browserScreenshot,
  browserClick,
  browserType,
  browserExtract,
  browserClose,
];
