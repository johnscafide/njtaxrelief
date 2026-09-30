import assert from 'node:assert/strict';
import fs from 'node:fs';

// The statewide town scan copies raw page and PDF text. Agents must only ever see
// requirements, fees and application links a person has checked (curated_override);
// everything else stays in metadata.unchecked and agents get the official links.
const read = (p) => fs.readFileSync(p, 'utf8');
const fn = read('supabase/functions/transaction-municipal-requirements/index.ts');
const publisher = read('property/scripts/publish_transaction_municipal_requirements.py');
const migration = read('supabase/migrations/20260930150000_municipal_requirements_hold_unchecked.sql');

// ---------- edge function ----------
assert.match(fn, /const checked=r\.curated_override===true;/, 'function decides from curated_override');
assert.match(fn, /requirements=checked&&Array\.isArray\(r\.requirements\)\?r\.requirements:\[\]/, 'unchecked requirements are never shown');
assert.match(fn, /fees=checked&&Array\.isArray\(r\.fees\)\?r\.fees:\[\]/, 'unchecked fees are never shown');
assert.match(fn, /applicationUrl=checked\?usableLink\(r\.application_url\):null/, 'only a checked row has an application link');
assert.match(fn, /filter\(\(s:Row\)=>usableLink\(s\?\.url\)\)/, 'official source links drop account and news pages');
assert.match(fn, /details_checked:checked/, 'payload says whether a person checked the details');
assert.match(fn, /const preserveExisting=!checked && \(/, 'a person-checked row always replaces older saved evidence');
assert.doesNotMatch(fn, /application_url:r\.application_url/, 'raw application links never reach the payload');
assert.doesNotMatch(fn, /r\.application_url\|\|/, 'raw application links never become the source link');

const skip = new RegExp(fn.match(/const SKIP_LINK=\/(.+)\/i;/)[1], 'i');
for (const bad of [
  'https://www.middletownnj.org/MyAccount/ProfileCreate',
  'https://cityofrahway.org/MyAccount',
  'https://cpauthentication.civicplus.com/Identity/Account/Register?returnUrl=x',
  'https://www.laurelsprings-nj.com/Identity/Account/ForgotPassword?returnUrl=x',
  'https://www.twp.woodbridge.nj.us/m/newsflash/home/detail/1051',
]) assert.ok(skip.test(bad), `skips ${bad}`);
for (const good of [
  'https://www.lindenwoldnj.gov/code-enforcement-housing/files/residential-property-sales-inspection-application-cco-certificate',
  'https://boroughofpalmyra.com/government/Documents/Government/Forms/Resale-Inspection-App.pdf',
  'https://firesolutions.dca.nj.gov/ultra-fire-home/smoke-application-create/',
  'https://www.sdlportal.com/login?redirect=https%3A%2F%2Fwww.sdlportal.com%2Ftowns%2Fnj%2Fcamden%2Frunnemede%2Frequests%2FsmokeAlarm',
]) assert.ok(!skip.test(good), `keeps ${good}`);

// ---------- weekly publisher ----------
assert.match(publisher, /publish_rows = \[hold_unchecked\(r\) for r in rows if/, 'every non-curated row is held before publishing');
assert.match(publisher, /metadata\["unchecked"\] = \{/, 'raw scan text is kept in metadata.unchecked');
assert.match(publisher, /curated_override=eq\.true/, 'person-checked rows are still never overwritten');
assert.equal(
  publisher.match(/SKIP_LINK = re\.compile\(r"(.+)", re\.I\)/)[1].replace(/\\\\/g, '\\'),
  fn.match(/const SKIP_LINK=\/(.+)\/i;/)[1].replace(/\\\//g, '/'),
  'publisher and function skip the same links',
);

// ---------- one-time cleanup ----------
assert.match(migration, /where not t\.curated_override/, 'cleanup leaves person-checked rows alone');
assert.match(migration, /coalesce\(t\.metadata->'unchecked'/, 'cleanup is safe to re-run');
assert.match(migration, /and i\.payload \? 'requirement_state'/, 'hand-entered transaction evidence is untouched');
assert.doesNotMatch(migration, /[–—]/, 'no em or en dashes in customer copy');
assert.doesNotMatch(fn.match(/const note=[^\n]+/)[0], /[–—]/, 'no em or en dashes in customer copy');

console.log('Municipal requirements unchecked-text contract passed.');
