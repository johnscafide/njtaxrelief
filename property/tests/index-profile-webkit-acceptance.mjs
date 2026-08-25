#!/usr/bin/env node
import { webkit } from 'playwright';

const baseUrl = String(process.env.VISUAL_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const supabaseUrl = String(process.env.STAGING_SUPABASE_URL || '').replace(/\/$/, '');
const supabaseKey = String(process.env.STAGING_SUPABASE_PUBLISHABLE_KEY || '');
const email = String(process.env.WATCHDOG_TEST_DEVELOPER_EMAIL || '');
const password = String(process.env.WATCHDOG_TEST_DEVELOPER_PASSWORD || '');
const productionProjectRef = ['uvkva', 'xljhhng', 'ydvlrzom'].join('');

if (!supabaseUrl || !supabaseKey || !email || !password) {
  throw new Error('Staging Supabase URL/key and Developer test credentials are required.');
}
if (new RegExp(productionProjectRef, 'i').test(supabaseUrl)) {
  throw new Error('Refusing WebKit profile acceptance against production Supabase.');
}

const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
const storageKey = `sb-${projectRef}-auth-token`;

async function signIn() {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: supabaseKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.access_token || !body?.user?.id) {
    throw new Error(`Developer staging login failed: ${response.status}`);
  }
  return body;
}

const session = await signIn();
const browser = await webkit.launch({ headless: true });

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error?.message || error)));

  await page.addInitScript(({ key, authSession }) => {
    localStorage.setItem(key, JSON.stringify(authSession));
  }, { key: storageKey, authSession: session });

  const response = await page.goto(`${baseUrl}/property/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  if (response && response.status() >= 400) throw new Error(`Index returned ${response.status()}.`);
  await page.waitForTimeout(2500);

  const trigger = page.locator('#wd-profile-trigger');
  await trigger.waitFor({ state: 'visible', timeout: 10000 });
  await trigger.tap({ timeout: 10000 });

  const sheet = page.locator('#wd-profile-sheet.open');
  await sheet.waitFor({ state: 'visible', timeout: 10000 });

  const developerLink = sheet.locator('[data-wd-developer-tool="developer"]').first();
  await developerLink.waitFor({ state: 'visible', timeout: 10000 });
  await developerLink.scrollIntoViewIfNeeded();

  const hit = await developerLink.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2));
    const y = Math.max(0, Math.min(innerHeight - 1, rect.top + Math.min(rect.height / 2, 24)));
    const target = document.elementFromPoint(x, y);
    return {
      tag: target?.tagName || null,
      id: target?.id || null,
      className: typeof target?.className === 'string' ? target.className : null,
      owned: !!target && (target === el || el.contains(target))
    };
  });
  if (!hit.owned) throw new Error(`WebKit hit target is outside profile link: ${JSON.stringify(hit)}`);

  const href = await developerLink.getAttribute('href');
  if (!href) throw new Error('Developer profile link has no href.');

  await Promise.all([
    page.waitForURL(url => /\/property\/developer\/?(?:$|[?#])/.test(url.pathname + url.search + url.hash), { timeout: 15000 }),
    developerLink.tap({ timeout: 10000 })
  ]);

  if (pageErrors.length) throw new Error(`WebKit page errors: ${pageErrors.join(' | ')}`);
  console.log(JSON.stringify({ passed: true, engine: 'webkit', viewport: '390x844', href, finalPath: new URL(page.url()).pathname, hit }));
  await context.close();
} finally {
  await browser.close();
}
