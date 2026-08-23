#!/usr/bin/env node
import { chromium, webkit } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = String(process.env.VISUAL_BASE_URL || 'https://www.watchdogindex.com').replace(/\/$/, '');
const SCOPE = String(process.env.AUDIT_SCOPE || 'critical').toLowerCase();
const EVIDENCE_DIR = process.env.VISUAL_EVIDENCE_DIR || 'global-visual-audit-evidence';
const ENFORCE = /^(1|true|yes)$/i.test(String(process.env.AUDIT_ENFORCE || '0'));
const CAPTURE_ALL = !/^(0|false|no)$/i.test(String(process.env.AUDIT_CAPTURE_SCREENSHOTS || '1'));
const TARGET_PATHS = String(process.env.AUDIT_PATHS || '')
  .split(/[\n,]+/)
  .map(value => normalizePath(value.trim()))
  .filter(Boolean);

const PRIVATE_PREFIXES = [
  '/account', '/agent-control', '/agent-desk', '/analytics', '/backoffice', '/compare', '/dashboard',
  '/data-center', '/data-workbench', '/developer', '/developer-data', '/diagnostics', '/farm-builder',
  '/growth', '/home', '/insights/admin', '/integrations', '/intelligence', '/logs', '/marketing-studio',
  '/newsletter-studio', '/onboarding', '/report-builder', '/watchlist', '/whitepapers', '/workbench'
];

const CRITICAL_ROUTES = [
  '/', '/professionals', '/real-estate-agents', '/mortgage-lenders', '/home-inspectors', '/faq',
  '/data-methodology', '/insights', '/pro', '/robust', '/fairness', '/town-compare', '/trust',
  '/dashboard', '/home', '/account', '/data-center', '/data-workbench', '/agent-desk',
  '/marketing-studio', '/support', '/status'
];

const DEEP_VIEWPORTS = [
  { key: 'mobile-320', engine: 'chromium', width: 320, height: 720, isMobile: true },
  { key: 'mobile-390', engine: 'chromium', width: 390, height: 844, isMobile: true },
  { key: 'mobile-430', engine: 'chromium', width: 430, height: 932, isMobile: true },
  { key: 'tablet-768', engine: 'chromium', width: 768, height: 1024, isMobile: true },
  { key: 'desktop-1440', engine: 'chromium', width: 1440, height: 1000, isMobile: false },
  { key: 'webkit-mobile-390', engine: 'webkit', width: 390, height: 844, isMobile: true }
];

const GLOBAL_VIEWPORTS = [
  { key: 'mobile-390', engine: 'chromium', width: 390, height: 844, isMobile: true },
  { key: 'desktop-1440', engine: 'chromium', width: 1440, height: 1000, isMobile: false },
  { key: 'webkit-mobile-390', engine: 'webkit', width: 390, height: 844, isMobile: true }
];

function normalizePath(value) {
  if (!value) return '';
  try {
    if (/^https?:\/\//i.test(value)) value = new URL(value).pathname;
  } catch (_) {}
  let normalized = String(value).trim().split(/[?#]/)[0] || '/';
  if (!normalized.startsWith('/')) normalized = `/${normalized}`;
  normalized = normalized.replace(/\/{2,}/g, '/');
  normalized = normalized.replace(/\/index\.html$/i, '');
  normalized = normalized.replace(/\.html$/i, '');
  if (normalized.startsWith('/property/')) normalized = normalized.slice('/property'.length) || '/';
  if (normalized === '/property') normalized = '/';
  if (normalized.length > 1) normalized = normalized.replace(/\/+$/, '');
  return normalized || '/';
}

function isPrivateRoute(route) {
  return PRIVATE_PREFIXES.some(prefix => route === prefix || route.startsWith(`${prefix}/`));
}

function routeKey(route) {
  const base = route === '/' ? 'home' : route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'route';
  const hash = createHash('sha1').update(route).digest('hex').slice(0, 8);
  return `${base.slice(0, 70)}-${hash}`;
}

function cleanMessage(value) {
  return String(value || '')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/([?&](?:token|code|key|secret)=)[^&\s]+/gi, '$1[redacted]')
    .slice(0, 700);
}

async function discoverSitemapRoutes() {
  const response = await fetch(`${BASE_URL}/sitemap.xml`, {
    headers: { 'User-Agent': 'WatchdogPlaywrightAudit/1.0', Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.2' },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Sitemap discovery failed: HTTP ${response.status}`);
  const xml = await response.text();
  const paths = [];
  for (const match of xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)) {
    const raw = match[1].trim().replace(/&amp;/g, '&');
    try {
      paths.push(normalizePath(new URL(raw).pathname));
    } catch (_) {}
  }
  return [...new Set(paths.filter(Boolean))];
}

async function discoverRepoIndexRoutes() {
  const root = path.resolve('property');
  const skipped = new Set(['node_modules', 'tests', 'logs', '.git', 'archive', 'archives', 'backup', 'backups', 'tmp']);
  const routes = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    if (entries.some(entry => entry.isFile() && entry.name.toLowerCase() === 'index.html')) {
      const relative = path.relative(root, dir).split(path.sep).filter(Boolean);
      routes.push(normalizePath(`/${relative.join('/')}`));
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || skipped.has(entry.name.toLowerCase())) continue;
      await walk(path.join(dir, entry.name));
    }
  }

  await walk(root);
  return [...new Set(routes.filter(Boolean))];
}

async function resolveRoutes() {
  if (SCOPE === 'targeted') {
    if (!TARGET_PATHS.length) throw new Error('AUDIT_SCOPE=targeted requires AUDIT_PATHS.');
    return TARGET_PATHS.map(route => ({ route, sources: ['targeted'] }));
  }

  if (SCOPE === 'critical') {
    return [...new Set(CRITICAL_ROUTES.map(normalizePath))].map(route => ({ route, sources: ['critical'] }));
  }

  if (!['public', 'all'].includes(SCOPE)) {
    throw new Error(`Unsupported AUDIT_SCOPE=${SCOPE}. Use critical, public, all, or targeted.`);
  }

  const sourceMap = new Map();
  const sitemapRoutes = await discoverSitemapRoutes();
  for (const route of sitemapRoutes) sourceMap.set(route, new Set(['sitemap']));

  if (SCOPE === 'all') {
    const repoRoutes = await discoverRepoIndexRoutes();
    for (const route of repoRoutes) {
      if (!sourceMap.has(route)) sourceMap.set(route, new Set());
      sourceMap.get(route).add('repo-index');
    }
  }

  for (const route of CRITICAL_ROUTES) {
    const normalized = normalizePath(route);
    if (!sourceMap.has(normalized)) sourceMap.set(normalized, new Set());
    sourceMap.get(normalized).add('critical');
  }

  if (!sourceMap.size) throw new Error('No routes were discovered for the global visual audit.');
  return [...sourceMap.entries()]
    .map(([route, sources]) => ({ route, sources: [...sources].sort() }))
    .sort((a, b) => a.route.localeCompare(b.route));
}

function viewportsForScope() {
  return ['critical', 'targeted'].includes(SCOPE) ? DEEP_VIEWPORTS : GLOBAL_VIEWPORTS;
}

async function collectMetrics(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const viewportWidth = window.innerWidth;
    const documentWidth = Math.max(root?.scrollWidth || 0, body?.scrollWidth || 0);
    const overflowPx = Math.max(0, documentWidth - viewportWidth);
    const visible = element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
    };
    const directText = element => Array.from(element.childNodes || [])
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    const tinyText = [];
    for (const element of Array.from(document.body?.querySelectorAll('*') || [])) {
      if (tinyText.length >= 30 || !visible(element)) continue;
      const text = directText(element);
      if (!text) continue;
      const size = Number.parseFloat(getComputedStyle(element).fontSize || '0');
      if (size > 0 && size < 12) {
        tinyText.push({ tag: element.tagName.toLowerCase(), text: text.slice(0, 90), fontSize: size });
      }
    }

    const smallTargets = [];
    const selectors = 'button,a[href],input:not([type="hidden"]),select,textarea,[role="button"],[role="link"]';
    for (const element of Array.from(document.querySelectorAll(selectors))) {
      if (smallTargets.length >= 30 || !visible(element)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 44 || rect.height < 44) {
        const label = (element.getAttribute('aria-label') || element.textContent || element.getAttribute('name') || element.tagName)
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 90);
        smallTargets.push({ tag: element.tagName.toLowerCase(), label, width: Math.round(rect.width), height: Math.round(rect.height) });
      }
    }

    const clippedText = [];
    for (const element of Array.from(document.body?.querySelectorAll('*') || [])) {
      if (clippedText.length >= 20 || !visible(element)) continue;
      const text = directText(element);
      if (!text) continue;
      const style = getComputedStyle(element);
      const horizontallyClipped = element.scrollWidth > element.clientWidth + 2 && ['hidden', 'clip'].includes(style.overflowX);
      const verticallyClipped = element.scrollHeight > element.clientHeight + 2 && ['hidden', 'clip'].includes(style.overflowY);
      const intentionalEllipsis = style.textOverflow === 'ellipsis';
      if ((horizontallyClipped || verticallyClipped) && !intentionalEllipsis) {
        clippedText.push({ tag: element.tagName.toLowerCase(), text: text.slice(0, 90), overflowX: style.overflowX, overflowY: style.overflowY });
      }
    }

    return {
      viewportWidth,
      documentWidth,
      horizontalOverflowPx: overflowPx,
      bodyTextLength: (body?.innerText || '').trim().length,
      tinyText,
      smallTargets,
      clippedText
    };
  });
}

await mkdir(EVIDENCE_DIR, { recursive: true });
const routeRecords = await resolveRoutes();
const viewports = viewportsForScope();
const enginesNeeded = [...new Set(viewports.map(item => item.engine))];
const browserTypes = { chromium, webkit };
const browsers = new Map();
const results = [];

for (const engine of enginesNeeded) {
  browsers.set(engine, await browserTypes[engine].launch({ headless: true }));
}

try {
  for (const viewport of viewports) {
    const browser = browsers.get(viewport.engine);
    for (const record of routeRecords) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.isMobile,
        deviceScaleFactor: 1,
        reducedMotion: 'reduce'
      });
      const traceEnabled = ['critical', 'targeted'].includes(SCOPE);
      if (traceEnabled) await context.tracing.start({ screenshots: true, snapshots: true });
      const page = await context.newPage();
      const pageErrors = [];
      const consoleErrors = [];
      const requestFailures = [];

      page.on('pageerror', error => pageErrors.push(cleanMessage(error?.message || error)));
      page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(cleanMessage(message.text()));
      });
      page.on('requestfailed', request => {
        const url = request.url();
        if (/^(data:|blob:)/i.test(url)) return;
        requestFailures.push(cleanMessage(`${request.failure()?.errorText || 'request failed'} ${url}`));
      });

      const requestedUrl = `${BASE_URL}${record.route === '/' ? '/' : record.route}`;
      let responseStatus = null;
      let navigationError = null;
      try {
        const response = await page.goto(requestedUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        responseStatus = response?.status() ?? null;
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        await page.evaluate(() => document.fonts?.ready).catch(() => {});
        await page.waitForTimeout(250);
      } catch (error) {
        navigationError = cleanMessage(error?.message || error);
      }

      const finalUrl = page.url();
      const metrics = await collectMetrics(page).catch(() => ({
        viewportWidth: viewport.width,
        documentWidth: null,
        horizontalOverflowPx: null,
        bodyTextLength: 0,
        tinyText: [],
        smallTargets: [],
        clippedText: []
      }));
      const privateRoute = isPrivateRoute(record.route);
      const authGated = /(?:\/sign-?in\b|[?&]access=(?:signin|restricted)\b)/i.test(finalUrl) ||
        /sign in required/i.test(await page.locator('body').innerText().catch(() => ''));
      const statusOk = responseStatus === null || responseStatus < 400;
      const publicUnexpectedGate = !privateRoute && authGated;
      const fatalOverflow = Number(metrics.horizontalOverflowPx || 0) > 1;
      const tinyBody = !privateRoute && metrics.bodyTextLength < 40;
      const passed = !navigationError && statusOk && !publicUnexpectedGate && !fatalOverflow && !tinyBody && pageErrors.length === 0;

      const fileBase = `${viewport.key}-${routeKey(record.route)}`;
      let screenshot = null;
      if (CAPTURE_ALL || !passed) {
        screenshot = `${fileBase}.jpg`;
        await page.screenshot({ path: path.join(EVIDENCE_DIR, screenshot), type: 'jpeg', quality: 68, fullPage: true }).catch(() => {});
      }

      let trace = null;
      if (traceEnabled) {
        if (!passed) {
          trace = `${fileBase}-trace.zip`;
          await context.tracing.stop({ path: path.join(EVIDENCE_DIR, trace) }).catch(() => {});
        } else {
          await context.tracing.stop().catch(() => {});
        }
      }

      let finalPath = finalUrl;
      try {
        const parsed = new URL(finalUrl);
        finalPath = parsed.pathname + parsed.search;
      } catch (_) {}

      results.push({
        route: record.route,
        route_sources: record.sources,
        private_route: privateRoute,
        auth_gated: authGated,
        viewport: viewport.key,
        engine: viewport.engine,
        requested_url: requestedUrl,
        final_path: finalPath,
        response_status: responseStatus,
        navigation_error: navigationError,
        page_errors: pageErrors,
        console_error_count: consoleErrors.length,
        console_errors_sample: consoleErrors.slice(0, 8),
        request_failure_count: requestFailures.length,
        request_failures_sample: requestFailures.slice(0, 8),
        horizontal_overflow_px: metrics.horizontalOverflowPx,
        body_text_length: metrics.bodyTextLength,
        tiny_text_count: metrics.tinyText.length,
        tiny_text_sample: metrics.tinyText.slice(0, 12),
        small_touch_target_count: metrics.smallTargets.length,
        small_touch_target_sample: metrics.smallTargets.slice(0, 12),
        clipped_text_count: metrics.clippedText.length,
        clipped_text_sample: metrics.clippedText.slice(0, 12),
        screenshot,
        trace,
        passed
      });

      await context.close();
      process.stdout.write(`${passed ? 'PASS' : 'FAIL'} ${viewport.key} ${record.route}\n`);
    }
  }
} finally {
  await Promise.all([...browsers.values()].map(browser => browser.close().catch(() => {})));
}

const failed = results.filter(item => !item.passed);
const warningChecks = results.filter(item => item.tiny_text_count || item.small_touch_target_count || item.clipped_text_count || item.console_error_count || item.request_failure_count);
const evidence = {
  release_version: process.env.GITHUB_SHA || 'unknown',
  checked_at: new Date().toISOString(),
  base_url: BASE_URL,
  scope: SCOPE,
  enforce: ENFORCE,
  discovered_route_count: routeRecords.length,
  routes: routeRecords,
  viewports,
  check_count: results.length,
  failed_count: failed.length,
  warning_check_count: warningChecks.length,
  checks: results,
  passed: failed.length === 0
};

await writeFile(path.join(EVIDENCE_DIR, 'global-visual-audit.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

const summary = [
  '# Watchdog global Playwright visual audit',
  '',
  `- Scope: **${SCOPE}**`,
  `- Base URL: \`${BASE_URL}\``,
  `- Routes discovered: **${routeRecords.length}**`,
  `- Browser/viewport checks: **${results.length}**`,
  `- Failed checks: **${failed.length}**`,
  `- Checks with advisory warnings: **${warningChecks.length}**`,
  `- Enforcement: **${ENFORCE ? 'on' : 'report-only'}**`,
  '',
  'Hard failures include navigation/HTTP failures, public pages unexpectedly auth-gated, page-level JavaScript errors, empty public renders, and document-level horizontal overflow.',
  'Sub-12px text, sub-44px touch targets, clipped text, console errors, and failed requests are recorded as advisory findings for review.',
  ''
];

if (failed.length) {
  summary.push('## Failures', '', '| Viewport | Route | Status | Overflow | Page errors |', '|---|---|---:|---:|---:|');
  for (const item of failed.slice(0, 80)) {
    summary.push(`| ${item.viewport} | \`${item.route}\` | ${item.response_status ?? 'n/a'} | ${item.horizontal_overflow_px ?? 'n/a'} | ${item.page_errors.length} |`);
  }
  summary.push('');
}

summary.push('## Evidence', '', 'Every audited check is recorded in `global-visual-audit.json`. Screenshots are JPEG to keep full-site artifacts practical; failed deep/targeted checks also include Playwright trace ZIPs that can be opened in Trace Viewer.', '');
await writeFile(path.join(EVIDENCE_DIR, 'summary.md'), `${summary.join('\n')}\n`, 'utf8');

console.log(`Global visual audit complete: ${results.length} checks across ${routeRecords.length} routes; ${failed.length} failed.`);
if (failed.length && ENFORCE) process.exit(1);
