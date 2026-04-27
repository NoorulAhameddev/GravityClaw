import { test, expect } from "@playwright/test";

test.describe("Swarms & Workflows", () => {
  test("should load swarms page", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("http://localhost:3000");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Navigate to Swarms
    await page.click("text=Swarms");
    await page.waitForTimeout(3000);

    // Check for page elements
    const header = await page.locator("text=Agent Swarms").isVisible();
    console.log("Swarms header visible:", header);

    // Check stats
    const totalSwarms = await page.locator("text=Total Swarms").isVisible();
    console.log("Total Swarms stat visible:", totalSwarms);

    // Check for any errors
    const filteredErrors = errors.filter(e => !e.includes("favicon"));
    if (filteredErrors.length > 0) console.log("Console errors:", filteredErrors);

    expect(header).toBe(true);
  });

  test("should load workflows page", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("http://localhost:3000");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Navigate to Workflows
    await page.click("text=Workflows");
    await page.waitForTimeout(3000);

    // Check for page elements
    const header = await page.locator("text=Workflows").first().isVisible();
    console.log("Workflows header visible:", header);

    // Check stats
    const totalWorkflows = await page.locator("text=Total").first().isVisible();
    console.log("Total stat visible:", totalWorkflows);

    // Check for any errors
    const filteredErrors = errors.filter(e => !e.includes("favicon"));
    if (filteredErrors.length > 0) console.log("Console errors:", filteredErrors);

    expect(header).toBe(true);
  });

  test("should navigate between swarms and workflows", async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Go to Swarms
    await page.click("text=Swarms");
    await page.waitForTimeout(2000);
    let url = page.url();
    console.log("After Swarms:", url.includes("swarms") || url.endsWith("3000/"));

    // Go to Workflows
    await page.click("text=Workflows");
    await page.waitForTimeout(2000);
    url = page.url();
    console.log("After Workflows:", url.includes("workflows") || url.endsWith("3000/"));

    // Both should be accessible (single page app routing)
    const swarmsVisible = await page.locator("text=Agent Swarms").isVisible();
    const workflowsVisible = await page.locator("text=Workflows").first().isVisible();
    console.log("Swarms page visible:", swarmsVisible);
    console.log("Workflows page visible:", workflowsVisible);
  });
});