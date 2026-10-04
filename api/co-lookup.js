// Public resale CO lookup (/co). Returns one town's person-checked resale Certificate of
// Occupancy and smoke / CO alarm certificate rules, read straight from
// property/data/municipal-requirements/. Only towns approved in approvals.json are returned, the
// same gate the publish step uses, so a town shows up here as soon as it is approved and committed.
// Researcher notes, evidence quotes, open questions and staff names/emails are left out
// (see publicTown in api/_co-town.js, shared with the /co/<county>/<town> pages).
const { townData } = require('./_co-town');

const CODE = /^\d{4}$/;

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.statusCode = 405;
    return res.end(JSON.stringify({ status: 'error' }));
  }
  const code = String((req.query && req.query.code) || '').trim();
  if (!CODE.test(code)) {
    res.statusCode = 400;
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify({ status: 'invalid' }));
  }
  const data = townData(code);
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
  if (!data) return res.end(JSON.stringify({ status: 'not_available', code }));
  return res.end(JSON.stringify(data));
};
