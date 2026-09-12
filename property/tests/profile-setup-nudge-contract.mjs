import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=(p)=>fs.readFileSync(p,'utf8');
const nudge=read('property/js/profile-setup-nudge.js');
const jump=read('property/js/landing-anchor-jump.js');

assert.match(jump,/profile-setup-nudge\.js/);
assert.match(nudge,/watchdogindex\.com/);
assert.match(nudge,/getSession/);
assert.match(nudge,/get_my_watchdog_onboarding_state/);
assert.match(nudge,/Finish setting up Watchdog/);
assert.match(nudge,/\/onboarding\/\?next=/);
assert.doesNotMatch(nudge,/gtag|clarity|analytics/i);
console.log('NJW-335 homepage profile setup nudge contract passed');
