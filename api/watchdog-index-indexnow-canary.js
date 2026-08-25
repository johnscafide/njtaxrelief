const CANONICAL_HOST = 'www.watchdogindex.com';
const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;
const INDEXNOW_KEY = '01ac3ca151cb7513bdda555fac7e5469';
const INDEXNOW_KEY_LOCATION = `${CANONICAL_ORIGIN}/${INDEXNOW_KEY}.txt`;
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const CANARY_URLS = [
  `${CANONICAL_ORIGIN}/alternatives/batchdata`,
  `${CANONICAL_ORIGIN}/alternatives/attom`,
  `${CANONICAL_ORIGIN}/alternatives/regrid`,
  `${CANONICAL_ORIGIN}/alternatives/propertyshark`
];

function requestHost(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (requestHost(req) !== CANONICAL_HOST) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ ok: false, error: 'not_found' }));
  }
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    return res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
  }

  try {
    const keyResponse = await fetch(INDEXNOW_KEY_LOCATION, {
      headers: { 'User-Agent': 'WatchdogIndexNowCanary/1.0', Accept: 'text/plain' },
      signal: AbortSignal.timeout(10000)
    });
    const keyBody = await keyResponse.text();
    if (!keyResponse.ok || keyBody.trim() !== INDEXNOW_KEY) {
      res.statusCode = 502;
      return res.end(JSON.stringify({ ok: false, error: 'key_verification_failed', keyStatus: keyResponse.status }));
    }

    const upstream = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': 'WatchdogIndexNowCanary/1.0'
      },
      body: JSON.stringify({
        host: CANONICAL_HOST,
        key: INDEXNOW_KEY,
        keyLocation: INDEXNOW_KEY_LOCATION,
        urlList: CANARY_URLS
      }),
      signal: AbortSignal.timeout(15000)
    });
    const body = await upstream.text();
    const accepted = upstream.status === 200 || upstream.status === 202;
    res.statusCode = accepted ? 200 : 502;
    return res.end(JSON.stringify({
      ok: accepted,
      upstreamStatus: upstream.status,
      urls: CANARY_URLS,
      upstreamBody: body.slice(0, 500)
    }));
  } catch (error) {
    res.statusCode = 502;
    return res.end(JSON.stringify({ ok: false, error: String(error?.message || error) }));
  }
};
