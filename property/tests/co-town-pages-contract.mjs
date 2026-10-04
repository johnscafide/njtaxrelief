import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

// Free CO lookup town pages: /co/<county>/<town>, its client checklist, county pages, the embed
// setup page, the embedded lookup and the "Was this helpful?" votes. Renders the real pages from
// the checked data, so a broken town or route shows up here before it ships.
const read = (p) => fs.readFileSync(p, 'utf8');
const require = createRequire(import.meta.url);
const T = require('../../api/_co-town.js');
const page = require('../../api/co-town-page.js');
const embed = require('../../api/co-embed-page.js');
const feedback = require('../../api/co-feedback.js');

function call(handler, query, extra) {
  return new Promise((resolve) => {
    const headers = {};
    const res = {
      statusCode: 200,
      setHeader(k, v) { headers[k.toLowerCase()] = v; },
      status(c) { this.statusCode = c; return this; },
      json(o) { this.end(JSON.stringify(o)); },
      end(body) { resolve({ status: this.statusCode, headers, body: String(body || '') }); }
    };
    const out = handler(Object.assign({ method: 'GET', query, headers: { host: 'www.watchdogindex.com' } }, extra || {}), res);
    if (out && out.then) out.catch((e) => resolve({ status: 'threw', body: e.message }));
  });
}

// ---------- town list and slugs ----------
const towns = T.towns();
assert.equal(towns.all.length, 564, 'every NJ municipality has a town entry');
assert.equal(towns.byPath.size, 564, 'every town has its own /co/<county>/<town> path');
const approvals = JSON.parse(read('property/data/municipal-requirements/approvals.json')).towns;
const approved = Object.keys(approvals).filter((c) => approvals[c].status === 'approved');
assert.equal(towns.all.filter((t) => t.published).length, approved.length, 'a town page is published exactly when the town is approved');
assert.equal(T.findTown('essex', 'montclair-township').code, '0713', 'slugs match the /towns reports');
assert.equal(T.findTown('cape-may', 'cape-may-city').county, 'Cape May', 'two-word counties get a hyphenated slug');

// ---------- every published town renders ----------
let rendered = 0;
for (const t of towns.all.filter((x) => x.published)) {
  const r = await call(page, { county: t.countySlug, town: t.slug });
  assert.equal(r.status, 200, `${t.path} renders`);
  assert.ok(r.body.includes(`<link rel="canonical" href="https://www.watchdogindex.com${t.path}">`), `${t.path} has its clean canonical URL`);
  assert.ok(!/name="robots" content="noindex/.test(r.body), `${t.path} can be indexed`);
  assert.ok(r.body.includes('data-share-row') && r.body.includes('data-votes') && r.body.includes(`href="${t.path}/print"`), `${t.path} has share, votes and the client checklist`);
  assert.ok(/utm_source=share&amp;utm_medium=facebook|utm_source%3Dshare%26utm_medium%3Dfacebook/.test(r.body), `${t.path} share links are tagged`);
  assert.ok(!/href="(?:mailto|tel):/i.test(r.body), `${t.path} adds no email or phone link (contact rule)`);
  rendered++;
}
assert.equal(rendered, approved.length);

// ---------- not yet published, unknown, county, checklist, embed, website ----------
const pending = towns.all.find((x) => !x.published);
let r = await call(page, { county: pending.countySlug, town: pending.slug });
assert.equal(r.status, 200, 'an unpublished town still has a page to add requirements');
assert.match(r.body, /name="robots" content="noindex/, 'unpublished town pages are not indexed');
assert.match(r.body, /data-add>Add CO Requirements/, 'unpublished town pages offer Add CO Requirements');

r = await call(page, { county: 'essex', town: 'nowhere-town' });
assert.equal(r.status, 404, 'an unknown town is a 404');
r = await call(page, { county: 'essex' });
assert.equal(r.status, 200, 'county pages render');
assert.match(r.body, /href="\/co\/essex\/montclair-township"/, 'county pages link their towns');

r = await call(page, { county: 'essex', town: 'montclair-township', view: 'print' });
assert.equal(r.status, 200, 'the client checklist renders');
assert.match(r.body, /name="robots" content="noindex/, 'client checklists are not indexed');
assert.match(r.body, /watchdog-logo-horizontal\.svg/, 'client checklist has the Watchdog header');
assert.match(r.body, /class="wm"[^>]*><img src="\/property\/branding\/watchdog-mark\.svg"/, 'client checklist has the Watchdog watermark');
assert.ok(!r.body.includes('watchdog-consent.js'), 'no cookie banner over a client checklist');

r = await call(embed, { county: 'essex', town: 'montclair-township' });
assert.equal(r.status, 200, 'the embedded town renders');
assert.match(r.body, /name="robots" content="noindex/, 'embedded pages are not indexed');
assert.ok(!r.body.includes('watchdog-consent.js'), 'no cookie banner inside someone else’s site');
assert.match(r.body, /co-embed-frame\.js/, 'embedded pages size their frame');

r = await call(page, { view: 'website' });
assert.equal(r.status, 200, '/co/website renders');
assert.match(r.body, /data-embed-code/, '/co/website shows the embed code');

// ---------- sitemap ----------
const rows = T.sitemapRows();
assert.equal(rows.filter((x) => /^\/co\/[a-z-]+\/[a-z0-9-]+$/.test(x.path)).length, approved.length, 'every published town is in the sitemap');
assert.ok(rows.some((x) => x.path === '/co'), '/co is in the sitemap');
assert.match(read('api/watchdog-index-sitemap.js'), /coSitemapRows\(\)/, 'the Watchdog sitemap includes the CO pages');

// ---------- routing and headers ----------
const mw = read('middleware.js');
assert.match(mw, /CO_PAGE_PATH/, 'middleware routes /co/<county>/<town>');
assert.match(mw, /\/api\/co-embed-page/, 'middleware routes the embedded town pages');
const vercel = JSON.parse(read('vercel.json'));
for (const fn of ['api/co-town-page.js', 'api/co-embed-page.js', 'api/watchdog-index-sitemap.js']) {
  assert.match(vercel.functions[fn].includeFiles, /approvals\.json/, `${fn} ships with the approvals`);
  assert.match(vercel.functions[fn].includeFiles, /co\/towns\.json/, `${fn} ships with the town list`);
}

// ---------- /co page ----------
const co = read('co/index.html');
assert.match(co, /co-search\.js/, '/co uses the shared search');
assert.match(co, /name="watchdog:social-image" content="page"/, '/co keeps its own preview image');
assert.match(co, /og:image" content="https:\/\/www\.watchdogindex\.com\/co\/co-share\.png"/, '/co preview image');
assert.ok(fs.statSync('co/co-share.png').size > 20000, 'the CO preview image exists');
assert.match(read('property/js/watchdog-universal-menu.js'), /key:'co',href:'\/co'/, 'CO is in the Watchdog menu');
const tipUrl = /const TIP_URL = '(https:\/\/account\.venmo\.com\/u\/[A-Za-z0-9-]+)'/.exec(read('api/_co-pages.js'))[1];
assert.ok(!co.includes('class="tip"'), 'no tip link on the /co home page');
r = await call(page, { county: 'essex', town: 'montclair-township' });
assert.ok(r.body.includes(`<p class="tip"><a href="${tipUrl}"`), 'town pages end with the tip link');
r = await call(embed, { county: 'essex', town: 'montclair-township' });
assert.ok(!r.body.includes('class="tip"'), 'no tip link inside someone else’s site');

// ---------- votes API input checks (no database needed) ----------
r = await call(feedback, { code: 'abc' });
assert.equal(r.status, 400, 'votes: a bad town code is refused');
r = await call(feedback, {}, { method: 'POST', body: { code: '0713', vote: 5, client: 'x' }, headers: { host: 'www.watchdogindex.com', 'x-forwarded-for': '1.2.3.4' } });
assert.equal(r.status, 400, 'votes: a bad vote is refused');
r = await call(feedback, {}, { method: 'POST', body: { code: '0713', vote: 1, client: 'abcdefghijklmnop' }, headers: { host: 'evil.example', 'x-forwarded-for': '1.2.3.4' } });
assert.equal(r.status, 403, 'votes: other hosts are refused');
const migration = read('supabase/migrations/20261004170000_co_town_votes.sql');
assert.match(migration, /enable row level security/, 'votes table has RLS');
assert.match(migration, /revoke all on table public\.co_town_votes from public, anon, authenticated/, 'votes table is service-role only');

console.log(`CO town pages contract passed (${rendered} town pages, ${rows.length} sitemap rows).`);
