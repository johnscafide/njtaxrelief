const CANONICAL_HOST = 'www.watchdogindex.com';
const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;
const PRIVATE_ROUTES = [
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

function requestHost(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');
}

function privateRouteRules() {
  const rules = [];
  for (const route of PRIVATE_ROUTES) {
    // Use an end anchor for the exact route so a private app path such as
    // /home does not accidentally block public pages such as
    // /home-buying-cost-calculator or /home-inspectors.
    rules.push(`Disallow: ${route}$`);
    rules.push(`Disallow: ${route}/`);
    rules.push(`Disallow: ${route}?`);
  }
  return rules;
}

module.exports = function handler(req, res) {
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

  const body = [
    '# robots.txt — Watchdog',
    '# Canonical public host: www.watchdogindex.com',
    '# Public search and answer-engine discovery stays open. Private/member/developer application routes are excluded.',
    '# Model-training permissions for public Watchdog content are not changed by this crawl-boundary update.',
    '',
    'User-agent: OAI-SearchBot',
    'User-agent: PerplexityBot',
    'User-agent: Claude-SearchBot',
    'User-agent: Claude-User',
    'User-agent: Applebot',
    'User-agent: Bingbot',
    'User-agent: *',
    'Allow: /',
    ...privateRouteRules(),
    '',
    `Sitemap: ${CANONICAL_ORIGIN}/sitemap.xml`,
    `Sitemap: ${CANONICAL_ORIGIN}/sitemap-alternatives.xml`,
    `Sitemap: ${CANONICAL_ORIGIN}/sitemap-calculators.xml`,
    `Sitemap: ${CANONICAL_ORIGIN}/sitemap-statistics.xml`,
    ''
  ].join('\n');

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600');
  res.setHeader('Vary', 'Host');
  if (req.method === 'HEAD') return res.end();
  return res.end(body);
};
