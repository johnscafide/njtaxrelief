import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Unknown clean URLs on www.watchdogindex.com must get the branded 404, never
// the Vercel login page. The page adapter tries several deployment origins;
// a protected deployment URL redirects to vercel.com/login with a 200, and
// that HTML used to be served as the page (with a 200 status).
const require = createRequire(import.meta.url);
process.env.VERCEL_URL = 'njtaxrelief-abc123-team.vercel.app';
const html = (title) => `<html><head><title>${title}</title></head><body>page</body></html>`;
global.fetch = async (u) => {
  const host = new URL(u).host;
  if (host === 'njtaxrelief.vercel.app') {
    if (u.includes('/property/games')) return { ok: true, status: 200, url: u, headers: { get: () => 'text/html' }, text: async () => html('Games') };
    return { ok: false, status: 404, url: u, headers: { get: () => 'text/html' }, text: async () => 'Not found' };
  }
  return { ok: true, status: 200, url: 'https://vercel.com/login?next=%2Fsso-api', redirected: true, headers: { get: () => 'text/html' }, text: async () => html('Login – Vercel') };
};
const adapter = require('../../api/watchdog-index-page.js');
const run = (path) => new Promise((resolve) => {
  const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { resolve({ status: this.statusCode, body: String(body || '') }); } };
  adapter({ method: 'GET', headers: { host: 'www.watchdogindex.com' }, query: { path } }, res);
});

const missing = await run('/this-page-does-not-exist');
assert.equal(missing.status, 404, 'an unknown clean URL is a 404');
assert.ok(!/vercel/i.test(missing.body), 'the Vercel login page is never served as a Watchdog page');
const found = await run('/games');
assert.equal(found.status, 200, 'real pages still load');
assert.match(found.body, /<title>Games<\/title>/);

const guard = require('fs').readFileSync('api/watchdog-index-page-contact-safe.js', 'utf8');
assert.match(guard, /function looksLikeVercelAuth[\s\S]*<title/, 'the contact-safe guard also checks the page title');
// Every 404 surface shows the dashboard beagle peeking over the card.
const fs = require('fs');
const staticPage = fs.readFileSync('404.html', 'utf8');
for (const [name, source] of [['404.html', staticPage], ['watchdog-index-page-contact-safe', guard]]) {
  assert.match(source, /<img class="peek" src="\/property\/assets\/beagle\/watchdog-beagle-peek\.webp"/, `${name} 404 shows the peeking beagle`);
}
assert.ok(fs.existsSync('property/assets/beagle/watchdog-beagle-peek.webp'), 'the peeking beagle image ships');
console.log('Watchdog unknown-route contract passed.');
