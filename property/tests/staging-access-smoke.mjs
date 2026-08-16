#!/usr/bin/env node
/* Run only against a non-production Watchdog deployment. */
import { chromium } from 'playwright';

const base = (process.env.STAGING_BASE_URL || '').replace(/\/$/, '');
if (!base) throw new Error('STAGING_BASE_URL is required and must point to a non-production deployment.');
if (/njpropertytaxrelief\.com$/i.test(new URL(base).hostname) && !/staging|preview|vercel\.app/i.test(new URL(base).hostname)) {
  throw new Error('Refusing to run smoke tests against the production domain.');
}

const protectedRoutes = [
  '/property/dashboard', '/property/pulse.html', '/property/marker.html',
  '/property/developer-data.html', '/property/updates.html', '/property/data-center.html',
  '/property/scan.html', '/property/verification-diagnostics.html'
];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const failures = [];
for (const route of protectedRoutes) {
  await page.goto(base + route, { waitUntil: 'networkidle' });
  const url = page.url();
  if (!url.includes('/property/dashboard?access=signin')) failures.push(`${route} did not redirect an anonymous visitor to sign-in: ${url}`);
}
await browser.close();
if (failures.length) throw new Error(failures.join('\n'));
console.log(`Anonymous access smoke passed for ${protectedRoutes.length} protected routes.`);
