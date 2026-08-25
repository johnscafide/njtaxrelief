const CANONICAL_HOST = 'www.watchdogindex.com';
const INDEXNOW_KEY = 'c04eb5246cd74475b86188f12c31e21b';
const INDEXNOW_KEY_PATH = `/${INDEXNOW_KEY}.txt`;

function requestHost(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');
}

function handler(req, res) {
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

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
  res.setHeader('Vary', 'Host');
  if (req.method === 'HEAD') return res.end();
  return res.end(`${INDEXNOW_KEY}\n`);
}

handler.INDEXNOW_KEY = INDEXNOW_KEY;
handler.INDEXNOW_KEY_PATH = INDEXNOW_KEY_PATH;
handler.CANONICAL_HOST = CANONICAL_HOST;

module.exports = handler;
