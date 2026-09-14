#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const page = read('property/dashboard/index.html');
const css = read('property/css/dashboard/watchdog-dashboard-landing-shell.css');
const js = read('property/js/dashboard/watchdog-dashboard-landing-shell.js');

function expect(value, message) {
  if (!value) throw new Error(message);
}

expect(page.includes('class="wdm-topbar"'), 'landing-style dashboard topbar missing');
expect(page.includes('id="wdm-sidebar"'), 'integrated desktop sidebar missing');
expect(page.includes('/agent/assets/watchdog-logo.svg'), 'dashboard must reuse landing-page Watchdog logo asset');
expect(page.includes('Search by address, owner, block & lot, or city...'), 'landing-page search treatment missing');
expect(page.includes('id="wdm-overview"'), 'selected-property overview surface missing');
expect(page.includes('/property/css/dashboard/watchdog-dashboard-landing-shell.css'), 'landing shell CSS not attached');
expect(page.includes('/property/js/dashboard/watchdog-dashboard-landing-shell.js'), 'landing shell JS not attached');
expect(!page.includes('/property/js/app-shell-2027.js'), 'old injected app shell must not load on redesigned dashboard');
expect(!page.includes('/property/js/watchdog-universal-menu.js'), 'old popout universal menu must not load on redesigned dashboard');

for (const label of ['Dashboard','Property Search','Opportunity Desk','My Properties','Change Alerts','Reports','Market Insights','New Jersey Data','Settings','Help']) {
  expect(page.includes('>'+label+'<'), `integrated navigation item missing: ${label}`);
}

expect(css.includes('--wdm-sidebar:214px'), 'desktop sidebar proportion missing');
expect(css.includes('.wdm-search{'), 'top search styling missing');
expect(css.includes('.wdm-property{'), 'selected-property strip styling missing');
expect(css.includes('grid-template-columns:repeat(4,minmax(0,1fr))'), 'four-card intelligence layout missing');
expect(css.includes('.wdm-overview-bottom{display:grid'), 'landing-style lower dashboard split missing');
expect(css.includes('@media(max-width:900px)'), 'mobile sidebar behavior missing');
expect(css.includes('body.wdm-dashboard-shell .wdd-boot[hidden]{display:none!important}'), 'dashboard loader hidden-state guard missing');

expect(js.includes('WD.filtered()'), 'redesign must read the live filtered property set');
expect(js.includes('WD.stats()'), 'redesign must preserve live dashboard statistics');
expect(js.includes('property.watchdog_value'), 'selected-property market estimate must use live data');
expect(js.includes('property.assessed'), 'selected-property assessment must use live data');
expect(js.includes('property.last_year_tax'), 'selected-property tax must use live data');
expect(js.includes('WD.S.changes'), 'recent changes must use live data');
expect(js.includes('WD.S.scoreHistory'), 'score history must use live observations when available');
expect(js.includes("typeof WD.db === 'function' ? WD.db()"), 'integrated account menu must resolve the shared Supabase client');
expect(js.includes("client.auth.signOut()"), 'integrated account menu must retain sign-out behavior');
expect(!js.includes('12 Maple Ridge Drive'), 'marketing sample address must not leak into the real dashboard');
expect(!js.includes('$1,247,000'), 'marketing sample value must not leak into the real dashboard');

console.log('dashboard landing-shell contract: ok');
