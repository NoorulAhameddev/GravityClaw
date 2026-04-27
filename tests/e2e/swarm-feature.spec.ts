import { test, expect } from "@playwright/test";

test.describe("Agent Swarm Feature", () => {
  test("should trigger swarm via chat command", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("http://localhost:3000");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Navigate to chat
    await page.click("text=Chat");
    await page.waitForTimeout(2000);

    // Find chat input and send swarm command
    const chatInput = page.locator('textarea[placeholder*="message"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // Send a simple swarm command
    await chatInput.fill("/swarm Hello");
    await page.waitForTimeout(500);

    const sendButton = page.locator('button[type="submit"]');
    await sendButton.click();

    // Wait for response - swarm takes time, use longer timeout
    await page.waitForTimeout(60000);

    // Check that we got a response
    const allMessages = await page.locator(".flex.gap-3 p").allTextContents();
    console.log("Messages count:", allMessages.length);
    console.log("Last message:", allMessages[allMessages.length - 1]?.slice(0, 300));
    console.log("Errors:", errors);

    // Should have at least user message + bot response
    expect(allMessages.length).toBeGreaterThan(1);
  });

  test("should display swarm results in swarms page", async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Navigate to Swarms page
    await page.click("text=Swarms");
    await page.waitForTimeout(3000);

    // Check if there are any swarm entries
    const tableVisible = await page.locator("table").isVisible();
    console.log("Swarms table visible:", tableVisible);

    // Check stats
    const totalSwarms = await page.locator("text=Total Swarms").isVisible();
    console.log("Stats visible:", totalSwarms);

    // If any swarms exist, check they have proper data
    if (tableVisible) {
      const rows = await page.locator("tbody tr").count();
      console.log("Swarm rows:", rows);
    }
  });

  test("should handle /swarm help command", async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForLoadState("networkidle");

    await page.click("text=Chat");
    await page.waitForTimeout(2000);

    const chatInput = page.locator('textarea[placeholder*="message"]');
    await chatInput.fill("/swarm");
    await page.waitForTimeout(500);

    const sendButton = page.locator('button[type="submit"]');
    await sendButton.click();

    await page.waitForTimeout(5000);

    // Check help text is displayed
    const allMessages = await page.locator(".flex.gap-3 p").allTextContents();
    const helpText = allMessages.find(m => m.includes("Usage:"));
    console.log("Help text found:", !!helpText);

    expect(helpText).toBeTruthy();
  });
});