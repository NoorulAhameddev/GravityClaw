import { test, expect } from "@playwright/test";

test.describe("Swarm Content Debug", () => {
  test("check swarm agent content", async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForLoadState("networkidle");

    await page.click("text=Chat");
    await page.waitForTimeout(2000);

    const chatInput = page.locator('textarea[placeholder*="message"]');
    await chatInput.fill("/swarm hello");
    await page.waitForTimeout(300);

    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(90000);

    // Get all message containers
    const containers = await page.locator(".flex.gap-3").all();
    for (let i = 0; i < containers.length; i++) {
      const pTexts = await containers[i].locator("p").allTextContents();
      console.log(`Container ${i}:`, pTexts.join(" | ").slice(0, 300));
    }
  });
});