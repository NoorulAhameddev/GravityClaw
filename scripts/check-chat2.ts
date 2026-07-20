import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Disable caching
  await context.clearCookies();
  
  console.log('Navigating to Chat page...');
  await page.goto('http://localhost:3000/chat', { waitUntil: 'networkidle' });
  
  console.log('Taking chat screenshot...');
  await page.screenshot({ path: 'screenshots/chat-new2.png', fullPage: true });
  
  // Get page title
  const title = await page.title();
  console.log('Page title:', title);
  
  // Check if new header exists
  const headerText = await page.locator('h2').first().textContent();
  console.log('Header text:', headerText);
  
  await browser.close();
  console.log('Screenshot saved!');
}

main().catch(console.error);