/* /sitemap-properties.xml: published property pages, newest first.

   A property is published the first time someone searches it (see
   api/watchdog-property-page.js). New pages show up here within the hour,
   so search engines pick them up on their next sitemap fetch. */

const CANONICAL_HOST = 'www.watchdogindex.com';
const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;
const MAX_URLS = 50000;

function requestHost(req) {
  return String((req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
}

const xmlEscape = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function lastmod(value) {
  const d = new Date(value || '');
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function renderXml(rows) {
  const items = rows
    .filter((row) => row && typeof row.path === 'string' && /^\/nj\/[a-z0-9-]+\/[a-z0-9-]+$/.test(row.path))
    .map((row) => {
      const mod = lastmod(row.lastmod);
      return `  <url>\n    <loc>${xmlEscape(CANONICAL_ORIGIN + row.path)}</loc>${mod ? `\n    <lastmod>${mod}</lastmod>` : ''}\n    <changefreq>monthly</changefreq>\n  </url>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join('\n')}${items.length ? '\n' : ''}</urlset>\n`;
}

async function fetchRows() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('property data unavailable');
  const r = await fetch(`${url}/rest/v1/rpc/list_public_property_pages`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ p_limit: MAX_URLS, p_offset: 0 }),
    signal: AbortSignal.timeout(8000)
  });
  if (!r.ok) throw new Error(`list_public_property_pages http ${r.status}`);
  const data = await r.json().catch(() => null);
  return Array.isArray(data) ? data : [];
}

async function handler(req, res) {
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
  let rows;
  try {
    rows = await fetchRows();
  } catch (err) {
    console.error('watchdog-property-sitemap', err && err.message || err);
    res.statusCode = 503;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Retry-After', '300');
    return res.end('Try again later');
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method === 'HEAD') return res.end();
  return res.end(renderXml(rows));
}

module.exports = handler;
module.exports.renderXml = renderXml;
