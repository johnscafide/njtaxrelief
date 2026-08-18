#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseUrl = String(process.env.VISUAL_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const supabaseUrl = String(process.env.STAGING_SUPABASE_URL || '').replace(/\/$/, '');
const supabaseKey = String(process.env.STAGING_SUPABASE_PUBLISHABLE_KEY || '');
const email = String(process.env.WATCHDOG_TEST_DEVELOPER_EMAIL || '');
const password = String(process.env.WATCHDOG_TEST_DEVELOPER_PASSWORD || '');
const evidenceDir = process.env.VISUAL_EVIDENCE_DIR || 'visual-acceptance-evidence';

if (!supabaseUrl || !supabaseKey || !email || !password) {
  throw new Error('Staging Supabase URL/key and Developer test credentials are required.');
}
if (/uvkvaxljhhngydvlrzom/i.test(supabaseUrl)) {
  throw new Error('Refusing visual acceptance against production Supabase.');
}

const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
const storageKey = `sb-${projectRef}-auth-token`;

const surfaces = [
  { key: 'dashboard', path: '/property/dashboard/' },
  { key: 'home', path: '/property/home/' },
  { key: 'agent-control', path: '/property/agent-desk/' },
  { key: 'data-workbench', path: '/property/data-workbench/' },
  { key: 'calibration-admin', path: '/property/intelligence/calibration/' }
];

const viewports = [
  { key: 'desktop', width: 1440, height: 1000, isMobile: false },
  { key: 'mobile', width: 390, height: 844, isMobile: true }
];

async function signIn() {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.access_token || !body?.user?.id) {
    throw new Error(`Developer staging login failed: ${response.status} ${body?.error_description || body?.msg || ''}`.trim());
  }
  return body;
}

function cleanMessage(value) {
  return String(value || '')
    .replaceAll(email, '[developer-test-email]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .slice(0, 600);
}

await mkdir(evidenceDir, { recursive: true });
const session = await signIn();
const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const viewport of viewports) {
    for (const surface of surfaces) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.isMobile,
        deviceScaleFactor: 1
      });
      const page = await context.newPage();
      const pageErrors = [];
      const consoleErrors = [];

      page.on('pageerror', error => pageErrors.push(cleanMessage(error?.message || error)));
      page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(cleanMessage(message.text()));
      });

      await page.addInitScript(({ key, authSession }) => {
        localStorage.setItem(key, JSON.stringify(authSession));
      }, { key: storageKey, authSession: session });

      const url = `${baseUrl}${surface.path}`;
      let responseStatus = null;
      let navigationError = null;
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        responseStatus = response?.status() ?? null;
        await page.waitForTimeout(3000);
      } catch (error) {
        navigationError = cleanMessage(error?.message || error);
      }

      const finalUrl = page.url();
      const bodyText = await page.locator('body').innerText().catch(() => '');
      const accessPending = await page.locator('html.access-pending').count().catch(() => 0);
      const blocked = /[?&]access=(signin|restricted)\b/i.test(finalUrl) || /sign in required/i.test(bodyText);
      const tinyBody = bodyText.trim().length < 120;
      const screenshot = `${viewport.key}-${surface.key}.png`;
      await page.screenshot({ path: path.join(evidenceDir, screenshot), fullPage: true });

      const passed = !navigationError &&
        (responseStatus === null || responseStatus < 400) &&
        !blocked &&
        accessPending === 0 &&
        !tinyBody &&
        pageErrors.length === 0;

      results.push({
        surface: surface.key,
        viewport: viewport.key,
        requested_path: surface.path,
        final_path: new URL(finalUrl).pathname + new URL(finalUrl).search,
        response_status: responseStatus,
        body_text_length: bodyText.trim().length,
        access_pending: accessPending > 0,
        blocked_or_redirected: blocked,
        navigation_error: navigationError,
        page_errors: pageErrors,
        console_error_count: consoleErrors.length,
        console_errors_sample: consoleErrors.slice(0, 8),
        screenshot,
        passed
      });

      await context.close();
    }
  }
} finally {
  await browser.close();
}

const failed = results.filter(result => !result.passed);
const evidence = {
  release_version: process.env.GITHUB_SHA || 'unknown',
  environment: 'staging-local-hosted-render',
  staging_project_ref: projectRef,
  checked_at: new Date().toISOString(),
  surfaces: surfaces.map(item => item.key),
  viewports: viewports.map(item => ({ key: item.key, width: item.width, height: item.height })),
  checks: results,
  passed: failed.length === 0
};

await writeFile(path.join(evidenceDir, 'visual-acceptance-evidence.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');

if (failed.length) {
  console.error(`Visual acceptance failed for ${failed.length}/${results.length} checks.`);
  for (const result of failed) console.error(`- ${result.viewport}/${result.surface}: ${JSON.stringify(result)}`);
  process.exit(1);
}

console.log(`Visual acceptance passed for all ${results.length} authenticated desktop/mobile checks.`);
