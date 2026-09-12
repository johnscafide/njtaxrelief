import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const social = read('property/js/anchor-application-social-link.js');
const partial = read('property/partials/anchor-application-social-link.html');
const css = read('property/css/anchor-application-social-link.css');
const growth = read('property/js/anchor-application-2025-growth.js');

assert.match(growth, /anchor-application-social-link\.js/);
assert.match(social, /getUserIdentities/);
assert.match(social, /linkIdentity/);
assert.doesNotMatch(social, /signInWithOAuth/);
assert.match(social, /anchor-social-linked/);
assert.match(social, /WatchdogAuth/);
assert.match(partial, /data-anchor-social-provider="google"/);
assert.match(partial, /data-anchor-social-provider="facebook"/);
assert.match(partial, /data-anchor-social-provider="linkedin_oidc"/);
assert.match(partial, /same Watchdog account/i);
assert.match(partial, /application answers are not sent to the sign-in provider/i);
assert.match(css, /@media\(max-width:640px\)/);
assert.doesNotMatch(social, /ssn|social_security|gross_income|disability|recovery[_ -]?key|pdf_generated/i);
assert.doesNotMatch(social, /gtag|clarity|analytics/i);

console.log('NJW-330 ANCHOR social identity link contract passed');
