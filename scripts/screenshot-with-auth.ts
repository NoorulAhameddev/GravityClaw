import { chromium } from 'playwright';

const PAGES = [
  { path: '/', name: 'Overview' },
  { path: '/sessions', name: 'Sessions' },
  { path: '/memory', name: 'Memory' },
  { path: '/analytics', name: 'Analytics' },
  { path: '/tools', name: 'Tools' },
  { path: '/workflows', name: 'Workflows' },
  { path: '/swarms', name: 'Swarms' },
  { path: '/heartbeats', name: 'Heartbeats' },
  { path: '/scheduler', name: 'Scheduler' },
  { path: '/webhooks', name: 'Webhooks' },
  { path: '/admin', name: 'Admin' },
  { path: '/chat', name: 'Chat' },
  { path: '/canvas', name: 'Canvas' },
  { path: '/whatsapp', name: 'WhatsApp' },
  { path: '/usage', name: 'Usage' }
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Set API key in localStorage before navigating
  // Using test key - user should set their own via the UI
  await page.addInitScript(() => {
    localStorage.setItem('apiKey', 'dev-test-key-12345');
  });
  
  const consoleErrors: Array<{ page: string, errors: string[] }> = [];
  
  for (const { path, name } of PAGES) {
    const url = `http://localhost:3000${path}`;
    console.log(`Checking ${name} (${url})...`);
    
    const page2 = await browser.newPage();
    const errors: string[] = [];
    
    // Set API key for each new page
    await page2.addInitScript(() => {
      localStorage.setItem('apiKey', 'dev-test-key-12345');
    });
    
    page2.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    page2.on('pageerror', err => {
      errors.push(err.message);
    });
    
    try {
      await page2.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      await page2.waitForTimeout(2000);
      
      if (errors.length > 0) {
        consoleErrors.push({ page: name, errors });
        console.log(`  ⚠️ Console errors found:`);
        errors.forEach(e => console.log(`    - ${e}`));
      } else {
        console.log(`  ✓ No console errors`);
      }
      
      // Take screenshot
      const filename = path === '/' ? 'overview' : path.substring(1);
      await page2.screenshot({ path: `screenshots/${filename}.png`, fullPage: true });
      console.log(`  ✓ Saved ${filename}.png`);
      
    } catch (err) {
      console.log(`  ✗ Failed to load: ${err}`);
    }
    
    await page2.close();
  }
  
  await browser.close();
  
  console.log('\n=== SUMMARY ===');
  if (consoleErrors.length === 0) {
    console.log('No console errors found on any page.');
  } else {
    console.log(`Found errors on ${consoleErrors.length} page(s):`);
    consoleErrors.forEach(({ page, errors }) => {
      console.log(`\n${page}:`);
      errors.forEach(e => console.log(`  - ${e}`));
    });
  }
}

main().catch(console.error);