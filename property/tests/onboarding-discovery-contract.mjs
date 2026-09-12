import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=(p)=>fs.readFileSync(p,'utf8');
const account=read('property/js/account-identities.js');
const nudge=read('property/js/profile-setup-nudge.js');
const onboarding=read('property/js/onboarding.js');
const profile=read('property/js/account-profile.js');

assert.match(onboarding,/get_my_watchdog_onboarding_state/);
assert.match(onboarding,/complete_my_watchdog_onboarding_v2/);
assert.match(account,/Finish setting up Watchdog/);
assert.match(nudge,/Finish setting up Watchdog/);
assert.match(profile,/update_my_watchdog_profile_v1/);
assert.match(profile,/Your Watchdog profile|profile/i);
console.log('NJW-335 onboarding discoverability contract passed');
