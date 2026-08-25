const CANONICAL_HOST = 'www.watchdogindex.com';
const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;

function requestHost(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');
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
    '# Search/discovery crawlers are called out explicitly; model-training controls are not changed here.',
    '',
    'User-agent: OAI-SearchBot',
    'Allow: /',
    '',
    'User-agent: PerplexityBot',
    'Allow: /',
    '',
    'User-agent: Applebot',
    'Allow: /',
    '',
    'User-agent: Bingbot',
    'Allow: /',
    '',
    'User-agent: *',
    'Allow: /',
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
