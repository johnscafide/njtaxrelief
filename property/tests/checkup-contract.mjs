// Annual property tax checkup: /checkup page and the Agent Desk "Tax checkups" card.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
process.chdir(new URL('.', root).pathname);
const ck = require(new URL('api/watchdog-checkup.js', root).pathname);
const middleware = read('middleware.js');
const vercel = JSON.parse(read('vercel.json'));
const desk = read('property/agent-desk/index.html');
const cards = read('property/js/agent-checkups.js');

// Deadline: April 1 of the next tax year; May 1 only in a known 2026 revaluation town.
assert.deepEqual(ck.nextDeadline(new Date('2026-09-28T12:00:00Z'), false), { date: 'April 1, 2027', note: 'May 1 if your town revalues that year' });
assert.deepEqual(ck.nextDeadline(new Date('2026-03-01T12:00:00Z'), false), { date: 'April 1, 2026', note: 'May 1 if your town revalues that year' });
assert.deepEqual(ck.nextDeadline(new Date('2026-04-15T12:00:00Z'), true), { date: 'May 1, 2026', note: '' });
assert.equal(ck.nextDeadline(new Date('2026-05-02T12:00:00Z'), true).date, 'April 1, 2027');

// The value an assessment needs: assessed / min(upper, 100%).
const h = ck.holdsUp(424300, 69.39, 79.8);
assert.equal(Math.round(h.floor), 531704);
assert.equal(Math.round(h.implied), 611471);
assert.equal(ck.holdsUp(200000, 104, 120).limit, 100, 'upper limit capped at 100%');
assert.equal(ck.holdsUp(200000, null, null), null);

// Rendering.
const row = { pams_pin: '0904_9_20', address: '102 GRANT AVE', town: 'HARRISON TOWN', county: 'HUDSON', zip: '07105', assessed_value: 424300, last_year_tax: 9954.08, prop_class: '2', town_compare: { peers: 1964, median_tax: 10828, share_paying_less: 39 } };
const agent = { slug: 'jane-smith', licensed_name: 'Jane Q. Smith', business_email: 'jane@example.com' };
const html = ck.renderCheckup(row, agent, new Date('2026-09-28T12:00:00Z'));
assert.match(html, /\$531,704/);
assert.match(html, /File by April 1, 2027/);
assert.match(html, /45 days after the assessment notices were mailed/);
assert.match(html, /Hudson County Board of Taxation/);
assert.match(html, /Jane can give you a free opinion of value/);
assert.match(html, /\/appeal-savings-estimator\/\?assessed=424300&amp;ratio=69\.39&amp;rate=2\.384/);
assert.match(html, /<meta name="robots" content="noindex, follow">/);
assert.match(html, /<link rel="canonical" href="https:\/\/www\.watchdogindex\.com\/checkup">/);
assert.doesNotMatch(html, /07105/, 'never shows the owner mailing ZIP');
assert.doesNotMatch(html, /directly with the Tax Court/, 'Tax Court line only above $1 million');
assert.match(ck.renderCheckup({ ...row, assessed_value: 1200000 }, null, new Date('2026-09-28T12:00:00Z')), /directly with the Tax Court/);
assert.doesNotMatch(ck.renderCheckup(row, null, new Date('2026-09-28T12:00:00Z')), /Prepared by/);

// Handler: bad pin 404 without a lookup; noindex.
const res = { headers: {}, statusCode: 0, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.body = b; } };
let fetched = 0;
const realFetch = global.fetch;
global.fetch = async () => { fetched++; return { ok: true, json: async () => null }; };
await ck({ method: 'GET', query: { pin: 'nope' } }, res);
global.fetch = realFetch;
assert.equal(res.statusCode, 404);
assert.equal(fetched, 0);
assert.equal(res.headers['x-robots-tag'], 'noindex, follow');

// Routing and bundling.
assert.match(middleware, /url\.pathname==='\/checkup'\|\|url\.pathname==='\/checkup\/'/);
assert.match(vercel.functions['api/watchdog-checkup.js'].includeFiles, /chapter123-ratios-2026\.json/);

// Agent Desk card: own past clients and sphere only, sent by the agent, nothing stored or emailed.
assert.match(desk, /<section id="ad-checkups"/);
assert.match(desk, /<script src="\/property\/js\/agent-checkups\.js/);
assert.match(cards, /\.eq\('user_id',user\.id\)\.in\('relationship',\['past_client','sphere'\]\)\.not\('pams_pin','is',null\)/);
assert.match(cards, /ORIGIN\+'\/checkup\?pin='/);
assert.doesNotMatch(cards, /\.insert\(|\.update\(|\.upsert\(|emailjs|mailto:/i, 'the card never writes data or sends email');

// February reminder in the Monday agent email.
const digest = read('supabase/functions/agent-opportunity-digest/index.ts');
assert.match(digest, /return local\.getMonth\(\) === 1;/, 'reminder runs in February, agent local time');
assert.match(digest, /x\.relationship === "past_client" \|\| x\.relationship === "sphere"/, 'counts only past clients and sphere');
assert.match(digest, /if \(!email \|\| \(!top\.length && !checkups\)\)/, 'a checkup-only week still sends');
assert.match(digest, /const CHECKUP_URL = "https:\/\/www\.watchdogindex\.com\/agent-desk#clients";/);
assert.doesNotMatch(digest, /njpropertytaxrelief\.com\/property\/agent-desk/, 'desk link uses the clean Watchdog URL');

// Monday email is on by default for everyone who can open the Agent Desk.
const { recipients } = await import(new URL('supabase/functions/agent-opportunity-digest/recipients.ts', root).href);
const list = recipients(
  [{ user_id: 'off', enabled: false }, { user_id: 'custom', enabled: true, weekday: 3, local_hour: 9, timezone: 'America/Chicago' }],
  [{ user_id: 'agent', billing_tier: 'agent', subscription_status: 'active' }, { user_id: 'off', billing_tier: 'pro', subscription_status: 'active' },
   { user_id: 'custom', plan_tier: 'Teams', subscription_status: 'trialing' }, { user_id: 'basic', billing_tier: 'standard', subscription_status: 'active' },
   { user_id: 'lapsed', billing_tier: 'agent', subscription_status: 'canceled' }],
  [{ id: 'dev' }]);
assert.deepEqual(list.map((p) => p.user_id).sort(), ['agent', 'custom', 'dev'], 'no saved choice means on; off stays off; no plan, no email');
assert.equal(list.find((p) => p.user_id === 'agent').weekday, 1);
assert.equal(list.find((p) => p.user_id === 'agent').local_hour, 8);
assert.equal(list.find((p) => p.user_id === 'custom').timezone, 'America/Chicago');
assert.match(digest, /import \{ PLAN_ACTIVE, recipients \} from "\.\/recipients\.ts";/);
assert.match(read('property/js/agent-desk.js'), /\$\('ad-digest'\)\.checked=digest\?digest\.enabled:true;/, 'the switch shows on when no choice is saved');

console.log('Checkup contract passed.');
