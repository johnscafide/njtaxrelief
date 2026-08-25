const CANONICAL_HOST = 'www.watchdogindex.com';
const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;
const LEGACY_HOSTS = new Set(['njpropertytaxrelief.com', 'www.njpropertytaxrelief.com']);

const SOURCE_SITEMAPS = [
  '/property/sitemap.xml',
  '/sitemap-content.xml',
  '/sitemap-plays.xml',
  '/sitemap-glossary.xml',
  '/sitemap-professionals.xml',
  '/sitemap-homeowners.xml',
  '/sitemap-insights.xml'
];

const PRIVATE_PREFIXES = [
  '/account',
  '/agent-control',
  '/agent-desk',
  '/analytics',
  '/backoffice',
  '/compare',
  '/dashboard',
  '/data-center',
  '/data-workbench',
  '/developer',
  '/developer-data',
  '/diagnostics',
  '/farm-builder',
  '/growth',
  '/home',
  '/insights/admin',
  '/integrations',
  '/intelligence',
  '/logs',
  '/marketing-studio',
  '/newsletter-studio',
  '/onboarding',
  '/report-builder',
  '/watchlist',
  '/whitepapers',
  '/workbench'
];

const CURATED_PUBLIC_ROUTES = [
  { path: '/', lastmod: '2026-08-22', changefreq: 'daily', priority: '1.0' },
  { path: '/fairness', lastmod: '2026-08-22', changefreq: 'monthly', priority: '0.85' },
  { path: '/town-compare', lastmod: '2026-08-22', changefreq: 'monthly', priority: '0.82' },
  { path: '/professionals', lastmod: '2026-08-22', changefreq: 'monthly', priority: '0.82' },
  { path: '/real-estate-agents', lastmod: '2026-08-22', changefreq: 'monthly', priority: '0.78' },
  { path: '/home-inspectors', lastmod: '2026-08-22', changefreq: 'monthly', priority: '0.76' },
  { path: '/insights', lastmod: '2026-08-22', changefreq: 'daily', priority: '0.82' },
  { path: '/alternatives/propstream', lastmod: '2026-08-25', changefreq: 'monthly', priority: '0.80' },
  { path: '/alternatives/propertyradar', lastmod: '2026-08-25', changefreq: 'monthly', priority: '0.80' },
  { path: '/alternatives/batchdata', lastmod: '2026-08-25', changefreq: 'monthly', priority: '0.80' },
  { path: '/alternatives/attom', lastmod: '2026-08-25', changefreq: 'monthly', priority: '0.80' },
  { path: '/alternatives/regrid', lastmod: '2026-08-25', changefreq: 'monthly', priority: '0.80' },
  { path: '/alternatives/propertyshark', lastmod: '2026-08-25', changefreq: 'monthly', priority: '0.80' },
  { path: '/alternatives/zillow', lastmod: '2026-08-25', changefreq: 'monthly', priority: '0.80' },
  { path: '/alternatives/nj-county-board-lookup', lastmod: '2026-08-25', changefreq: 'monthly', priority: '0.80' },
  { path: '/pricing/propstream', lastmod: '2026-08-25', changefreq: 'monthly', priority: '0.80' },
  { path: '/pricing/propertyradar', lastmod: '2026-08-25', changefreq: 'monthly', priority: '0.80' },
  { path: '/pricing/propertyshark', lastmod: '2026-08-25', changefreq: 'monthly', priority: '0.80' },
  { path: '/pricing/attom', lastmod: '2026-08-25', changefreq: 'monthly', priority: '0.80' },
  { path: '/pricing/regrid', lastmod: '2026-08-25', changefreq: 'monthly', priority: '0.80' },
  { path: '/guides/best-nj-property-data-tools', lastmod: '2026-08-25', changefreq: 'monthly', priority: '0.82' },
  { path: '/guides/best-property-tax-appeal-software', lastmod: '2026-08-25', changefreq: 'monthly', priority: '0.82' },
  { path: '/guides/nj-property-records-lookup-free-paid', lastmod: '2026-08-25', changefreq: 'monthly', priority: '0.80' },
  { path: '/property-tax-estimator', lastmod: '2026-08-24', changefreq: 'monthly', priority: '0.80' },
  { path: '/home-buying-cost-calculator', lastmod: '2026-08-24', changefreq: 'monthly', priority: '0.80' },
  { path: '/appeal-savings-estimator', lastmod: '2026-08-24', changefreq: 'monthly', priority: '0.80' },
  { path: '/rent-property-tax-calculator', lastmod: '2026-08-24', changefreq: 'monthly', priority: '0.76' },
  { path: '/senior-benefit-estimator', lastmod: '2026-08-24', changefreq: 'monthly', priority: '0.82' },
  { path: '/nj-property-tax-calendar', lastmod: '2026-08-24', changefreq: 'monthly', priority: '0.84' },
  { path: '/pro', lastmod: '2026-08-22', changefreq: 'monthly', priority: '0.78' },
  { path: '/trust', lastmod: '2026-08-22', changefreq: 'monthly', priority: '0.72' },
  { path: '/robust', lastmod: '2026-08-22', changefreq: 'monthly', priority: '0.86' },
  { path: '/robust/recourse', lastmod: '2026-08-22', changefreq: 'monthly', priority: '0.72' },
  { path: '/robust/overassessment-position', lastmod: '2026-08-22', changefreq: 'monthly', priority: '0.72' },
  { path: '/robust/burden', lastmod: '2026-08-22', changefreq: 'monthly', priority: '0.72' },
  { path: '/robust/uniformity', lastmod: '2026-08-22', changefreq: 'monthly', priority: '0.72' },
  { path: '/robust/stability', lastmod: '2026-08-22', changefreq: 'monthly', priority: '0.72' },
  { path: '/robust/trajectory', lastmod: '2026-08-22', changefreq: 'monthly', priority: '0.72' }
];

function requestHost(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');
}

function deploymentOrigins() {
  const candidates = [process.env.VERCEL_PROJECT_PRODUCTION_URL, 'njtaxrelief.vercel.app', process.env.VERCEL_URL];
  const seen = new Set();
  const origins = [];

  for (const raw of candidates) {
    if (!raw) continue;
    const host = String(raw).trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
    if (!host || host.toLowerCase() === CANONICAL_HOST || seen.has(host)) continue;
    seen.add(host);
    origins.push(`https://${host}`);
  }
  return origins;
}

function xmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlUnescape(value) {
  return String(value == null ? '' : value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function cleanPublicPath(pathname) {
  let path = String(pathname || '/').replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  if (path === '/property') path = '/';
  else if (path.startsWith('/property/')) path = path.slice('/property'.length) || '/';
  path = path.replace(/\/index\.html$/i, '');
  path = path.replace(/\.html$/i, '');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path || '/';
}

function isPrivatePath(pathname) {
  return PRIVATE_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function normalizeLoc(rawLoc) {
  try {
    const url = new URL(xmlUnescape(rawLoc));
    const host = url.hostname.toLowerCase();
    const wasLegacy = LEGACY_HOSTS.has(host);
    const wasWatchdog = host === CANONICAL_HOST || host === 'watchdogindex.com';
    if (!wasLegacy && !wasWatchdog) return null;

    if (wasLegacy && url.pathname !== '/property' && !url.pathname.startsWith('/property/')) return null;

    const path = cleanPublicPath(url.pathname);
    if (isPrivatePath(path)) return null;
    return `${CANONICAL_ORIGIN}${path === '/' ? '/' : path}`;
  } catch (_error) {
    return null;
  }
}

function tag(block, name) {
  const match = String(block || '').match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? xmlUnescape(match[1].trim()) : '';
}

function parseSitemap(xml) {
  const rows = [];
  const blocks = String(xml || '').match(/<url>[\s\S]*?<\/url>/gi) || [];
  for (const block of blocks) {
    const loc = normalizeLoc(tag(block, 'loc'));
    if (!loc) continue;
    rows.push({
      loc,
      lastmod: tag(block, 'lastmod'),
      changefreq: tag(block, 'changefreq'),
      priority: tag(block, 'priority')
    });
  }
  return rows;
}

function addRow(map, row) {
  if (!row || !row.loc) return;
  const existing = map.get(row.loc);
  if (!existing) {
    map.set(row.loc, row);
    return;
  }
  if (row.lastmod && (!existing.lastmod || row.lastmod > existing.lastmod)) existing.lastmod = row.lastmod;
  if (!existing.changefreq && row.changefreq) existing.changefreq = row.changefreq;
  if (!existing.priority && row.priority) existing.priority = row.priority;
}

async function fetchSource(pathname) {
  for (const origin of deploymentOrigins()) {
    try {
      const response = await fetch(`${origin}${pathname}`, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'User-Agent': 'WatchdogIndexSitemap/1.0', Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.2' },
        signal: AbortSignal.timeout(5000)
      });
      if (response.ok) return await response.text();
    } catch (error) {
      console.warn('WATCHDOG_SITEMAP_SOURCE_FAILED', pathname, String(error?.message || error));
    }
  }
  return '';
}

function renderXml(rows) {
  const items = rows.map(row => {
    const parts = ['  <url>', `    <loc>${xmlEscape(row.loc)}</loc>`];
    if (row.lastmod) parts.push(`    <lastmod>${xmlEscape(row.lastmod)}</lastmod>`);
    if (row.changefreq) parts.push(`    <changefreq>${xmlEscape(row.changefreq)}</changefreq>`);
    if (row.priority) parts.push(`    <priority>${xmlEscape(row.priority)}</priority>`);
    parts.push('  </url>');
    return parts.join('\n');
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join('\n')}\n</urlset>\n`;
}

module.exports = async function handler(req, res) {
  if (requestHost(req) !== CANONICAL_HOST) {
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'no-store');
    return res.end('Not found');
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.setHeader('Cache-Control', 'no-store');
    return res.end('Method not allowed');
  }

  const byLoc = new Map();
  const sourceResults = await Promise.all(SOURCE_SITEMAPS.map(fetchSource));
  for (const xml of sourceResults) {
    for (const row of parseSitemap(xml)) addRow(byLoc, row);
  }

  for (const item of CURATED_PUBLIC_ROUTES) {
    addRow(byLoc, {
      loc: `${CANONICAL_ORIGIN}${item.path === '/' ? '/' : item.path}`,
      lastmod: item.lastmod,
      changefreq: item.changefreq,
      priority: item.priority
    });
  }

  const rows = Array.from(byLoc.values()).sort((a, b) => {
    if (a.loc === `${CANONICAL_ORIGIN}/`) return -1;
    if (b.loc === `${CANONICAL_ORIGIN}/`) return 1;
    return a.loc.localeCompare(b.loc);
  });

  const xml = renderXml(rows);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600');
  res.setHeader('Vary', 'Host');
  if (req.method === 'HEAD') return res.end();
  return res.end(xml);
};