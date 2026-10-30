// /links/<slug>: a public link page made in Backoffice (/backoffice/link-pages).
// middleware.js rewrites the clean URL here with ?slug=. GET draws the page with
// link-page-render.js. POST { slug, item } counts a view (item '') or a tap on a link,
// sent by the page itself with sendBeacon.
const fs = require('fs');
const path = require('path');
const LP = require('../property/backoffice/link-pages/link-page-render.js');

const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|curl|wget|python|headless|lighthouse/i;

function db() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json', 'Content-Type': 'application/json' } } : null;
}

// John's story comment, copied from the /co page so it stays word for word.
let story = null;
function johnsStory() {
  if (story !== null) return story;
  try {
    const m = fs.readFileSync(path.join(process.cwd(), 'co', 'index.html'), 'utf8').match(/<!--\s*\n\s*\n\s*Hi There[\s\S]*?-->/);
    story = m ? m[0] + '\n' : '';
  } catch (_) { story = ''; }
  return story;
}

function missing() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f0e6;color:#0b1b33;font:500 17px/1.5 system-ui,sans-serif;text-align:center;padding:16px}a{color:#0b1b33;font-weight:700}</style></head><body><main><h1 style="font-size:24px">This link page isn’t here.</h1><p><a href="https://www.watchdogindex.com/">Go to Watchdog</a></p></main></body></html>`;
}

function send(res, status, html, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'public, max-age=0, s-maxage=30, stale-while-revalidate=300');
  return res.end(html);
}

async function hit(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body && typeof body === 'object' ? body : {};
  const slug = String(body.slug || '').toLowerCase();
  const item = String(body.item || '');
  const d = db();
  if (d && LP.SLUG.test(slug) && /^[a-z0-9]{0,12}$/.test(item) && !BOTS.test(String(req.headers['user-agent'] || 'bot'))) {
    await fetch(`${d.url}/rest/v1/rpc/link_page_hit`, { method: 'POST', headers: d.headers, body: JSON.stringify({ p_slug: slug, p_item: item }), signal: AbortSignal.timeout(3000) }).catch(() => {});
  }
  res.statusCode = 204;
  return res.end();
}

module.exports = async (req, res) => {
  if (req.method === 'POST') return hit(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, POST');
    return send(res, 405, 'Method not allowed', 'no-store');
  }
  const slug = String((req.query || {}).slug || '').toLowerCase();
  const d = db();
  if (!LP.SLUG.test(slug) || !d) return send(res, 404, missing());
  try {
    const r = await fetch(`${d.url}/rest/v1/link_pages?select=slug,content&published=eq.true&slug=eq.${encodeURIComponent(slug)}&limit=1`, { headers: d.headers });
    const row = r.ok ? (await r.json())[0] : null;
    if (!row) return send(res, 404, missing());
    // The saved content was checked on save; checking again keeps old rows safe if the rules change.
    const page = LP.cleanPage(row.content, (u) => typeof u === 'string' && u.startsWith(`${d.url}/storage/v1/object/public/link-page-photos/`)).page;
    return send(res, 200, LP.renderPage(page, { slug: row.slug, story: johnsStory() }));
  } catch (error) {
    console.error('link-page', error && error.message);
    return send(res, 500, missing(), 'no-store');
  }
};
