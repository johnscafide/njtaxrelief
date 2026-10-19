import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// "Get updates" on the /co town pages: the signup box, the change detection behind the hourly
// scan, the email it queues and the unsubscribe page.
const require = createRequire(import.meta.url);
const T = require('../../api/_co-town.js');
const page = require('../../api/co-town-page.js');
const embed = require('../../api/co-embed-page.js');
const updates = require('../../api/co-updates.js');

function call(handler, req) {
  return new Promise((resolve) => {
    const headers = {};
    const res = {
      statusCode: 200,
      setHeader(k, v) { headers[k.toLowerCase()] = v; },
      status(c) { this.statusCode = c; return this; },
      json(o) { this.end(JSON.stringify(o)); },
      end(body) { resolve({ status: this.statusCode, headers, body: String(body || '') }); }
    };
    const out = handler(Object.assign({ method: 'GET', query: {}, headers: { host: 'www.watchdogindex.com' } }, req), res);
    if (out && out.then) out.catch((e) => resolve({ status: 'threw', body: e.message }));
  });
}

// ---------- the signup box ----------
const towns = T.towns();
const live = towns.all.find((t) => t.published);
const pending = towns.all.find((t) => !t.published);
for (const t of [live, pending]) {
  const r = await call(page, { query: { county: t.countySlug, town: t.slug } });
  assert.equal(r.status, 200);
  assert.match(r.body, /<h2><svg[^]*?<\/svg>Get updates when [^<]+ changes<\/h2>/, `${t.path} has Get updates`);
  assert.ok(r.body.includes('value="homeowner"') && r.body.includes('value="professional"'), `${t.path} asks homeowner or agent/pro`);
  assert.match(r.body, /<div class="toprow"><div class="toprow-main">[^]*?<\/div><aside class="updates" data-updates>/, 'the box sits at the top right, next to the town name');
  assert.match(r.body, /data-updates-form novalidate>/, 'the email box shows right away');
}
const e = await call(embed, { query: { county: live.countySlug, town: live.slug } });
assert.equal(e.status, 200);
assert.ok(!e.body.includes('data-updates'), 'the embed on other sites has no signup');

// ---------- what counts as a change ----------
const d = T.townData(live.code);
const snap = updates.watched(d);
assert.equal(updates.fingerprint(snap), updates.fingerprint(updates.watched(JSON.parse(JSON.stringify(d)))), 'fingerprint is stable');
const recheck = JSON.parse(JSON.stringify(d));
recheck.checked_at = '2099-01-01';
recheck.sources = ['https://example.com/new'];
assert.equal(updates.fingerprint(updates.watched(recheck)), updates.fingerprint(snap), 'a re-check that only moves the date or sources is not a change');
const moved = JSON.parse(JSON.stringify(snap));
moved.co.status = 'required';
moved.co.fees = [{ label: 'Resale CO', amount: '$150' }];
moved.co.lead_time = '10 business days';
const before = JSON.parse(JSON.stringify(snap));
before.co.status = 'not_required';
before.co.fees = [];
const lines = updates.changeLines(before, moved);
assert.ok(lines.includes('A resale CO is now required.'));
assert.ok(lines.includes('CO fees: Resale CO: $150'));
assert.ok(lines.includes('CO timing: 10 business days'));
assert.deepEqual(updates.changeLines(snap, snap), ['Some details on the page changed.']);

// ---------- the email ----------
const mail = updates.changeEmail(live, lines, false);
assert.equal(mail.subject, `${live.name} CO requirements changed`);
assert.ok(mail.html.includes('{{unsubscribe_url}}'), 'every email has an unsubscribe link');
assert.ok(mail.html.includes('5001 Rt 42, Turnersville, NJ 08012'), 'CAN-SPAM mailing address');
assert.ok(mail.html.includes(`https://www.watchdogindex.com${live.path}?utm_source=co_updates`), 'links to the clean town URL, tagged');
assert.ok(!/\u2014/.test(mail.html + mail.subject), 'no em dashes');
assert.ok(!/mailto:|tel:/i.test(mail.html), 'no email or phone links (contact rule)');
assert.ok(!/border-radius:999px/.test(mail.html), 'no pill buttons');
assert.equal(updates.changeEmail(live, [], true).subject, `${live.name} CO requirements are now on Watchdog`);

// ---------- sign up ----------
delete process.env.SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const post = (body, extra) => call(updates, Object.assign({ method: 'POST', body, headers: { host: 'www.watchdogindex.com', 'user-agent': 'Mozilla/5.0' } }, extra || {}));
assert.equal((await post({ code: live.code, email: 'nope', role: 'homeowner' })).status, 400, 'bad email');
assert.equal((await post({ code: live.code, email: 'a@b.co', role: 'investor' })).status, 400, 'role must be homeowner or professional');
assert.equal((await post({ code: '9999', email: 'a@b.co', role: 'homeowner' })).status, 404, 'unknown town');
assert.equal((await post({ code: live.code, email: 'a@b.co', role: 'homeowner', website: 'x' })).status, 200, 'honeypot looks like success');
assert.equal((await post({ code: live.code, email: 'a@b.co', role: 'homeowner' }, { headers: { host: 'evil.example' } })).status, 403, 'other hosts are refused');
assert.equal((await post({ code: live.code, email: 'a@b.co', role: 'homeowner' }, { headers: { host: 'www.watchdogindex.com', 'user-agent': 'curl/8' } })).status, 403, 'scripts are refused');
assert.equal((await post({ code: live.code, email: 'a@b.co', role: 'professional' })).status, 503, 'no backend, no save');
assert.equal((await call(updates, { method: 'POST', query: { action: 'scan' }, headers: { host: 'www.watchdogindex.com' } })).status, 503, 'scan needs the backend');

// ---------- scan, against a fake backend ----------
process.env.SUPABASE_URL = 'https://db.example'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
const store = new Map();
const sentRows = [];
global.fetch = async (url, opts) => {
  const name = String(url).split('/rpc/')[1];
  const args = JSON.parse(opts.body);
  let out = null;
  if (name === 'verify_co_updates_worker') out = args.p_token === 'x'.repeat(40);
  if (name === 'co_town_fingerprints') out = [...store].map(([c, v]) => ({ municipality_code: c, fingerprint: v.fingerprint }));
  if (name === 'co_town_snapshots_for') out = args.p_codes.map((c) => ({ municipality_code: c, snapshot: store.get(c).snapshot }));
  if (name === 'record_co_town_changes') { args.p_rows.forEach((r) => { store.set(r.code, r); sentRows.push(r); }); out = { ok: true, queued: args.p_rows.filter((r) => r.notify).length, enabled: true }; }
  return { ok: true, status: 200, text: async () => JSON.stringify(out) };
};
const scanReq = (token) => call(updates, { method: 'POST', query: { action: 'scan' }, headers: { host: 'www.watchdogindex.com', 'x-co-updates-token': token } });
assert.equal((await scanReq('y'.repeat(40))).status, 401, 'scan needs the worker token');
let s = JSON.parse((await scanReq('x'.repeat(40))).body);
const published = towns.all.filter((t) => t.published).length;
assert.equal(s.seeding, true);
assert.equal(s.changed, published, 'first scan stores every published town');
assert.ok(sentRows.every((r) => r.notify === false && !r.html), 'first scan emails nobody');
sentRows.length = 0;
s = JSON.parse((await scanReq('x'.repeat(40))).body);
assert.equal(s.changed, 0, 'nothing changed, nothing queued');
const old = store.get(live.code);
const tweaked = JSON.parse(JSON.stringify(old.snapshot));
tweaked.co.lead_time = 'changed for the test';
store.set(live.code, { fingerprint: 'old', snapshot: tweaked });
store.delete(towns.all.find((t) => t.published && t.code !== live.code).code);
s = JSON.parse((await scanReq('x'.repeat(40))).body);
assert.equal(s.changed, 2, 'a changed town and a newly published town');
const changedRow = sentRows.find((r) => r.code === live.code);
assert.equal(changedRow.notify, true);
assert.ok(changedRow.subject.endsWith('CO requirements changed'));
const newRow = sentRows.find((r) => r.code !== live.code);
assert.ok(newRow.subject.endsWith('are now on Watchdog'));

// ---------- unsubscribe ----------
const tok = 'a'.repeat(48);
let u = await call(updates, { method: 'GET', query: { action: 'unsubscribe', t: tok } });
assert.equal(u.status, 200);
assert.match(u.body, /<form method="post" action="\/co\/updates\/unsubscribe">/, 'opening the link only shows a button');
assert.match(u.body, /noindex/);
u = await call(updates, { method: 'GET', query: { action: 'unsubscribe', t: 'short' } });
assert.equal(u.status, 400);

console.log('CO updates contract passed');
