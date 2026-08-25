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
const productionProjectRef = ['uvkva', 'xljhhng', 'ydvlrzom'].join('');

if (!supabaseUrl || !supabaseKey || !email || !password) {
  throw new Error('Staging Supabase URL/key and Developer test credentials are required.');
}
if (new RegExp(productionProjectRef, 'i').test(supabaseUrl)) {
  throw new Error('Refusing visual acceptance against production Supabase.');
}

const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
const storageKey = `sb-${projectRef}-auth-token`;

const surfaces = [
  { key: 'index', path: '/property/' },
  { key: 'dashboard', path: '/property/dashboard/' },
  { key: 'home', path: '/property/home/' },
  { key: 'agent-control', path: '/property/agent-desk/' },
  { key: 'data-workbench', path: '/property/data-workbench/' },
  { key: 'calibration-admin', path: '/property/intelligence/calibration/' },
  { key: 'appeal-scanner', path: '/property/scan/' },
  { key: 'account', path: '/property/account/' },
  { key: 'support', path: '/property/support/' },
  { key: 'status', path: '/property/status/' }
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

async function verifyPublicProfileInteraction(page, viewportKey) {
  const trigger = page.locator('#wd-profile-trigger');
  await trigger.waitFor({ state: 'visible', timeout: 10000 });
  await trigger.click();

  const sheet = page.locator('#wd-profile-sheet.open');
  await sheet.waitFor({ state: 'visible', timeout: 10000 });
  const developerLink = sheet.locator('[data-wd-developer-tool="developer"]').first();
  await developerLink.waitFor({ state: 'visible', timeout: 10000 });
  await developerLink.scrollIntoViewIfNeeded();

  const hitTest = await developerLink.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(window.innerWidth - 1, rect.left + rect.width / 2));
    const y = Math.max(0, Math.min(window.innerHeight - 1, rect.top + Math.min(rect.height / 2, 24)));
    const hit = document.elementFromPoint(x, y);
    return {
      x,
      y,
      hit_tag: hit?.tagName || null,
      hit_id: hit?.id || null,
      hit_class: typeof hit?.className === 'string' ? hit.className : null,
      owned_by_link: !!hit && (hit === el || el.contains(hit))
    };
  });
  if (!hitTest.owned_by_link) {
    throw new Error(`Profile link is not topmost at its click point: ${JSON.stringify(hitTest)}`);
  }

  const openScreenshot = `${viewportKey}-index-profile-open.png`;
  await page.screenshot({ path: path.join(evidenceDir, openScreenshot), fullPage: true });
  const href = await developerLink.getAttribute('href');
  if (!href) throw new Error('Developer Command Center profile link has no href.');

  await developerLink.click({ timeout: 10000 });
  await page.waitForURL(url => /\/property\/developer\/?(?:$|[?#])/.test(url.pathname + url.search + url.hash), { timeout: 15000 });
  return {
    opened: true,
    hit_test: hitTest,
    href,
    navigated_to: new URL(page.url()).pathname,
    screenshot: openScreenshot,
    passed: true
  };
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
      let profileInteraction = null;
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        responseStatus = response?.status() ?? null;
        await page.waitForTimeout(3000);
        if (surface.key === 'index') {
          try {
            profileInteraction = await verifyPublicProfileInteraction(page, viewport.key);
          } catch (error) {
            profileInteraction = { passed: false, error: cleanMessage(error?.message || error) };
          }
        }
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

      const genericSurfaceReady = !blocked && accessPending === 0 && !tinyBody;
      const passed = !navigationError &&
        (responseStatus === null || responseStatus < 400) &&
        pageErrors.length === 0 &&
        (surface.key === 'index' ? profileInteraction?.passed === true : genericSurfaceReady);

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
        profile_interaction: profileInteraction,
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

console.log(`Visual acceptance passed for all ${results.length} authenticated desktop/mobile checks, including a real public profile-menu click-through.`);
