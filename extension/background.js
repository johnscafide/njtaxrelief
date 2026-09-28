// Watchdog extension background worker. The only network call it makes is to
// Watchdog's own API, with the agent's personal key, for the address of the
// listing the agent is looking at.
const API = 'https://www.watchdogindex.com/api/watchdog-extension';
const cache = new Map();
const TTL = 10 * 60 * 1000;

async function lookup(req) {
  const { key } = await chrome.storage.local.get('key');
  if (!key) return { error: 'no_key' };
  const params = new URLSearchParams();
  if (req.pin) params.set('pin', req.pin);
  else {
    params.set('address', req.address);
    if (Number.isFinite(req.lat) && Number.isFinite(req.lon)) { params.set('lat', String(req.lat)); params.set('lon', String(req.lon)); }
  }
  const cacheKey = params.toString();
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  let value;
  try {
    const r = await fetch(`${API}?${cacheKey}`, { headers: { 'x-watchdog-key': key } });
    const body = await r.json().catch(() => ({}));
    value = r.ok ? { ok: true, confident: body.confident !== false, alternatives: body.alternatives || [], property: body.property }
      : { error: r.status === 401 ? 'bad_key' : 'lookup', message: body.error || 'Watchdog could not look this up.', alternatives: body.alternatives || [] };
  } catch (_) {
    value = { error: 'network', message: 'Watchdog is unreachable. Check your connection.' };
  }
  if (value.ok || value.error === 'lookup') cache.set(cacheKey, { at: Date.now(), value });
  return value;
}

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  const okAddress = typeof msg?.address === 'string' && msg.address.length <= 160;
  const okPin = typeof msg?.pin === 'string' && /^\d{4}_[0-9A-Za-z.&_-]{1,70}$/.test(msg.pin);
  if (msg && msg.type === 'lookup' && (okAddress || okPin)) {
    lookup({ pin: okPin ? msg.pin : '', address: okAddress ? msg.address : '', lat: Number(msg.lat), lon: Number(msg.lon) }).then(send);
    return true;
  }
  if (msg && msg.type === 'key-changed') { cache.clear(); send({ ok: true }); }
  return false;
});
