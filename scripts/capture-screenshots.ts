import { chromium, firefox } from 'playwright';

async function captureScreenshot() {
  const browsers = [
    { browser: await chromium.launch({ channel: 'chrome', headless: true }), name: 'chrome' },
    { browser: await chromium.launch({ channel: 'msedge', headless: true }), name: 'msedge' }
  ];

  const results: string[] = [];

  for (const { browser, name } of browsers) {
    const page = await browser.newPage();
    await page.goto('http://localhost:5175', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    const screenshotPath = `screenshot-${name}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    results.push(screenshotPath);
    
    console.log(`Screenshot saved: ${screenshotPath}`);
    await browser.close();
  }

  console.log('Both screenshots captured!');
  return results;
}

captureScreenshot().catch(console.error);
