import { test, expect } from "@playwright/test";

test.describe("Swarm vs Regular Chat", () => {
  test("swarm hello should work", async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForLoadState("networkidle");

    await page.click("text=Chat");
    await page.waitForTimeout(2000);

    // Clear chat first
    const clearBtn = page.locator('button[title="Clear Chat"]');
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
      await page.waitForTimeout(500);
    }

    const chatInput = page.locator('textarea[placeholder*="message"]');
    await chatInput.fill("/swarm hello");
    await page.waitForTimeout(300);

    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(60000);

    const messages = await page.locator(".flex.gap-3 p").allTextContents();
    const lastMsg = messages[messages.length - 1] || "";
    console.log("Swarm response:", lastMsg.slice(0, 200));
    
    expect(lastMsg).not.toContain("No results to aggregate");
  });

  test("regular chat should work", async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForLoadState("networkidle");

    await page.click("text=Chat");
    await page.waitForTimeout(2000);

    const chatInput = page.locator('textarea[placeholder*="message"]');
    await chatInput.fill("Hello, respond with 'OK'");
    await page.waitForTimeout(300);

    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(15000);

    const messages = await page.locator(".flex.gap-3 p").allTextContents();
    console.log("Regular chat response:", messages[messages.length - 1]?.slice(0, 100));
    expect(messages.length).toBeGreaterThan(1);
  });
});