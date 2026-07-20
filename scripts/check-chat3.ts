import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Disable caching
  await context.clearCookies();
  
  console.log('Navigating to Chat page...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  
  // Click Chat
  await page.click('text=Chat');
  await page.waitForLoadState('networkidle');
  
  // Wait for the new header to appear
  await page.waitForSelector('h2:has-text("Gravity Claw")', { timeout: 5000 }).catch(() => console.log('Header h2 not found'));
  
  console.log('Taking chat screenshot...');
  await page.screenshot({ path: 'screenshots/chat-final.png', fullPage: true });
  
  // Get page content
  const h2Text = await page.locator('h2').first().textContent().catch(() => 'Not found');
  console.log('H2 text:', h2Text);
  
  const bodyText = await page.locator('body').innerText();
  console.log('Body contains "Start a conversation":', bodyText.includes('Start a conversation'));
  console.log('Body contains "Gravity Claw":', bodyText.includes('Gravity Claw'));
  
  await browser.close();
  console.log('Screenshot saved to screenshots/chat-final.png');
}

main().catch(console.error);