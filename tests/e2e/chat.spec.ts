import { test, expect } from "@playwright/test";

test.describe("WebSocket Chat", () => {
  test("should connect to WebSocket and send message", async ({ page }) => {
    const allConsoleMessages: string[] = [];
    page.on("console", (msg) => {
      allConsoleMessages.push(`[${msg.type()}] ${msg.text()}`);
    });

    await page.goto("http://localhost:3000");
    await page.waitForLoadState("networkidle");

    // Wait for WebSocket connection
    await page.waitForTimeout(3000);

    // Check connection status in header
    const statusElement = page.locator("header").filter({ hasText: /Live|Connecting|Offline/ });
    const statusText = await statusElement.textContent();
    console.log("Connection status:", statusText);

    // Navigate to chat page
    await page.click("text=Chat");
    await page.waitForTimeout(1000);

    // Find the chat input
    const chatInput = page.locator('textarea[placeholder*="message"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // Type and send a message
    await chatInput.fill("Hello, who are you?");
    await page.waitForTimeout(500);
    const sendButton = page.locator('button[type="submit"]');
    await sendButton.click();

    // Wait for response from agent
    await page.waitForTimeout(15000);

    // Get all messages - look for the message containers
    const messageDivs = await page.locator(".flex.gap-3").count();
    console.log(`Total message containers: ${messageDivs}`);

    // Get the actual message text
    const allMessages = await page.locator(".flex.gap-3 p").allTextContents();
    console.log("Bot response:", allMessages[1]?.slice(0, 100));

    // Check console errors
    const errors = allConsoleMessages.filter(m => m.startsWith("[error]"));
    if (errors.length > 0) {
      console.log("Console errors:", errors.join("\n"));
    }

    // Check if we got a bot response (more than just user message)
    expect(messageDivs).toBeGreaterThan(1);
  });
});