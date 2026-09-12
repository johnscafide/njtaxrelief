import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=(p)=>fs.readFileSync(p,'utf8');
const account=read('property/js/account-identities.js');
const accountPartial=read('property/partials/account-identity-security.html');
const nudge=read('property/js/profile-setup-nudge.js');
const nudgePartial=read('property/partials/profile-setup-nudge.html');
const onboarding=read('property/js/onboarding.js');
const profile=read('property/js/account-profile.js');

assert.match(onboarding,/get_my_watchdog_onboarding_state/);
assert.match(onboarding,/complete_my_watchdog_onboarding_v2/);
assert.match(account,/get_my_watchdog_onboarding_state/);
assert.match(accountPartial,/Finish setting up Watchdog/);
assert.match(nudge,/get_my_watchdog_onboarding_state/);
assert.match(nudgePartial,/Finish setting up Watchdog/);
assert.match(profile,/update_my_watchdog_profile_v1/);
assert.match(profile,/Your Watchdog profile|profile/i);
console.log('NJW-335 onboarding discoverability contract passed');
