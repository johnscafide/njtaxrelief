// /co/<county>/<town>, /co/<county>/<town>/print, /co/<county> and /co/website on www.watchdogindex.com.
// middleware.js rewrites those clean URLs here with ?county=&town=&view=. HTML comes from
// api/_co-pages.js; town data from api/_co-town.js.
const T = require('./_co-town');
const P = require('./_co-pages');

const SLUG = /^[a-z0-9-]{1,80}$/;

function send(res, status, html, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
  return res.end(html);
}

module.exports = (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return send(res, 405, 'Method not allowed', 'no-store');
  }
  const q = req.query || {};
  const county = String(q.county || '').toLowerCase();
  const town = String(q.town || '').toLowerCase();
  const view = String(q.view || '');
  if (view === 'website') return send(res, 200, P.websitePage());
  if (!SLUG.test(county) || (town && !SLUG.test(town))) return send(res, 404, P.notFound(false), 'public, max-age=60, s-maxage=300');
  if (!town) {
    const c = T.findCounty(county);
    return c ? send(res, 200, P.countyPage(c)) : send(res, 404, P.notFound(false), 'public, max-age=60, s-maxage=300');
  }
  const t = T.findTown(county, town);
  if (!t) return send(res, 404, P.notFound(false), 'public, max-age=60, s-maxage=300');
  if (view === 'print') {
    const html = P.printPage(t);
    if (!html) { res.statusCode = 307; res.setHeader('Location', t.path); res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300'); return res.end(); }
    res.setHeader('X-Robots-Tag', 'noindex, follow');
    return send(res, 200, html);
  }
  return send(res, 200, P.townPage(t, { mode: 'page', city: q.city }));
};
