import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const target = process.env.PUBLIC_PROPERTY_URL || 'https://njpropertytaxrelief.com/property/';
const label = process.env.PUBLIC_PROPERTY_LABEL || (target.includes('127.0.0.1') ? 'release-candidate' : 'production');
const evidenceDir = process.env.VISUAL_EVIDENCE_DIR || 'visual-acceptance-evidence';
await fs.mkdir(evidenceDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
const consoleErrors = [];

page.on('pageerror', error => pageErrors.push(String(error?.stack || error?.message || error)));
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });

try {
  const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (!response || response.status() >= 400) throw new Error(`${label} property route returned HTTP ${response?.status() ?? 'no-response'}`);
  await page.waitForTimeout(5000);
  const body = await page.locator('body').innerText();
  const fatalBanner = /A script error stopped the page|Script error\.\s*:0/i.test(body);

  await page.screenshot({ path: `${evidenceDir}/public-property-${label}.png`, fullPage: true });
  await fs.writeFile(
    `${evidenceDir}/public-property-${label}-console.json`,
    JSON.stringify({ target, label, pageErrors, consoleErrors, fatalBanner, checkedAt: new Date().toISOString() }, null, 2)
  );

  if (fatalBanner) throw new Error(`Watchdog fatal script-error banner rendered on the ${label} property route.`);
  if (pageErrors.length) throw new Error(`Uncaught ${label} page error(s):\n${pageErrors.join('\n---\n')}`);
  console.log(`${label} property browser smoke passed. Console error messages observed: ${consoleErrors.length}.`);
} finally {
  await browser.close();
}
