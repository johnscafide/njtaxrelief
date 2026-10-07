import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');
const [pro, appShell, sideMenu, proJs] = await Promise.all([
  read('property/pro/index.html'),
  read('property/js/app-shell-2027.js'),
  read('property/partials/sidemenu.html'),
  read('property/js/pro.js')
]);

assert.doesNotMatch(pro, /September 16|Join Agent launch list|Join Pro launch list|Join Pro\+ launch list|Get the launch notice|Join the launch list/i);
// Owner decision 2026-10-07: Agent and Professional are a one-time Lifetime
// purchase. No trial, no monthly or yearly plans.
assert.doesNotMatch(pro, /Soft launch live|Soft launch · enrollment open/);
assert.doesNotMatch(pro, /free for 14 days|Renews automatically|data-cadence="monthly"|data-cadence="yearly"/i);
assert.match(pro, /Pay once\. Use it for life\./);
assert.match(pro, /data-lifetime-plan="agent"/);
assert.match(pro, /data-lifetime-plan="pro_plus"/);
assert.match(pro, /data-billing-plan="agent"/);
assert.doesNotMatch(pro, /data-billing-plan="pro"/);
assert.match(pro, /data-billing-plan="pro_plus"/);
assert.match(pro, /\/property\/css\/pro-2026\.css/);

// The app-shell logo still opens property lookup; it now uses the host-aware clean route ("/" on WatchdogIndex).
assert.match(appShell, /class="wdx-brand" href="'\+route\('\/'\)\+'" aria-label="Watchdog property lookup"/);
// The app shell no longer renders its own drawer; the shared universal drawer owns navigation.
assert.doesNotMatch(appShell, /wd4-nav|wd4-brand/);
assert.match(sideMenu, /class="db-side-brand" href="\/property\/" aria-label="Watchdog property lookup"/);
assert.match(sideMenu, /class="wd-mobile-menu-brand" href="\/property\/" aria-label="Watchdog property lookup"/);

assert.doesNotMatch(proJs, /priceData|function pricing\(/);
assert.match(proJs, /Thanks\. We will reply about the best-fit plan\./);

console.log('Live soft-launch UI contract passed.');
