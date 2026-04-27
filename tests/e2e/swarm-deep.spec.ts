import { test, expect } from "@playwright/test";

test.describe("Swarm Deep Debug", () => {
  test("should see full agent responses", async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForLoadState("networkidle");

    await page.click("text=Chat");
    await page.waitForTimeout(2000);

    const chatInput = page.locator('textarea[placeholder*="message"]');
    await chatInput.fill("/swarm Write hello world");
    await page.waitForTimeout(300);

    await page.locator('button[type="submit"]').click();

    // Wait for swarm execution
    await page.waitForTimeout(90000);

    // Get all message text
    const allMessages = await page.locator(".flex.gap-3").all();
    for (let i = 0; i < allMessages.length; i++) {
      const text = await allMessages[i].locator("p").textContent();
      console.log(`Message ${i}:`, text?.slice(0, 200));
    }
  });
});