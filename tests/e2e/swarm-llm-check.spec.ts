import { test, expect } from "@playwright/test";

test.describe("Swarm LLM Response Check", () => {
  test("should get actual LLM response from swarm", async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForLoadState("networkidle");

    await page.click("text=Chat");
    await page.waitForTimeout(2000);

    // Clear chat first
    const clearBtn = page.locator('button[title="Clear Chat"]');
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
      await page.waitForTimeout(1000);
    }

    const chatInput = page.locator('textarea[placeholder*="message"]');
    await chatInput.fill("/swarm What is 2+2?");
    await page.waitForTimeout(300);

    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(90000);

    // Get all messages
    const containers = await page.locator(".flex.gap-3").all();
    for (let i = Math.max(0, containers.length - 5); i < containers.length; i++) {
      const text = await containers[i].locator("p").textContent();
      console.log(`Message ${i}:`, text?.slice(0, 200));
    }
  });
});