const ENDPOINTS = [
  'intelligence-learning',
  'intelligence-learning-admin'
];
const ORIGINS = [
  'https://watchdogindex.com',
  'https://www.watchdogindex.com'
];
const SUPABASE = 'https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });

  const checks = [];
  for (const endpoint of ENDPOINTS) {
    for (const origin of ORIGINS) {
      try {
        const response = await fetch(SUPABASE + endpoint, {
          method: 'OPTIONS',
          headers: {
            Origin: origin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'authorization, apikey, content-type'
          }
        });
        const allowOrigin = response.headers.get('access-control-allow-origin') || '';
        const allowMethods = response.headers.get('access-control-allow-methods') || '';
        const allowHeaders = response.headers.get('access-control-allow-headers') || '';
        const vary = response.headers.get('vary') || '';
        checks.push({
          endpoint,
          origin,
          status: response.status,
          allow_origin: allowOrigin,
          allow_methods: allowMethods,
          allow_headers: allowHeaders,
          vary,
          pass: response.ok && allowOrigin === origin && /(^|,|\s)POST(,|\s|$)/i.test(allowMethods) && /authorization/i.test(allowHeaders) && /origin/i.test(vary)
        });
      } catch (error) {
        checks.push({ endpoint, origin, pass: false, error: String(error && error.message || error) });
      }
    }
  }

  const ok = checks.length === ENDPOINTS.length * ORIGINS.length && checks.every((check) => check.pass);
  return res.status(ok ? 200 : 502).json({
    ok,
    tested_from: 'watchdogindex-production-vercel',
    preflight_contract: 'OPTIONS + Origin + Access-Control-Request-Method: POST',
    checks
  });
};
