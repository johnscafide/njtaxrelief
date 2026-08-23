#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const clientHistoryColumns = 'pams_pin,marker_id,score,observed_at,model_version';
const dashboard = read('property/js/dashboard/dashboard-exact.js');
const propertyDashboard = read('property/js/dashboard/home/property-dashboard.js');
const homeBridge = read('property/js/watchdog-home-semantic-bridge.js');

const dashboardQuery = dashboard.match(/from\(['"]score_observations['"]\)\.select\(['"]([^'"]+)['"]\)/);
assert(Boolean(dashboardQuery), '2027 Dashboard must contain a score_observations select.');
if (dashboardQuery) {
  assert(dashboardQuery[1] === clientHistoryColumns, `2027 Dashboard score history columns must be exactly ${clientHistoryColumns}.`);
  assert(!/observed_on|evidence_coverage|user_id/.test(dashboardQuery[1]), '2027 Dashboard must not widen the governed browser history projection with legacy/internal columns.');
}
assert(!/r\.observed_at\s*\|\|\s*r\.observed_on/.test(dashboard), '2027 Dashboard must use observed_at only for score history dates.');

const historyBlock = propertyDashboard.match(/function loadScoreHistory\(pin\) \{([\s\S]*?)\n  \}\n\n  function paidPlan/);
assert(Boolean(historyBlock), 'Property Dashboard loadScoreHistory block must exist.');
if (historyBlock) {
  const block = historyBlock[1];
  const select = block.match(/from\(['"]score_observations['"]\)\s*\n\s*\.select\(['"]([^'"]+)['"]\)/);
  assert(Boolean(select), 'Property Dashboard must select score_observations inside loadScoreHistory.');
  if (select) assert(select[1] === clientHistoryColumns, `Property Dashboard score history columns must be exactly ${clientHistoryColumns}.`);
  assert(!/\.eq\(['"]user_id['"]/.test(block), 'Property Dashboard must leave score-history row ownership to Supabase RLS rather than duplicating user_id filtering in client code.');
  assert(/\.eq\(['"]pams_pin['"],\s*pin\)/.test(block), 'Property Dashboard score history must remain filtered by pams_pin.');
  assert(/\.eq\(['"]marker_id['"],\s*marker\.id\)/.test(block), 'Property Dashboard score history must remain filtered by marker_id.');
  assert(/\.order\(['"]observed_at['"],\s*\{\s*ascending:\s*true\s*\}\)/.test(block), 'Property Dashboard score history must remain chronological by observed_at.');
}

const bridgeQuery = homeBridge.match(/from\(['"]score_observations['"]\)\s*\n\s*\.select\(['"]([^'"]+)['"]\)/);
assert(Boolean(bridgeQuery), 'Property Home semantic bridge must contain a score_observations select.');
if (bridgeQuery) {
  assert(bridgeQuery[1] === clientHistoryColumns, `Property Home semantic bridge score history columns must be exactly ${clientHistoryColumns}.`);
}
assert(!/\.eq\(['"]user_id['"]/.test(homeBridge), 'Property Home semantic bridge must leave score-history row ownership to Supabase RLS rather than duplicating user_id filtering in client code.');
assert(!homeBridge.includes('observed_on'), 'Property Home semantic bridge must use observed_at rather than the legacy observed_on field.');
assert(!homeBridge.includes('evidence_coverage'), 'Property Home semantic bridge must not widen the browser history projection with internal calibration coverage.');
assert(homeBridge.includes(".eq('pams_pin',pin)"), 'Property Home semantic bridge must remain filtered by pams_pin.');
assert(homeBridge.includes(".eq('marker_id',marker)"), 'Property Home semantic bridge must remain filtered by marker_id.');
assert(homeBridge.includes(".eq('model_version',model)"), 'Property Home semantic bridge must remain pinned to the canonical model version.');
assert(homeBridge.includes(".order('observed_at',{ascending:true})"), 'Property Home semantic bridge must remain chronological by observed_at.');

if (failures.length) {
  console.error(JSON.stringify({ passed: false, contract: 'score-observations-client-history-v2', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  passed: true,
  contract: 'score-observations-client-history-v2',
  columns: clientHistoryColumns.split(','),
  ownership: 'supabase-rls',
  readers: ['dashboard-exact.js', 'home/property-dashboard.js', 'watchdog-home-semantic-bridge.js']
}, null, 2));
