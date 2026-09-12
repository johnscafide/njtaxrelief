import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=(p)=>fs.readFileSync(p,'utf8');
const nudge=read('property/js/profile-setup-nudge.js');
const partial=read('property/partials/profile-setup-nudge.html');
const css=read('property/css/profile-setup-nudge.css');
const jump=read('property/js/landing-anchor-jump.js');

assert.match(jump,/profile-setup-nudge\.js/);
assert.match(nudge,/watchdogindex\.com/);
assert.match(nudge,/getSession/);
assert.match(nudge,/get_my_watchdog_onboarding_state/);
assert.match(nudge,/profile-setup-nudge\.html/);
assert.match(nudge,/profile-setup-nudge\.css/);
assert.match(partial,/Finish setting up Watchdog/);
assert.match(partial,/\/onboarding\/\?next=/);
assert.match(css,/wd-profile-nudge-card/);
assert.doesNotMatch(nudge,/gtag|clarity|analytics/i);
console.log('NJW-335 homepage profile setup nudge contract passed');
