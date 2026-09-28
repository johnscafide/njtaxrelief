// Property alerts: signup on the property page, confirm/unsubscribe pages, EmailJS sender.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const page = require(new URL('api/watchdog-property-page.js', root).pathname);
const alerts = require(new URL('api/watchdog-property-alerts.js', root).pathname);
const middleware = read('middleware.js');
const sql = read('supabase/migrations/20260928235000_property_alerts.sql');
const flagSql = read('supabase/migrations/20260929000000_property_alerts_page_flag.sql');
const sender = read('supabase/functions/property-alert-sender/index.ts');

// The signup only renders once alerts are switched on.
const row = { pams_pin: '0904_9_20', address: '102 GRANT AVE', town: 'HARRISON TOWN', county: 'HUDSON', block: '9', lot: '20', prop_class: '2', assessed_value: 424300, last_year_tax: 9954.08 };
assert.doesNotMatch(page.renderPage(row), /id="wdp-alert-form"/, 'hidden while alerts are off');
const on = page.renderPage({ ...row, alerts_enabled: true });
assert.match(on, /id="wdp-alert-form"/, 'shown when alerts_enabled');
assert.match(on, /Unsubscribe any time\./);
assert.match(on, /fetch\('\/api\/watchdog-property-alerts'/);
assert.match(on, /#wdp-alerts,/, 'hidden when printing');

function res() {
  return { headers: {}, statusCode: 0, body: undefined, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; }, end(b) { this.body = b; return this; } };
}
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
const realFetch = global.fetch;
async function run(req, reply) {
  const calls = [];
  global.fetch = async (url, init) => { calls.push({ url, body: init && init.body ? JSON.parse(init.body) : null }); return { ok: true, json: async () => reply }; };
  const r = res();
  await alerts({ headers: { 'x-forwarded-for': '203.0.113.9' }, query: {}, ...req }, r);
  global.fetch = realFetch;
  return { r, calls };
}

// Subscribe: every success state reads the same, so the form can't reveal who follows what.
const answers = [];
for (const state of ['confirm_sent', 'confirm_already_sent', 'already_active']) {
  const { r, calls } = await run({ method: 'POST', body: { pin: '0904_9_20', email: ' Pat@Example.com ' } }, { ok: true, state });
  assert.equal(r.statusCode, 200);
  assert.match(calls[0].url, /\/rpc\/subscribe_property_alert$/);
  assert.equal(calls[0].body.p_email, 'pat@example.com');
  assert.match(calls[0].body.p_client_hash, /^[0-9a-f]{64}$/, 'IP is stored only as an HMAC');
  answers.push(r.body);
}
assert.equal(new Set(answers).size, 1, 'same reply for every success state');
assert.equal((await run({ method: 'POST', body: { pin: '0904_9_20', email: 'x@y.z' } }, { ok: false, error: 'disabled' })).r.statusCode, 503);
assert.equal((await run({ method: 'POST', body: { pin: '0904_9_20', email: 'x@y.z' } }, { ok: false, error: 'rate_limited' })).r.statusCode, 429);
assert.equal((await run({ method: 'POST', body: { pin: 'nope', email: 'x@y.z' } }, {})).r.statusCode, 400);
assert.equal((await run({ method: 'POST', body: { pin: '0904_9_20', email: 'nope' } }, {})).r.statusCode, 400);
assert.equal((await run({ method: 'GET' }, {})).r.statusCode, 405);

// Email links open a page with a button; only the POST changes anything.
const token = 'a'.repeat(48);
let out = await run({ method: 'GET', query: { action: 'confirm', t: token } }, {});
assert.equal(out.calls.length, 0, 'GET never confirms');
assert.match(out.r.body, /<form method="post" action="\/alerts\/confirm"><input type="hidden" name="t" value="a{48}">/);
assert.equal(out.r.headers['cache-control'], 'no-store');
assert.equal(out.r.headers['x-robots-tag'], 'noindex, nofollow');
out = await run({ method: 'POST', query: { action: 'confirm' }, body: `t=${token}` }, { ok: true, pams_pin: '0904_9_20', address: '102 GRANT AVE', town: 'HARRISON TOWN' });
assert.match(out.calls[0].url, /\/rpc\/confirm_property_alert$/);
assert.equal(out.calls[0].body.p_token, token);
assert.match(out.r.body, /102 Grant Ave, Harrison Town/);
out = await run({ method: 'POST', query: { action: 'unsubscribe' }, body: { t: token } }, { ok: false });
assert.equal(out.r.statusCode, 410);
out = await run({ method: 'GET', query: { action: 'unsubscribe', t: '<script>' } }, {});
assert.equal(out.r.statusCode, 400);
assert.doesNotMatch(out.r.body, /name="t"|value="<script/, "a bad token is never echoed");

// Routing
assert.match(middleware, /url\.pathname==='\/alerts\/confirm'\|\|url\.pathname==='\/alerts\/unsubscribe'/);
assert.ok(middleware.indexOf("'/alerts/confirm'") < middleware.indexOf('return rewriteCleanPage(request,publicPath)'));

// Database: server-only, off by default, double opt-in, expiring confirm links.
assert.match(sql, /enabled boolean not null default false/, 'alerts start switched off');
for (const t of ['property_alert_settings', 'property_alert_subscriptions', 'property_alert_outbox']) {
  assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security;`));
  assert.match(sql, new RegExp(`revoke all on public\\.${t} from anon, authenticated;`));
}
assert.match(sql, /confirm_token_hash/, 'confirm tokens are stored hashed');
assert.match(flagSql, /confirm_sent_at > now\(\) - interval '7 days'/, 'confirm links expire');
assert.match(flagSql, /'alerts_enabled', coalesce\(\(select a\.enabled from public\.property_alert_settings a where a\.singleton\), false\)/);
assert.match(flagSql, /revoke all on function public\.get_public_property_page\(text\) from public, anon, authenticated;/);
assert.match(flagSql, /revoke all on function public\.confirm_property_alert\(text\) from public, anon, authenticated;/);

// Sender: token-checked, waits for the template, always links an unsubscribe on change emails.
assert.match(sender, /verify_property_alert_worker/);
assert.match(sender, /EMAILJS_PROPERTY_ALERT_TEMPLATE_ID/);
assert.match(sender, /email_configured: false/);
assert.match(sender, /\/alerts\/unsubscribe\?t=/);
assert.match(sender, /https:\/\/www\.watchdogindex\.com/);
assert.doesNotMatch(sender, /njpropertytaxrelief/i);

console.log('Property alerts contract passed.');
