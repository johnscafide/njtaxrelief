// /listings and /listings/<slug> on www.watchdogindex.com: the team's homes on the market.
// middleware.js rewrites those clean URLs here with ?slug=&status=. HTML comes from
// api/_team-listings-pages.js; rows from team_listings (service role, published rows only).
// A listing linked to a parcel (pams_pin) also gets that home's Watchdog record for the
// "From Watchdog" box, from the same RPC the property pages use.
const L = require('./_team-listings-pages');

const SLUG = /^[a-z0-9-]{3,120}$/;
const FIELDS = 'slug,mls_number,status,address,unit,city,state,zip,county,price,beds,baths_full,baths_half,sqft,lot,year_built,property_type,style,annual_tax,school_district,subdivision,remarks,features,photos,list_date,agent_name,brokerage,created_at';
const PIN = /^\d{4}_[0-9A-Za-z.&_-]{1,70}$/;

function send(res, status, html, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'public, max-age=60, s-maxage=120, stale-while-revalidate=600');
  return res.end(html);
}

function db() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' } } : null;
}

async function rows(query, fields) {
  const d = db();
  if (!d) return [];
  const r = await fetch(`${d.url}/rest/v1/team_listings?select=${fields || FIELDS + ',pams_pin'}&published=eq.true&${query}`, { headers: d.headers });
  // Before the parcel column exists, fall back to the listing alone.
  if (r.status === 400 && !fields) return rows(query, FIELDS);
  if (!r.ok) { console.error('team-listings-page', r.status); return []; }
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

async function home(pin) {
  const d = db();
  if (!d || !PIN.test(String(pin || ''))) return null;
  try {
    const r = await fetch(`${d.url}/rest/v1/rpc/get_public_property_page`, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, d.headers),
      body: JSON.stringify({ p_pin: pin }),
      signal: AbortSignal.timeout(4000)
    });
    const data = r.ok ? await r.json() : null;
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch (error) {
    console.error('team-listings-page home', error && error.message);
    return null;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return send(res, 405, 'Method not allowed', 'no-store');
  }
  const q = req.query || {};
  const slug = String(q.slug || '').toLowerCase();
  try {
    if (slug) {
      if (!SLUG.test(slug)) return send(res, 404, L.missingPage());
      const l = (await rows(`slug=eq.${encodeURIComponent(slug)}&limit=1`))[0];
      if (!l) return send(res, 404, L.missingPage());
      if (!L.LIVE.includes(l.status)) res.setHeader('X-Robots-Tag', 'noindex, follow');
      return send(res, 200, L.listingPage(l, await home(l.pams_pin)));
    }
    const status = L.LIVE.includes(String(q.status || '')) ? String(q.status) : '';
    const live = await rows(`status=in.(${L.LIVE.join(',')})&order=created_at.desc&limit=200`);
    return send(res, 200, L.indexPage(live, status));
  } catch (error) {
    console.error('team-listings-page', error && error.message);
    return send(res, 500, L.missingPage(), 'no-store');
  }
};
