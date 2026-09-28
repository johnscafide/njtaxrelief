// Watchdog extension background worker. The only network call it makes is to
// Watchdog's own API, with the agent's personal key, for the address of the
// listing the agent is looking at.
const API = 'https://www.watchdogindex.com/api/watchdog-extension';
const cache = new Map();
const TTL = 10 * 60 * 1000;

async function lookup(address) {
  const { key } = await chrome.storage.local.get('key');
  if (!key) return { error: 'no_key' };
  const hit = cache.get(address);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  let value;
  try {
    const r = await fetch(`${API}?address=${encodeURIComponent(address)}`, { headers: { 'x-watchdog-key': key } });
    const body = await r.json().catch(() => ({}));
    value = r.ok ? { ok: true, property: body.property } : { error: r.status === 401 ? 'bad_key' : 'lookup', message: body.error || 'Watchdog could not look this up.' };
  } catch (_) {
    value = { error: 'network', message: 'Watchdog is unreachable. Check your connection.' };
  }
  if (value.ok || value.error === 'lookup') cache.set(address, { at: Date.now(), value });
  return value;
}

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  if (msg && msg.type === 'lookup' && typeof msg.address === 'string' && msg.address.length <= 160) {
    lookup(msg.address).then(send);
    return true;
  }
  if (msg && msg.type === 'key-changed') { cache.clear(); send({ ok: true }); }
  return false;
});
