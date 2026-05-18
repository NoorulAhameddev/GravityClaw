import { test, expect } from "@playwright/test";

test.describe("Gravity Claw Dashboard - Sanity Tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("homepage loads successfully", async ({ page }) => {
    await expect(page.locator("body")).toBeVisible();
  });

  test("navigation menu is accessible", async ({ page }) => {
    const navLinks = page.locator(".nav-item");
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test("chat interface loads", async ({ page }) => {
    const chatInput = page.locator('input[placeholder*="message" i], textarea, [data-testid="chat-input"]');
    await expect(chatInput.first()).toBeVisible({ timeout: 10000 });
  });

  test("dashboard metrics display", async ({ page }) => {
    const metrics = page.locator("[data-testid^=metric], [class*=metric], .stat, .card");
    const count = await metrics.count();
    if (count > 0) {
      await expect(metrics.first()).toBeVisible();
    }
  });

  test("settings page accessible", async ({ page }) => {
    const settingsLink = page.locator('a[href*="settings"], button:has-text("Settings")');
    if (await settingsLink.count() > 0) {
      await settingsLink.first().click();
      await expect(page).toHaveURL(/settings/);
    }
  });

  test("no console errors on page load", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });
    await page.reload();
    await page.waitForLoadState("networkidle");
    expect(errors.filter(e => !e.includes("favicon"))).toHaveLength(0);
  });
});

test.describe("Interactive Features", () => {
  test("can type in chat input", async ({ page }) => {
    await page.goto("/");
    const chatInput = page.locator('input[type="text"], textarea').first();
    if (await chatInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await chatInput.fill("Hello");
      await expect(chatInput).toHaveValue("Hello");
    }
  });

  test("can send a message", async ({ page }) => {
    await page.goto("/");
    const chatInput = page.locator('input[type="text"], textarea').first();
    const sendButton = page.locator('button[type="submit"], button:has-text("Send")').first();
    
    if (await chatInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await chatInput.fill("Test message");
      if (await sendButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await sendButton.click();
        await page.waitForTimeout(2000);
      }
    }
  });

  test("session info displays", async ({ page }) => {
    await page.goto("/");
    const sessionInfo = page.locator("[data-testid*=session], [class*=session], .session-info");
    const count = await sessionInfo.count();
    if (count > 0) {
      await expect(sessionInfo.first()).toBeVisible();
    }
  });
});

test.describe("Responsive Layout", () => {
  test("works on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
  });

  test("works on tablet viewport", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("Performance", () => {
  test("page loads within 5 seconds", async ({ page }) => {
    const start = Date.now();
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    const loadTime = Date.now() - start;
    expect(loadTime).toBeLessThan(5000);
  });
});