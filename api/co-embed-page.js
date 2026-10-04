// /co/embed/<county>/<town>: one town inside the embedded CO lookup (an iframe on someone else's
// site, see co/embed.js). Same facts as the town page, compact layout, links open in a new tab.
// Its own route so vercel.json can let this path, and only this path, be framed.
const T = require('./_co-town');
const P = require('./_co-pages');

const SLUG = /^[a-z0-9-]{1,80}$/;

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, follow');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.setHeader('Cache-Control', 'no-store');
    return res.end('Method not allowed');
  }
  const q = req.query || {};
  const county = String(q.county || '').toLowerCase();
  const town = String(q.town || '').toLowerCase();
  const t = SLUG.test(county) && SLUG.test(town) ? T.findTown(county, town) : null;
  res.statusCode = t ? 200 : 404;
  res.setHeader('Cache-Control', t ? 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' : 'public, max-age=60, s-maxage=300');
  return res.end(t ? P.townPage(t, { mode: 'embed', city: q.city }) : P.notFound(true));
};
