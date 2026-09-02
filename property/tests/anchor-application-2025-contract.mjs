import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(p, 'utf8');
const appHtml = read('property/anchor/application/2025/index.html');
const libraryHtml = read('property/anchor/applications/index.html');
const appJs = read('property/js/anchor-application-2025.js');
const vaultJs = read('property/js/anchor-application-vault.js');
const pdfJs = read('property/js/anchor-application-pdf-2025.js');
const fieldsJs = read('property/js/anchor-application-2025-fields.js');
const proxyJs = read('api/anchor-form-template.js');

for (const html of [appHtml, libraryHtml]) {
  assert.match(html, /watchdog-consent\.js/);
  assert.match(html, /ai-referral-analytics\.js/);
  assert.match(html, /contact-routing-policy\.js/);
  assert.doesNotMatch(html, /clarity\.ms\/tag/i);
  assert.doesNotMatch(html, /googletagmanager\.com\/gtag/i);
}

assert.match(appHtml, /\/property\/js\/anchor-application-vault\.js/);
assert.match(appHtml, /\/property\/js\/anchor-application-2025-fields\.js/);
assert.match(appHtml, /\/property\/js\/anchor-application-pdf-2025\.js/);
assert.match(appHtml, /\/property\/js\/anchor-application-2025\.js/);
assert.match(appHtml, /id="wd-recovery-key"/);
assert.match(appHtml, /id="wd-review-confirm"/);
assert.match(appHtml, /review, sign, and date/i);
assert.match(appHtml, /Support Watchdog/);
assert.match(appHtml, /disabled>Support Watchdog/);

assert.doesNotMatch(appJs, /localStorage/);
assert.doesNotMatch(vaultJs, /localStorage/);
assert.doesNotMatch(appJs, /console\.(?:log|info|debug)\s*\(/);
assert.doesNotMatch(vaultJs, /console\.(?:log|info|debug)\s*\(/);
assert.match(vaultJs, /AES-GCM/);
assert.match(vaultJs, /crypto\.subtle\.encrypt/);
assert.match(vaultJs, /crypto\.subtle\.decrypt/);
assert.match(vaultJs, /indexedDB/);
assert.match(vaultJs, /key_fingerprint/);
assert.match(appJs, /signInWithOtp/);
assert.match(appJs, /verifyOtp/);
assert.match(appJs, /WatchdogAnchorPdf2025/);
assert.match(appJs, /resident_oct1/);
assert.match(appJs, /pas\.born_1960_or_earlier/);
assert.match(appJs, /1960/);

assert.match(pdfJs, /EXPECTED_FIELD_COUNTS/);
assert.match(pdfJs, /'anc-1': 120/);
assert.match(pdfJs, /'pas-1': 357/);
assert.match(pdfJs, /form\.flatten\(\)/);
assert.match(pdfJs, /signature_date is intentionally never filled/);
assert.match(proxyJs, /1df62f2b2057f527ece24ba64af86e086613cf40164bd7d43b331f789072ae4b/);
assert.match(proxyJs, /03a1a9032337697a3e536f86d65713b4c8261f0799d60e36a563e10d348e6a71/);
assert.match(proxyJs, /state_form_changed/);

const sandbox = { window: {} };
vm.runInNewContext(fieldsJs, sandbox, { filename: 'anchor-application-2025-fields.js' });
const register = sandbox.window.WatchdogAnchor2025Fields;
assert.equal(register.version, '2025.1');
assert.ok(register.forms['anc-1']);
assert.ok(register.forms['pas-1']);
assert.equal(register.forms['anc-1'].signature_date, 'Date1_es_:signer:date');
assert.equal(register.forms['pas-1'].signature_date, 'Date1_es_:signer:date');

console.log('ANCHOR 2025 application contract passed');
