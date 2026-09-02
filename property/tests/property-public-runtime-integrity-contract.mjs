import fs from 'node:fs';
import assert from 'node:assert/strict';

const contact = fs.readFileSync(new URL('../../api/watchdog-index-page-contact-safe.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/lookup/01-search-hero.css', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));

assert.ok(contact.includes('installSupabaseSingletonGuard'), 'root route transformer must install the Supabase singleton guard');
assert.ok(contact.includes('/property/site.webmanifest'), 'root route transformer must canonicalize the manifest path');
assert.ok(index.includes('id="pl-inline"'), 'homepage search shell must expose the lookup progress region');
assert.ok(css.includes('.pl-inline-status:empty'), 'lookup progress region should collapse when idle');

const headers = (vercel.headers || []).flatMap((entry) => entry.headers || []);
const csp = headers.find((header) => String(header.key || '').toLowerCase() === 'content-security-policy-report-only');
assert.ok(csp, 'report-only CSP should remain configured');
for (const origin of ['https://maps.googleapis.com','https://maps.gstatic.com','https://geo.nj.gov','https://services2.arcgis.com']) {
  assert.ok(csp.value.includes(origin), `report-only CSP should recognize ${origin}`);
}
assert.match(contact, /supabase-client-singleton-guard\.js/, 'singleton guard script path should be explicit');
console.log('property public runtime integrity contract: ok');
