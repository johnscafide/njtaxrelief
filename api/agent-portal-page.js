/* Agent share page with link previews.
   Texting apps and social sites read only the raw HTML, never page scripts,
   so /agent/<slug> is served through here: the static page
   (property/agent/index.html) plus Open Graph / Twitter tags built from the
   same public profile the page shows (official NJREC name, brokerage,
   verified license, headshot). Any failure serves the static page unchanged. */

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;
const CANONICAL_ORIGIN = 'https://www.watchdogindex.com';
const DEFAULT_IMAGE = `${CANONICAL_ORIGIN}/watchdog-social-share-20260913-v3.jpg`;

function origins() {
  const seen = new Set();
  const out = [];
  for (const raw of ['njtaxrelief.vercel.app', process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL]) {
    if (!raw) continue;
    const host = String(raw).trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
    if (!host || host === 'www.watchdogindex.com' || seen.has(host)) continue;
    seen.add(host);
    out.push(`https://${host}`);
  }
  return out;
}

async function staticPage() {
  for (const origin of origins()) {
    try {
      const r = await fetch(`${origin}/property/agent/index.html`, { headers: { Accept: 'text/html', 'User-Agent': 'WatchdogAgentPortalPreview/1.0', ...(process.env.WATCHDOG_INTERNAL_FETCH_KEY ? { 'x-watchdog-internal-fetch': process.env.WATCHDOG_INTERNAL_FETCH_KEY } : {}) }, signal: AbortSignal.timeout(5000) });
      if (!r.ok) continue;
      const html = await r.text();
      if (/<\/head>/i.test(html) && html.includes('id="portal"')) return html;
    } catch (err) {
      console.warn('agent-portal-page source', origin, err && err.message || err);
    }
  }
  return null;
}

async function profileFor(slug) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const r = await fetch(`${url}/rest/v1/rpc/get_public_agent_portal_profile`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ p_slug: slug }),
    signal: AbortSignal.timeout(4000)
  });
  if (!r.ok) return null;
  const p = await r.json().catch(() => null);
  return p && typeof p === 'object' && !Array.isArray(p) ? p : null;
}

const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function previewTags(p, slug) {
  const name = p.licensed_name || p.display_name || 'Your New Jersey real estate professional';
  const title = p.brokerage_name ? `${name} | ${p.brokerage_name}` : `${name} | Watchdog`;
  const license = p.license_number ? `${p.license_verified ? 'Verified ' : ''}New Jersey Real Estate License ${p.license_number}. ` : '';
  const description = `${license}Look up any New Jersey property and send ${name.split(/\s+/)[0]} a question directly.`;
  const photo = /^https:\/\//i.test(String(p.photo_url || '')) ? String(p.photo_url).replace(/=s\d+-c$/, '=s600-c') : '';
  const url = `${CANONICAL_ORIGIN}/agent/${slug}`;
  const image = photo || DEFAULT_IMAGE;
  const lines = [
    `<title>${esc(name)} | Watchdog Property Info</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    '<meta property="og:type" content="profile">',
    '<meta property="og:site_name" content="Watchdog">',
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    `<meta property="og:image:alt" content="${esc(photo ? name : 'Watchdog Property Info across New Jersey')}">`,
    `<meta name="twitter:card" content="${photo ? 'summary' : 'summary_large_image'}">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${esc(image)}">`
  ];
  return lines.join('\n  ');
}

function inject(html, tags) {
  return html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<meta\s+(?:property|name)=["'](?:og:[^"']+|twitter:[^"']+)["'][^>]*>\s*/gi, '')
    .replace(/<\/head>/i, `  ${tags}\n</head>`);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end('Method not allowed');
  }
  const slug = String(req.query && req.query.slug || '').trim().toLowerCase().slice(0, 40);
  const html = await staticPage();
  if (!html) {
    res.statusCode = 302;
    res.setHeader('Location', `/property/agent/index.html?slug=${encodeURIComponent(slug)}`);
    return res.end();
  }
  let out = html;
  if (SLUG_RE.test(slug)) {
    try {
      const p = await profileFor(slug);
      if (p) out = inject(html, previewTags(p, slug));
    } catch (err) {
      console.error('agent-portal-page preview', err && err.message || err);
    }
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=900');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (req.method === 'HEAD') return res.end();
  return res.end(out);
};
