// "Claim this home": public property page -> /home?pin=PIN&claim=1 -> sign in
// -> postcard verification. Node only, no network: the claim module runs in a
// vm sandbox with a stubbed Supabase client, parcel service and DOM.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

const claimSource = read('property/js/dashboard/home/home-claim.js');
const verifySource = read('property/js/ownership-verification.js');
const bundle = read('property/js/home.js');
const homeHtml = read('property/home/index.html');
const page = require(new URL('api/watchdog-property-page.js', root).pathname);

// 1. Public property page links into the claim flow on the clean /home route.
const html = page.renderPage({ pams_pin: '0904_9_20', address: '102 GRANT AVE', town: 'HARRISON TOWN', county: 'HUDSON', last_year_tax: 9954.08, assessed_value: 424300 });
assert.match(html, /<a class="wdp-pill is-dark" href="\/home\?pin=0904_9_20&amp;claim=1">[^<]*<i class="fas fa-house-circle-check"[^>]*><\/i>Claim this home<\/a>/, 'Claim this home opens /home?pin=...&claim=1');
assert.match(html, /<a class="wdp-pill" href="\/home\?pin=0904_9_20&amp;claim=1#photo">[^<]*<i class="fas fa-camera"[^>]*><\/i>Add a photo<\/a>/, 'Add a photo keeps #photo and goes through the claim flow');
assert.doesNotMatch(html, /href="\/property\/home/, 'no /property/ path in the public claim links');

// 2. The bundle ships the claim module unchanged and Property Home calls it.
const section = '/* ===== property/js/dashboard/home/home-claim.js ===== */\n';
assert.ok(bundle.includes(section + claimSource.trim() + '\n'), 'home.js bundles property/js/dashboard/home/home-claim.js exactly as the source file');
assert.ok(bundle.indexOf(section) < bundle.indexOf('/* ===== property/js/dashboard/home/index.js ===== */'), 'claim module is defined before Property Home boots');
const boot = bundle.slice(bundle.indexOf('function bootHome()'), bundle.indexOf('function startHome()'));
assert.match(boot, /var claim = window\.WatchdogHomeClaim \? window\.WatchdogHomeClaim\.request\(\) : null;/);
assert.ok(boot.indexOf('window.WatchdogHomeClaim.signIn()') > -1 && boot.indexOf('window.WatchdogHomeClaim.signIn()') < boot.indexOf("el('hm-gate').style.display = 'block';"), 'signed-out claim visitors go to sign in before the gate is shown');
assert.match(homeHtml, /\.gate\{display:none\}/, 'critical head CSS hides the gate until boot decides');
assert.doesNotMatch(boot, /el\('hm-gate'\)\.style\.display = ''/, 'clearing the inline style would leave the sign-in gate hidden by the head CSS');
assert.match(boot, /window\.WatchdogHomeClaim\.start\(\{ client: sb, rows: rows, current: current, show: showRow, toast: toast \}\)/, 'signed-in claim visitors start the claim once saved rows load');
assert.match(bundle, /window\.dbVerify = function \(pin, address, town, zip\) \{\s*if \(!getClient\(\) \|\| !window\.NJPTRVerification\)/, 'the claim reuses the existing dbVerify entry point');

// 3. Status copy lives in the page markup, and the changed assets are re-versioned.
assert.match(homeHtml, /<div class="hm-claim-status" id="hm-claim-status" role="status" aria-live="polite" hidden>/);
for (const state of ['verified', 'pending', 'unavailable']) assert.ok(homeHtml.includes(`data-claim-state="${state}"`), `status copy for ${state}`);
assert.match(homeHtml, /This home is verified as yours\./);
assert.match(homeHtml, /data-claim-verify>Enter my code<\/button>/);
assert.match(homeHtml, /<script src="\/property\/js\/home\.js\?v=20260929-claim1"/, 'home.js cache-busting version bumped');
assert.match(homeHtml, /home-board\.css\?v=20260929-claim1/, 'home-board.css cache-busting version bumped');
assert.doesNotMatch(claimSource, /innerHTML|insertAdjacentHTML/, 'claim module writes no markup; copy stays in HTML');

// 4. Privacy: only public parcel location fields; no owner or mailing fields; no code logging.
const fields = claimSource.match(/var PARCEL_FIELDS = '([^']+)'/)[1].split(',');
assert.deepEqual(fields, ['PAMS_PIN', 'PROP_LOC', 'MUN_NAME', 'COUNTY', 'PCLBLOCK', 'PCLLOT', 'NET_VALUE', 'LAST_YR_TX']);
for (const owner of ['OWNER_NAME', 'ST_ADDRESS', 'CITY_STATE', 'ZIP5', 'ZIP_CODE']) assert.ok(!fields.includes(owner), `never requests ${owner}`);
assert.doesNotMatch(claimSource, /console\./, 'claim module logs nothing');
for (const [name, src] of [['source', verifySource], ['bundle', bundle.slice(bundle.indexOf('/* ===== property/js/ownership-verification.js ===== */'), bundle.indexOf('/* ===== property/js/pwa.js ===== */'))]]) {
  assert.match(src, /needsZip \? '<label for="njptr-verify-zip">ZIP code for this property<\/label><input id="njptr-verify-zip"/, `${name}: asks for the property ZIP when none is known`);
  assert.match(src, /postal_code: zip/, `${name}: request uses the property ZIP`);
  assert.doesNotMatch(src, /console\.[a-z]+\([^)\n]*[(,]\s*(?:code|p_code)\b/, `${name}: never logs the verification code`);
}

// 5. Behavior of the three visitor states.
function makeBox() {
  const nodes = ['verified', 'pending', 'unavailable'].map((state) => ({ state, hidden: true, getAttribute: () => state }));
  const verifyButton = { handlers: [], addEventListener(type, fn) { this.handlers.push(fn); } };
  return {
    hidden: true, attrs: {}, nodes, verifyButton,
    querySelectorAll: () => nodes,
    querySelector: (sel) => (sel === '[data-claim-verify]' ? verifyButton : null),
    setAttribute(k, v) { this.attrs[k] = v; },
    visibleState() { return this.hidden ? null : (nodes.find((n) => !n.hidden) || {}).state; }
  };
}
function sandbox(url, { parcel, savedHome } = {}) {
  const u = new URL(url);
  const calls = { replace: [], verify: [], rpc: [], fetch: [], show: [], toast: [] };
  const box = makeBox();
  const client = {
    rpc(name, args) { calls.rpc.push([name, args]); return Promise.resolve({ data: 'new-id', error: null }); },
    from(table) {
      const q = { table, filters: [], select() { return q; }, eq(k, v) { q.filters.push([k, v]); return q; }, limit() { return q; },
        maybeSingle() { return Promise.resolve({ data: savedHome || null, error: null }); } };
      return q;
    }
  };
  const window = {
    NJPTRSupabaseRuntime: { onboardingUrl: (next) => 'https://www.watchdogindex.com/onboarding/?next=' + encodeURIComponent(next) },
    dbVerify: (...args) => calls.verify.push(args),
    matchMedia: () => ({ matches: true })
  };
  const context = {
    window, URLSearchParams, Promise, setTimeout, clearTimeout, AbortController, Object, Array, String,
    location: { pathname: u.pathname, search: u.search, hash: u.hash, replace: (to) => calls.replace.push(to) },
    document: { getElementById: (id) => (id === 'hm-claim-status' ? box : null), querySelector: () => null },
    fetch: (to) => { calls.fetch.push(String(to)); return Promise.resolve({ ok: true, json: () => Promise.resolve({ features: parcel ? [{ attributes: parcel }] : [] }) }); }
  };
  vm.runInNewContext(claimSource, context);
  const api = window.WatchdogHomeClaim;
  const ctx = (rows) => ({ client, rows, current: rows[0] || null, show: (row) => calls.show.push(row), toast: (m) => calls.toast.push(m) });
  return { api, calls, box, ctx };
}

// Entry parsing
assert.equal(sandbox('https://www.watchdogindex.com/home?pin=0904_9_20').api.request(), null, 'plain /home?pin= is not a claim');
assert.equal(sandbox('https://www.watchdogindex.com/home?pin=bad%27pin&claim=1').api.request(), null, 'malformed PINs are ignored');
assert.deepEqual({ ...sandbox('https://www.watchdogindex.com/home?pin=0904_9_20&claim=1#photo').api.request() }, { pin: '0904_9_20', photo: true });

// Signed out: straight to the email-code sign-in, returning to the same clean URL.
{
  const s = sandbox('https://www.watchdogindex.com/home?pin=0904_9_20&claim=1#photo');
  assert.equal(s.api.signIn(), true);
  assert.deepEqual(s.calls.replace, ['https://www.watchdogindex.com/onboarding/?next=' + encodeURIComponent('/home?pin=0904_9_20&claim=1#photo')]);
  const plain = sandbox('https://www.watchdogindex.com/home?pin=0904_9_20');
  assert.equal(plain.api.signIn(), false, 'non-claim visits keep the normal sign-in gate');
  assert.equal(plain.calls.replace.length, 0);
}

// Signed in, not saved: parcel record -> save as home -> verification opens with the address prefilled.
{
  const parcel = { PAMS_PIN: '0904_9_20', PROP_LOC: '102 GRANT AVE', MUN_NAME: 'HARRISON TOWN', COUNTY: 'HUDSON', PCLBLOCK: '9', PCLLOT: '20', NET_VALUE: 424300, LAST_YR_TX: 9954.08 };
  const savedHome = { id: 'row-1', pams_pin: '0904_9_20', kind: 'home', address: '102 Grant Ave', town: 'HARRISON TOWN', zip: null, verify_level: null };
  const s = sandbox('https://www.watchdogindex.com/home?pin=0904_9_20&claim=1', { parcel, savedHome });
  const row = await s.api.start(s.ctx([{ id: 'other', pams_pin: '1111_1_1', kind: 'home', address: '1 Other St' }]));
  assert.equal(row, savedHome);
  assert.equal(s.calls.fetch.length, 1);
  const q = new URL(s.calls.fetch[0]).searchParams;
  assert.equal(q.get('where'), "PAMS_PIN='0904_9_20'");
  assert.equal(q.get('returnGeometry'), 'false');
  const [name, args] = s.calls.rpc[0];
  assert.equal(name, 'save_property');
  assert.equal(args.p.kind, 'home');
  assert.equal(args.p.address, '102 Grant Ave');
  assert.equal(args.p.town, 'HARRISON TOWN');
  assert.ok(!('zip' in args.p), 'no parcel ZIP (owner mailing) is saved');
  assert.deepEqual(s.calls.show, [savedHome], 'the claimed home is shown');
  assert.deepEqual(s.calls.verify, [['0904_9_20', '102 Grant Ave', 'HARRISON TOWN', '']], 'existing verification opens for that property');
  assert.equal(s.box.visibleState(), 'pending');
  s.box.verifyButton.handlers[0]();
  assert.equal(s.calls.verify.length, 2, '"Enter my code" reopens the same verification');
}

// Signed in, saved as home but unverified: no second save, verification opens with the saved ZIP.
{
  const home = { id: 'row-2', pams_pin: '0904_9_20', kind: 'home', address: '102 Grant Ave', town: 'Harrison', zip: '07029', verify_level: null };
  const s = sandbox('https://www.watchdogindex.com/home?pin=0904_9_20&claim=1', {});
  await s.api.start(s.ctx([home]));
  assert.equal(s.calls.rpc.length, 0);
  assert.equal(s.calls.fetch.length, 0);
  assert.deepEqual(s.calls.verify, [['0904_9_20', '102 Grant Ave', 'Harrison', '07029']]);
  assert.equal(s.box.visibleState(), 'pending');
}

// Signed in, already verified: the home shows normally with a confirmation; no verification prompt.
{
  const home = { id: 'row-3', pams_pin: '0904_9_20', kind: 'home', address: '102 Grant Ave', town: 'Harrison', verify_level: 'mail' };
  const s = sandbox('https://www.watchdogindex.com/home?pin=0904_9_20&claim=1', {});
  await s.api.start(s.ctx([home]));
  assert.equal(s.calls.verify.length, 0);
  assert.equal(s.calls.rpc.length, 0);
  assert.equal(s.calls.show.length, 0, 'already the current property');
  assert.equal(s.box.visibleState(), 'verified');
}

// Parcel not found: a friendly retry line, nothing saved.
{
  const s = sandbox('https://www.watchdogindex.com/home?pin=0904_9_20&claim=1', { parcel: null });
  assert.equal(await s.api.start(s.ctx([])), null);
  assert.equal(s.calls.rpc.length, 0);
  assert.equal(s.calls.verify.length, 0);
  assert.equal(s.box.visibleState(), 'unavailable');
}

console.log('home claim contract: ok');
