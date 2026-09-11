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
assert.match(pro, /Soft launch · enrollment open/);
assert.match(pro, /data-cadence="lifetime"/);
assert.match(pro, /Founding Lifetime/);
assert.match(pro, /data-billing-plan="agent"/);
assert.match(pro, /data-billing-plan="pro"/);
assert.match(pro, /data-billing-plan="pro_plus"/);
assert.match(pro, /Paid enrollment is open for Agent, Pro and Pro\+/);
assert.match(pro, /pro-soft-launch\.css/);

assert.match(appShell, /class="wd4-brand" href="\/property\/" aria-label="Watchdog property lookup"/);
assert.match(appShell, /class="wdx-brand" href="\/property\/" aria-label="Watchdog property lookup"/);
assert.doesNotMatch(appShell, /class="wd4-brand" href="\/property\/dashboard"/);
assert.match(sideMenu, /class="db-side-brand" href="\/property\/" aria-label="Watchdog property lookup"/);
assert.match(sideMenu, /class="wd-mobile-menu-brand" href="\/property\/" aria-label="Watchdog property lookup"/);

assert.match(proJs, /if\(b\.dataset\.cadence==='lifetime'\)return/);
assert.match(proJs, /Thanks\. We will reply about the best-fit plan\./);

console.log('Live soft-launch UI contract passed.');
