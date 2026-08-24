#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const page = read('property/dashboard/index.html');
const css = read('property/css/dashboard/dashboard-mobile-roomy-20260824.css');

assert(page.includes('/property/css/dashboard/dashboard-mobile-roomy-20260824.css'), 'Dashboard must load the roomy mobile override.');
assert(page.includes('media="(max-width: 768px)"'), 'Roomy dashboard override must stay mobile-only at the HTML boundary.');
assert(css.includes('@media (max-width:768px)'), 'Roomy dashboard CSS must stay scoped to <=768px.');
assert(css.includes('.wdv2-band[data-band="kpis"] > *'), 'KPI band must have an explicit mobile card layout.');
assert(css.includes('grid-column:1/-1!important'), 'Mobile dashboard cards must occupy their own full-width grid row.');
assert(css.includes('min-width:82px!important') && css.includes('.wd4-weather-chip'), 'Mobile weather must be larger than the prior compact chip.');
assert(css.includes('.wd5-properties-wrap') && css.includes('overflow-x:auto!important'), 'Property Portfolio must intentionally scroll horizontally.');
assert(css.includes('.wd5-properties-table') && css.includes('min-width:820px!important'), 'Property Portfolio must preserve readable table column widths on phones.');
assert(css.includes('[data-card-id="properties"].wdv2-card-l') && css.includes('height:auto!important'), 'Property Portfolio must grow with its rows rather than compress into a short desktop card.');
assert(css.includes('.wdv2-skel-kpis') && css.includes('grid-template-columns:minmax(0,1fr)!important'), 'Mobile loading skeleton must match the roomy one-column layout.');

if (failures.length) {
  console.error(JSON.stringify({ passed:false, contract:'dashboard-mobile-roomy-20260824', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  passed:true,
  contract:'dashboard-mobile-roomy-20260824',
  scope:'mobile_only',
  kpi_layout:'one_card_per_row',
  property_portfolio:'horizontal_table_scroll',
  weather:'larger_glanceable_chip'
}, null, 2));
