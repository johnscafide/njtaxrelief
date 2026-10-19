import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { tallyHtml } from '../../scripts/build-co-apply-tally.mjs';

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

// ---------- /co/<county>/<town>/apply: the town's own application, filled in ----------
const formsReg = JSON.parse(read('property/data/co-application-forms.json')).forms;
const fill = require('../../co/co-apply.js');
const formTemplate = require('../../api/co-form-template.js');
const INPUTS = ['address', 'unit', 'city', 'zip', 'block', 'lot', 'qual', 'property_type', 'occupancy', 'bedrooms', 'bathrooms', 'kitchens', 'lockbox', 'price', 'settlement_date',
  'owner_name', 'owner_phone', 'owner_email', 'owner_address', 'owner_city_zip', 'buyer_name', 'buyer_phone', 'buyer_email', 'buyer_address', 'buyer_city_zip', 'buyer_plan',
  'agent_name', 'agent_company', 'agent_phone', 'agent_email', 'agent_address', 'buyer_agent_name', 'buyer_agent_phone', 'buyer_agent_email', 'access_name', 'access_phone',
  'applicant_role', 'applicant_name', 'applicant_phone', 'applicant_email'];
const fillCodes = Object.keys(formsReg);
assert.ok(fillCodes.length >= 10, 'at least 10 towns can fill in their own application');
for (const code of fillCodes) {
  const f = formsReg[code];
  const t = towns.byCode.get(code);
  assert.ok(t && t.published, `${code}: application filler only for published towns`);
  assert.equal(T.townData(code).co.status, 'required', `${code}: only towns that require a resale CO`);
  assert.match(f.sha256, /^[0-9a-f]{64}$/, `${code}: the town's PDF is pinned by hash`);
  assert.match(f.url, /^https?:\/\//, `${code}: the town's PDF has a web address`);
  assert.ok(Number.isInteger(f.field_count) && f.field_count >= 0 && Number.isInteger(f.pages) && f.pages > 0, `${code}: field and page counts are checked`);
  assert.ok(f.title && Object.keys(f.fields || {}).length + (f.overlay || []).length >= 6, `${code}: has a title and a real field map`);
  (f.overlay || []).forEach((o) => assert.ok(Number.isInteger(o.page) && o.page >= 0 && o.page < f.pages && o.x >= 0 && o.y >= 0 && (o.w === undefined || o.w > 0), `${code}: overlay spots sit on a page`));
  const asked = fill.askedKeys(f.fields, f.overlay);
  asked.forEach((k) => assert.ok(INPUTS.includes(k), `${code}: asks for a known answer (${k})`));
  r = await call(page, { county: t.countySlug, town: t.slug, view: 'apply' });
  assert.equal(r.status, 200, `${t.path}/apply renders`);
  assert.match(r.body, /name="robots" content="noindex/, `${t.path}/apply is not indexed`);
  assert.ok(r.body.includes('data-ack') && r.body.includes(`Watchdog isn’t ${t.name}`), `${t.path}/apply says Watchdog isn't the town`);
  INPUTS.forEach((k) => assert.ok(r.body.includes(`data-key="${k}"`), `${t.path}/apply has the ${k} question`));
  assert.ok(!/href="(?:mailto|tel):/i.test(r.body), `${t.path}/apply adds no email or phone link (contact rule)`);
  const json = JSON.parse(/<script type="application\/json" id="co-form">([\s\S]*?)<\/script>/.exec(r.body)[1]);
  assert.equal(json.sha256, f.sha256, `${t.path}/apply checks the pinned hash`);
  r = await call(page, { county: t.countySlug, town: t.slug });
  assert.ok(r.body.includes(`href="${t.path}/apply" data-fill-link>`), `${t.path} links to the online application`);
}
const noForm = towns.all.find((x) => x.published && !formsReg[x.code]);
r = await call(page, { county: noForm.countySlug, town: noForm.slug, view: 'apply' });
assert.equal(r.status, 307, 'towns without a mapped form send /apply back to the town page');
r = await call(page, { county: noForm.countySlug, town: noForm.slug });
assert.ok(!r.body.includes('data-fill-link'), 'no online application link where the form isn’t mapped');
assert.match(read('middleware.js'), /\(print\|apply\)/, 'middleware routes /apply');
assert.match(vercel.functions['api/co-town-page.js'].includeFiles, /co-application-forms\.json/, 'town pages ship with the form map');
assert.match(vercel.functions['api/co-form-template.js'].includeFiles, /co-application-forms\.json/, 'the form proxy ships with the form map');
r = await call(formTemplate, { code: '9999' });
assert.equal(r.status, 400, 'form proxy refuses towns without a mapped form');

const v = fill.values({ address: '12 Elm St', unit: '2B', city: 'Glassboro', zip: '08028', settlement_date: '2026-11-20', occupancy: 'vacant', lockbox: '4471',
  owner_name: 'Jane Seller', owner_phone: '856-555-0101', agent_name: 'Pat Agent', agent_phone: '856-555-0199', agent_email: 'pat@example.com', applicant_role: 'agent' }, new Date(2026, 9, 19));
assert.equal(v.today, '10/19/2026');
assert.equal(v.settlement_date, '11/20/2026');
assert.equal(v.address_full, '12 Elm St, Unit 2B');
assert.equal(v.owner_address_full, '12 Elm St, Unit 2B, Glassboro, NJ 08028', 'owner address falls back to the home');
assert.equal(v.owner_mailing, '', '"if different" fields stay blank when the owner lives there');
assert.equal(v.applicant_name, 'Pat Agent', '"You" fills from the role');
assert.equal(v.applicant_email, 'pat@example.com');
assert.equal(v.access_name, 'Pat Agent', 'inspection contact defaults to the agent');
assert.equal(v.vacant_yn, 'Yes');
assert.equal(fill.fieldText({ mark: 'occupancy', is: 'vacant' }, v), 'X');
assert.equal(fill.fieldText({ mark: 'occupancy', is: 'owner' }, v), '');
assert.equal(fill.fieldText({ join: ['agent_name', 'agent_company'], sep: ', ' }, v), 'Pat Agent', 'joins skip blanks');
const fakePage = (angle) => ({ getMediaBox: () => ({ x: 0, y: 0, width: 612, height: 792 }), getRotation: () => ({ angle }) });
assert.deepEqual(fill.upright(fakePage(0), 100, 200), { x: 100, y: 200, r: 0 });
assert.deepEqual(fill.upright(fakePage(270), 100, 200), { x: 200, y: 692, r: 270 }, 'sideways pages get on-screen spots turned back');
assert.deepEqual(fill.upright(fakePage(90), 100, 200), { x: 412, y: 100, r: 90 });
assert.equal(fill.pdfSafe('Sam\u2019s LLC \u2014 \u201cMain\u201d'), 'Sam\'s LLC - "Main"', 'PDF text stays in the standard font');

for (const [code, f] of Object.entries(registryForSaved())) {
  if (!f.saved_copy) continue;
  const copy = fs.readFileSync(new URL(`../data/co-forms/${code}.pdf`, import.meta.url));
  assert.equal(crypto.createHash('sha256').update(copy).digest('hex'), f.sha256, `${code}: saved copy matches the pinned town form`);
}
assert.match(vercelConfigForSaved().functions['api/co-form-template.js'].includeFiles, /co-forms\/\*\.pdf/, 'form proxy ships the saved copies');
function registryForSaved() { return JSON.parse(fs.readFileSync(new URL('../data/co-application-forms.json', import.meta.url), 'utf8')).forms; }
function vercelConfigForSaved() { return JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8')); }

const coHome = fs.readFileSync(new URL('../../co/index.html', import.meta.url), 'utf8');
const registryForTally = JSON.parse(fs.readFileSync(new URL('../data/co-application-forms.json', import.meta.url), 'utf8'));
assert.ok(coHome.includes(tallyHtml(registryForTally)), '/co "Fill out online" county tally matches the registry (run node scripts/build-co-apply-tally.mjs)');

console.log(`CO town pages contract passed (${rendered} town pages, ${rows.length} sitemap rows).`);
