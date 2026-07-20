import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000');
  
  const title = await page.title();
  console.log('Page title:', title);
  
  const content = await page.content();
  console.log('Page content preview:', content.substring(0, 500));
  
  // Get all links
  const links = await page.locator('a').count();
  console.log('Number of links:', links);
  
  // Get body text
  const bodyText = await page.locator('body').innerText();
  console.log('Body text:', bodyText);
  
  await browser.close();
}

main().catch(console.error);