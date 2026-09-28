// Buyer true cost card: /true-cost.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
process.chdir(new URL('.', root).pathname);
const tc = require(new URL('api/watchdog-true-cost.js', root).pathname);
const page = require(new URL('api/watchdog-property-page.js', root).pathname);
const middleware = read('middleware.js');
const vercel = JSON.parse(read('vercel.json'));
const ratios = JSON.parse(read('chapter123-ratios-2026.json'));
const hub = read('property/js/agent-hub.js');
const desk = read('property/agent-desk/index.html');
const zipSql = read('supabase/migrations/20260929010000_property_page_no_mailing_zip.sql');

// Statewide Chapter 123 ratios: all 564 districts, the state's own control rows, lower/upper = ratio x 0.85 / 1.15.
assert.equal(Object.keys(ratios.districts).length, 564);
assert.deepEqual(ratios.districts['0415'], [56.95, 48.41, 65.49], 'Gloucester Township control row');
assert.deepEqual(ratios.districts['1204'], [17.44, 14.82, 20.06], 'East Brunswick control row');
for (const [code, [r, lo, hi]] of Object.entries(ratios.districts)) {
  assert.ok(/^\d{4}$/.test(code), code);
  assert.ok(Math.abs(Math.round(r * 85) / 100 - lo) <= 0.011 && Math.abs(Math.round(r * 115) / 100 - hi) <= 0.011, `${code} corridor`);
}

// Monthly cost: standard amortization.
const m = tc.monthlyCost({ price: 700000, down: 20, rate: 6.5, term: 30, tax: 9954.08, ins: 1800, hoa: 0 });
assert.equal(Math.round(m.loan), 560000);
assert.equal(Math.round(m.pi), 3540);
assert.equal(Math.round(m.tax), 830);
assert.equal(Math.round(m.total), 4519);
assert.equal(Math.round(tc.monthlyCost({ price: 120000, down: 0, rate: 0, term: 10, tax: 0 }).pi), 1000, 'zero rate');
assert.equal(tc.monthlyCost({ price: 500000, down: 100, rate: 7, term: 30, tax: 1200 }).pi, 0, 'all cash');

// Inputs are clamped.
assert.deepEqual(tc.readInputs({ price: '$450,000', down: '150', rate: '99', term: '17', ins: 'x', hoa: '' }), { price: 450000, down: 100, rate: 20, term: 30, ins: 0, hoa: 0 });

// Verdicts (Gloucester Twp: ratio 56.95, upper 65.49, 2025 rate 4.179).
const g = { pams_pin: '0415_15202_17.01', address: '5 DUNDALK LANE', town: 'GLOUCESTER TWP', county: 'CAMDEN', assessed_value: 276000, last_year_tax: 11785.2, prop_class: '2' };
const gv = page.helpers.view(g);
const gf = tc.townFacts(g, gv);
assert.equal(gf.ratio, 56.95);
assert.equal(gf.upper, 65.49);
assert.ok(gf.rate > 3 && gf.rate < 6, 'published town rate found');
const verdict = (price) => tc.verdictText(tc.priceCheck({ price, assessed: g.assessed_value, tax: g.last_year_tax, ratio: gf.ratio, upper: gf.upper, rate: gf.rate }), gv.town);
assert.equal(verdict(400000).tone, 'good', 'assessment above the Chapter 123 upper limit');
assert.match(verdict(400000).body, /April 1/);
assert.equal(verdict(450000).tone, 'ok');
assert.equal(verdict(700000).tone, 'warn', 'low tax for the price warns about a revaluation');
assert.equal(verdict(0).tone, 'none');
assert.equal(tc.priceCheck({ price: 100000, assessed: 150000, upper: 120, ratio: 104, rate: 2, tax: 3000 }).limit, 100, 'upper limit is capped at 100%');

// What could change: always says a sale does not reset the tax; never invents a rate.
const items = tc.changeItems(g, gv, gf).map((x) => x[1]);
assert.ok(items.includes('Buying it does not reset the tax'));
assert.ok(items.includes('Some breaks don\'t transfer'));
const unknown = { pams_pin: '9999_1_1', address: '1 MAIN ST', town: 'NOWHERE', county: 'NONE', assessed_value: 100000, last_year_tax: 2000 };
const uf = tc.townFacts(unknown, page.helpers.view(unknown));
assert.equal(uf.ratio, null);
assert.equal(tc.verdictText(tc.priceCheck({ price: 300000, assessed: 100000, tax: 2000, ratio: uf.ratio, upper: uf.upper, rate: uf.rate }), 'Nowhere').tone, 'none');

// Rendering: agent card only from the verified profile shape, escaped; live script shares the same math.
const agent = { slug: 'jane-smith', licensed_name: 'Jane <b>Smith</b>', brokerage_name: 'Opus Elite Real Estate', license_number: '1234567', business_phone: '(609) 555-0100', business_email: 'jane@example.com', photo_url: 'javascript:alert(1)' };
const html = tc.renderCard(g, tc.readInputs({ price: '400000' }), agent);
assert.match(html, /Prepared by/);
assert.match(html, /Jane &lt;b&gt;Smith&lt;\/b&gt;/);
assert.doesNotMatch(html, /javascript:alert/, 'only https photos');
assert.match(html, /href="tel:6095550100"/);
assert.match(html, /<input type="hidden" name="agent" value="jane-smith">/);
assert.match(html, /function monthlyCost\(i\)/, 'browser uses the same monthly math');
assert.match(html, /Assessed high for this price/);
assert.match(html, /The interest rate is only an example/);
assert.doesNotMatch(tc.renderCard(g, tc.readInputs({}), null), /Prepared by/);
assert.doesNotMatch(html, /ROBUST Score/);
const picker = tc.renderPicker(null);
assert.match(picker, /name="address"/);
assert.doesNotMatch(picker, /name="q"/, 'a no-script submit never lands on the JSON search');

// Handler: search JSON, bad pin 404, card noindex, agent slug validated before any lookup.
function call(query, replies) {
  const calls = [];
  const res = { headers: {}, statusCode: 0, body: undefined, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.body = b; return this; } };
  const realFetch = global.fetch;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  global.fetch = async (url, init) => { const name = String(url).split('/rpc/')[1]; calls.push({ name, body: JSON.parse(init.body) }); return { ok: true, json: async () => replies[name] }; };
  return tc({ method: 'GET', query }, res).then(() => { global.fetch = realFetch; return { res, calls }; });
}
let out = await call({ q: '5 dundalk' }, { search_parcels: [{ pams_pin: g.pams_pin, address: g.address, town: g.town, county: g.county, zip: '12866' }] });
assert.equal(out.res.statusCode, 200);
assert.deepEqual(JSON.parse(out.res.body), [{ pin: g.pams_pin, address: '5 Dundalk Lane', town: 'Gloucester Township', county: 'Camden' }], 'search never returns a ZIP');
out = await call({ q: 'dundalk' }, {});
assert.deepEqual(JSON.parse(out.res.body), [], 'address must start with a house number');
assert.equal(out.calls.length, 0);
out = await call({ pin: '<x>' }, {});
assert.equal(out.res.statusCode, 404);
out = await call({ pin: g.pams_pin, price: '450000', agent: 'Bad Slug!' }, { get_public_property_page: g });
assert.equal(out.res.statusCode, 200);
assert.equal(out.res.headers['x-robots-tag'], 'noindex, follow');
assert.deepEqual(out.calls.map((c) => c.name), ['get_public_property_page'], 'an invalid agent slug is never looked up');
out = await call({ pin: g.pams_pin, agent: 'jane-smith' }, { get_public_property_page: g, get_public_agent_portal_profile: null });
assert.doesNotMatch(out.res.body, /Prepared by/, 'no card unless the agent plan is active');
out = await call({}, {});
assert.match(out.res.body, /Pick a home/);

// Routing, bundling, Agent Desk.
assert.match(middleware, /url\.pathname==='\/true-cost'\|\|url\.pathname==='\/true-cost\/'/);
assert.match(middleware, /destination\.searchParams\.delete\('q'\)/, 'the page route never serves the JSON search');
assert.match(vercel.functions['api/watchdog-true-cost.js'].includeFiles, /chapter123-ratios-2026\.json/);
assert.match(vercel.functions['api/watchdog-true-cost.js'].includeFiles, /revaluation-reassessment-2026\.json/);
assert.match(hub, /'true-cost':\['\/true-cost','\/api\/watchdog-true-cost','True cost card','deals'\]/);
assert.match(hub, /key==='true-cost'&&agentSlug\?p\+'\?agent='/);
assert.match(desk, /data-adh-tool="true-cost"/);

// Public property page never returns the owner's mailing ZIP.
assert.match(zipSql, /'zip', null::text,/);
assert.doesNotMatch(zipSql, /v_row\.zip/);

console.log('True cost contract passed.');
