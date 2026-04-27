import { test, expect } from "@playwright/test";

test.describe("Swarm Debug Test", () => {
  test("should capture detailed swarm error", async ({ page }) => {
    const logs: string[] = [];
    page.on("console", (msg) => {
      logs.push(`[${msg.type()}] ${msg.text()}`);
    });

    await page.goto("http://localhost:3000");
    await page.waitForLoadState("networkidle");

    // Go to chat
    await page.click("text=Chat");
    await page.waitForTimeout(2000);

    const chatInput = page.locator('textarea[placeholder*="message"]');
    await chatInput.fill("/swarm test");
    await page.waitForTimeout(300);

    await page.locator('button[type="submit"]').click();

    // Wait for response
    await page.waitForTimeout(60000);

    // Get all messages
    const allMessages = await page.locator(".flex.gap-3 p").allTextContents();
    console.log("Full response:\n", allMessages.join("\n\n---\n\n"));

    // Check for error details in logs
    const errorLogs = logs.filter(l => l.includes("error") || l.includes("Error"));
    console.log("\nError logs:", errorLogs);
  });
});