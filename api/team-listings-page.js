// /listings and /listings/<slug> on www.watchdogindex.com: the team's homes on the market.
// middleware.js rewrites those clean URLs here with ?slug=&status=. HTML comes from
// api/_team-listings-pages.js; rows from team_listings (service role, published rows only).
const L = require('./_team-listings-pages');

const SLUG = /^[a-z0-9-]{3,120}$/;
const FIELDS = 'slug,mls_number,status,address,unit,city,state,zip,county,price,beds,baths_full,baths_half,sqft,lot,year_built,property_type,style,annual_tax,school_district,subdivision,remarks,features,photos,list_date,agent_name,brokerage,created_at';

function send(res, status, html, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'public, max-age=60, s-maxage=120, stale-while-revalidate=600');
  return res.end(html);
}

async function rows(query) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const r = await fetch(`${url}/rest/v1/team_listings?select=${FIELDS}&published=eq.true&${query}`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' } });
  if (!r.ok) { console.error('team-listings-page', r.status); return []; }
  const data = await r.json();
  return Array.isArray(data) ? data : [];
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
      return send(res, 200, L.listingPage(l));
    }
    const status = L.LIVE.includes(String(q.status || '')) ? String(q.status) : '';
    const live = await rows(`status=in.(${L.LIVE.join(',')})&order=created_at.desc&limit=200`);
    return send(res, 200, L.indexPage(live, status));
  } catch (error) {
    console.error('team-listings-page', error && error.message);
    return send(res, 500, L.missingPage(), 'no-store');
  }
};
