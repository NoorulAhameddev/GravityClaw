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
  
  const consoleErrors: Array<{ page: string, errors: string[] }> = [];
  
  for (const { path, name } of PAGES) {
    const url = `http://localhost:3000${path}`;
    console.log(`Checking ${name} (${url})...`);
    
    const page = await browser.newPage();
    const errors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    page.on('pageerror', err => {
      errors.push(err.message);
    });
    
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      
      if (errors.length > 0) {
        consoleErrors.push({ page: name, errors });
        console.log(`  ⚠️ Console errors found:`);
        errors.forEach(e => console.log(`    - ${e}`));
      } else {
        console.log(`  ✓ No console errors`);
      }
    } catch (err) {
      console.log(`  ✗ Failed to load: ${err}`);
    }
    
    await page.close();
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