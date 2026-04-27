import { test, expect } from "@playwright/test";

test.describe("Workflow (Mesh) Feature", () => {
  test("should trigger workflow via /mesh command", async ({ page }) => {
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

    // Send /mesh help command first
    const chatInput = page.locator('textarea[placeholder*="message"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    await chatInput.fill("/mesh");
    await page.waitForTimeout(300);

    const sendButton = page.locator('button[type="submit"]');
    await sendButton.click();

    await page.waitForTimeout(5000);

    // Check help text
    const allMessages = await page.locator(".flex.gap-3 p").allTextContents();
    const helpText = allMessages.find(m => m.includes("Mesh") || m.includes("workflow"));
    console.log("Mesh help found:", !!helpText);

    expect(helpText).toBeTruthy();
  });

  test("should display workflow results in workflows page", async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForLoadState("networkidle");

    // Navigate to Workflows page
    await page.click("text=Workflows");
    await page.waitForTimeout(3000);

    // Check page elements
    const header = await page.locator("text=Workflows").first().isVisible();
    console.log("Workflows header visible:", header);

    const totalStat = await page.locator("text=Total").first().isVisible();
    console.log("Total stat visible:", totalStat);

    // Check if cards are visible
    const cardsVisible = await page.locator('[class*="rounded-xl"][class*="bg-surface"]').first().isVisible();
    console.log("Workflow cards visible:", cardsVisible);

    expect(header).toBe(true);
    expect(totalStat).toBe(true);
  });

  test("should show running/completed/failed stats", async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForLoadState("networkidle");

    await page.click("text=Workflows");
    await page.waitForTimeout(3000);

    // Check stats exist
    const runningStat = await page.locator("text=Running").isVisible();
    const completedStat = await page.locator("text=Completed").isVisible();
    const failedStat = await page.locator("text=Failed").isVisible();

    console.log("Running stat:", runningStat);
    console.log("Completed stat:", completedStat);
    console.log("Failed stat:", failedStat);

    expect(runningStat).toBe(true);
    expect(completedStat).toBe(true);
    expect(failedStat).toBe(true);
  });
});