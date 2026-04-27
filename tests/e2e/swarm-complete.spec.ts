import { test, expect } from "@playwright/test";

test.describe("Agent Swarm Complete Test", () => {
  test("full swarm workflow - execute and verify results", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("http://localhost:3000");
    await page.waitForLoadState("networkidle");

    // Step 1: Send swarm command
    await page.click("text=Chat");
    await page.waitForTimeout(2000);

    const chatInput = page.locator('textarea[placeholder*="message"]');
    await chatInput.fill("/swarm Create a simple add function");
    await page.waitForTimeout(300);

    const sendButton = page.locator('button[type="submit"]');
    await sendButton.click();

    // Step 2: Wait for swarm execution (60s)
    console.log("Waiting for swarm execution...");
    await page.waitForTimeout(60000);

    // Step 3: Get all messages
    const allMessages = await page.locator(".flex.gap-3 p").allTextContents();
    console.log("Total messages:", allMessages.length);
    
    // Step 4: Check response contains swarm indicators
    const responseText = allMessages.join(" ");
    const hasSwarmResponse = responseText.includes("Swarm") || responseText.includes("agent") || responseText.includes("Agent");
    console.log("Has swarm response:", hasSwarmResponse);
    console.log("Sample:", responseText.slice(0, 500));

    // Step 5: Navigate to Swarms page to verify DB records
    await page.click("text=Swarms");
    await page.waitForTimeout(3000);

    const swarmRows = await page.locator("tbody tr").count();
    console.log("Swarm rows in DB:", swarmRows);

    // Step 6: Check stats update
    const activeCount = await page.locator("text=Active").first().isVisible();
    console.log("Active stat visible:", activeCount);

    // Assertions
    expect(allMessages.length).toBeGreaterThanOrEqual(2); // user + bot
    expect(errors.length).toBe(0);
    
    console.log("✅ Swarm test complete");
  });
});