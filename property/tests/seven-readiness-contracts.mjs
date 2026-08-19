import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));

const tracks = [
  'property/docs/compliance/ASVS-5-L2-BASELINE.md',
  'property/docs/compliance/NIST-CSF-2-PROFILE.md',
  'property/docs/compliance/WCAG-2.2-AA-BASELINE.md',
  'property/docs/compliance/TLS-SECURITY-BASELINE.md',
  'property/docs/compliance/PCI-SCOPE-MEMO.md',
  'property/docs/compliance/NJDPA-DATA-PROTECTION-ASSESSMENT.md',
  'property/trust/index.html'
];
tracks.forEach((relative) => assert.equal(exists(relative), true, `Missing no-cost readiness track: ${relative}`));

const asvs = read(tracks[0]);
assert.match(asvs, /ASVS 5\.0\.0/i);
assert.match(asvs, /Level 2/i);
assert.match(asvs, /not an OWASP certification|not.*certification/i);
assert.match(asvs, /v5\.0\.0-x\.y\.z/i);

const nist = read(tracks[1]);
for (const fn of ['Govern','Identify','Protect','Detect','Respond','Recover']) assert.match(nist, new RegExp(fn, 'i'));
assert.match(nist, /Current profile/i);
assert.match(nist, /Target profile/i);

const wcag = read(tracks[2]);
assert.match(wcag, /WCAG 2\.2 Level AA/i);
assert.match(wcag, /No site-wide WCAG 2\.2 AA conformance claim/i);
for (const check of ['Keyboard','focus','reflow','contrast','screen-reader']) assert.match(wcag, new RegExp(check, 'i'));

const tls = read(tracks[3]);
for (const control of ['HTTPS','Strict-Transport-Security','certificate','SSL Labs']) assert.match(tls, new RegExp(control, 'i'));
assert.match(tls, /must not publish.*A\+/i);

const pci = read(tracks[4]);
assert.match(pci, /Stripe Checkout Session/i);
assert.match(pci, /candidate classification only/i);
assert.match(pci, /Approved Scanning Vendor|ASV/i);
assert.doesNotMatch(pci, /Watchdog is PCI (?:DSS )?certified/i);

const njdpa = read(tracks[5]);
assert.match(njdpa, /P\.L\.2023, c\.266/i);
assert.match(njdpa, /heightened risk/i);
assert.match(njdpa, /does not make every financial fact sensitive/i);
assert.match(njdpa, /data protection assessment/i);

const trust = read(tracks[6]);
assert.match(trust, /Security &amp; Trust|Security & Trust/i);
assert.match(trust, /not currently claiming SOC 2/i);
assert.match(trust, /Stripe-hosted Checkout/i);
assert.match(trust, /WCAG 2\.2 Level AA is the target/i);
assert.doesNotMatch(trust, /SOC 2 certified|ISO 27001 certified|OWASP certified|PCI certified/i);

console.log('Seven-track zero-cost compliance readiness contracts passed.');
