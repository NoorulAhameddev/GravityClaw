import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('Navigating to Chat page...');
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  
  // Click Chat
  await page.click('text=Chat');
  await page.waitForLoadState('networkidle');
  
  console.log('Taking chat screenshot...');
  await page.screenshot({ path: 'screenshots/chat-new.png', fullPage: true });
  
  // Test typing
  await page.fill('textarea', 'Hello, what can you do?');
  await page.screenshot({ path: 'screenshots/chat-typing.png', fullPage: true });
  
  await browser.close();
  console.log('Screenshots saved!');
}

main().catch(console.error);