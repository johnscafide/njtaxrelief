#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const exactColumns = 'pams_pin,marker_id,score,observed_at,model_version';
const dashboard = read('property/js/dashboard/dashboard-exact.js');
const propertyDashboard = read('property/js/dashboard/home/property-dashboard.js');

const dashboardQuery = dashboard.match(/from\(['"]score_observations['"]\)\.select\(['"]([^'"]+)['"]\)/);
assert(Boolean(dashboardQuery), '2027 Dashboard must contain a score_observations select.');
if (dashboardQuery) {
  assert(dashboardQuery[1] === exactColumns, `2027 Dashboard score_observations columns must be exactly ${exactColumns}.`);
  assert(!/observed_on|evidence_coverage|user_id/.test(dashboardQuery[1]), '2027 Dashboard must not request retired/private score history columns.');
}
assert(!/r\.observed_at\s*\|\|\s*r\.observed_on/.test(dashboard), '2027 Dashboard must use observed_at only for score history dates.');

const historyBlock = propertyDashboard.match(/function loadScoreHistory\(pin\) \{([\s\S]*?)\n  \}\n\n  function paidPlan/);
assert(Boolean(historyBlock), 'Property Dashboard loadScoreHistory block must exist.');
if (historyBlock) {
  const block = historyBlock[1];
  const select = block.match(/from\(['"]score_observations['"]\)\s*\n\s*\.select\(['"]([^'"]+)['"]\)/);
  assert(Boolean(select), 'Property Dashboard must select score_observations inside loadScoreHistory.');
  if (select) assert(select[1] === exactColumns, `Property Dashboard score_observations columns must be exactly ${exactColumns}.`);
  assert(!/\.eq\(['"]user_id['"]/.test(block), 'Property Dashboard global score history must not filter by user_id.');
  assert(/\.eq\(['"]pams_pin['"],\s*pin\)/.test(block), 'Property Dashboard score history must remain filtered by pams_pin.');
  assert(/\.eq\(['"]marker_id['"],\s*marker\.id\)/.test(block), 'Property Dashboard score history must remain filtered by marker_id.');
  assert(/\.order\(['"]observed_at['"],\s*\{\s*ascending:\s*true\s*\}\)/.test(block), 'Property Dashboard score history must remain chronological by observed_at.');
}

if (failures.length) {
  console.error(JSON.stringify({ passed: false, contract: 'global-score-observations-schema-v1', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  passed: true,
  contract: 'global-score-observations-schema-v1',
  columns: exactColumns.split(','),
  readers: ['dashboard-exact.js', 'home/property-dashboard.js']
}, null, 2));
