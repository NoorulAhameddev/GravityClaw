import { chromium } from 'playwright';

const PAGES = [
  '/',
  '/sessions',
  '/memory',
  '/analytics',
  '/tools',
  '/workflows',
  '/swarms',
  '/heartbeats',
  '/scheduler',
  '/webhooks',
  '/admin',
  '/chat',
  '/canvas',
  '/whatsapp',
  '/usage'
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const screenshotsDir = 'screenshots';
  
  for (const path of PAGES) {
    const url = `http://localhost:3000${path}`;
    console.log(`Navigating to ${url}...`);
    
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 });
      
      // Wait a bit for any errors to appear
      await page.waitForTimeout(1000);
      
      // Check for console errors
      const errors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });
      
      // Check for visible error messages in the page
      const bodyText = await page.locator('body').innerText();
      const hasImageError = bodyText.toLowerCase().includes('cannot read') && bodyText.toLowerCase().includes('image');
      
      if (hasImageError || errors.length > 0) {
        console.log(`  ⚠️ ERROR FOUND on ${path}:`);
        if (hasImageError) console.log(`  - Page contains "Cannot read" image error`);
        if (errors.length > 0) console.log(`  - Console errors: ${errors.join(', ')}`);
      }
      
      // Take screenshot
      const filename = path === '/' ? 'overview' : path.substring(1);
      await page.screenshot({ path: `${screenshotsDir}/${filename}.png`, fullPage: true });
      console.log(`  ✓ Saved ${filename}.png`);
      
    } catch (err) {
      console.log(`  ✗ Failed to load ${path}: ${err}`);
    }
  }
  
  await browser.close();
  console.log('\nScreenshots saved to screenshots/');
}

main().catch(console.error);