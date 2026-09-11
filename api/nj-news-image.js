'use strict';

const ALLOWED = [
  'njspotlightnews.org','www.njspotlightnews.org','njbiz.com','www.njbiz.com','jerseydigs.com','www.jerseydigs.com','wbgo.org','www.wbgo.org',
  'nj.gov','www.nj.gov','dep.nj.gov','www.njeda.gov','njeda.gov'
];

function allowedHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  return ALLOWED.includes(h) || h.endsWith('.nj.gov');
}
function decode(input) {
  return String(input || '').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
}
function absolute(value, base) {
  try {
    const u = new URL(decode(value), base);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    return u.href;
  } catch (_) { return ''; }
}
function meta(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i')
  ];
  for (const rx of patterns) { const m = html.match(rx); if (m) return m[1]; }
  return '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405; res.setHeader('Allow','GET, HEAD'); return res.end('Method not allowed');
  }
  let target;
  try { target = new URL(String(req.query && req.query.url || '')); } catch (_) { target = null; }
  if (!target || target.protocol !== 'https:' || !allowedHost(target.hostname)) {
    res.statusCode = 400; res.setHeader('Content-Type','application/json; charset=utf-8'); return res.end(JSON.stringify({imageUrl:''}));
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4200);
  let imageUrl = '';
  try {
    const response = await fetch(target.href, {
      redirect:'follow', signal:ctrl.signal,
      headers:{'user-agent':'WatchdogNJNewsVisual/1.0 (+https://www.watchdogindex.com)','accept':'text/html,application/xhtml+xml'}
    });
    if (response.ok && response.headers.get('content-type') && response.headers.get('content-type').includes('text/html')) {
      const html = (await response.text()).slice(0, 650000);
      imageUrl = absolute(meta(html,'og:image:secure_url') || meta(html,'og:image') || meta(html,'twitter:image'), response.url || target.href);
    }
  } catch (_) {
    imageUrl = '';
  } finally { clearTimeout(timer); }
  res.statusCode = 200;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','public, max-age=300, s-maxage=21600, stale-while-revalidate=86400');
  res.setHeader('X-Content-Type-Options','nosniff');
  if (req.method === 'HEAD') return res.end();
  return res.end(JSON.stringify({imageUrl}));
};
