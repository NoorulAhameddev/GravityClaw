import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000');
  
  // Wait for page to fully load
  await page.waitForLoadState('networkidle');
  
  console.log('Taking screenshot...');
  await page.screenshot({ path: 'screenshots/dashboard.png', fullPage: true });
  
  // Check Chat page
  console.log('Navigating to Chat...');
  await page.click('text=Chat');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'screenshots/chat.png', fullPage: true });
  
  // Get chat page content
  const chatText = await page.locator('body').innerText();
  console.log('Chat page content:', chatText.substring(0, 300));
  
  await browser.close();
  console.log('Screenshots saved to screenshots/');
}

main().catch(console.error);