import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(p, 'utf8');
const processJs = read('property/js/anchor-application-process.js');
const partial = read('property/partials/anchor-application-process.html');
const css = read('property/css/anchor-application-process.css');
const social = read('property/js/anchor-application-social-link.js');
const library = read('property/js/anchor-application-library-filing.js');
const libraryHtml = read('property/anchor/applications/index.html');

assert.match(social, /anchor-application-process\.js/);
assert.match(partial, /Save &amp; exit/);
assert.match(processJs, /anchor_applications/);
assert.match(processJs, /updated_at/);
assert.match(partial, /FILING CENTER/);
assert.match(processJs, /set_my_anchor_filing_state/);
assert.match(processJs, /not_filed|ready_to_file/);
assert.match(processJs, /mailed/);
assert.match(processJs, /filed_other/);
assert.match(processJs, /anchor_program_deadlines/);
assert.match(processJs, /set_my_anchor_reminder/);
assert.match(partial, /14 days before/);
assert.match(partial, /7 days before/);
assert.doesNotMatch(partial, /November 2|Nov\. 2|11\/02\/2026/);
assert.match(partial, /Why are we asking this\?/);
assert.match(partial, /Review PDF/);
assert.match(processJs, /wd-inline-error/);
assert.match(processJs, /Enter all ten PAS-1 income amounts\. Enter 0 where the correct amount is zero\./);
assert.match(processJs, /SAFE_REUSE/);
for (const forbidden of ['applicant.ssn','spouse.ssn','filing_status','ssd_2025','railroad_disability_2025','income_2024','income_2025','recovery']) {
  const safeLine = processJs.match(/var SAFE_REUSE=\[[^;]+/s)?.[0] || '';
  assert.ok(!safeLine.includes(forbidden), `safe reuse must not contain ${forbidden}`);
}
assert.match(social, /new URL\(location\.href\)/);
assert.match(social, /anchor-social-linked/);
assert.doesNotMatch(processJs, /gtag|clarity|analytics|social_security/);
assert.match(library, /anchor_application_filing_state/);
assert.match(library, /anchor_application_reminders/);
assert.match(libraryHtml, /anchor-application-library-filing\.js/);
assert.match(css, /@media\(max-width:640px\)/);

console.log('NJW-333 ANCHOR application process contract passed');