#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const bridge = read('property/js/watchdog-home-semantic-bridge.js');
const loader = read('property/js/dashboard/home/home-menu-sync.js');

assert(bridge.includes("from('score_observations')"), 'Property Home bridge must query score_observations.');
assert(bridge.includes("select('pams_pin,marker_id,score,observed_at,model_version')"), 'Score history must use the governed five-column contract.');
assert(bridge.includes(".eq('pams_pin',pin)"), 'Score history must filter by pams_pin.');
assert(bridge.includes(".eq('marker_id',marker)"), 'Score history must filter by marker_id.');
assert(bridge.includes(".order('observed_at',{ascending:true})"), 'Score history must render in chronological observed_at order.');
assert(!bridge.includes(".eq('user_id'"), 'Global score history must not invent user ownership.');
assert(!bridge.includes('observed_on'), 'Score history must not query nonexistent observed_on.');
assert(bridge.includes("new CustomEvent('watchdog:property-context'"), 'Property Home must publish its selected property into the shared Phase 7 context contract.');
assert(bridge.includes("authoritative:true"), 'Selected Property Home pin must be published as authoritative page context.');
assert(bridge.includes("scope_type:'property'"), 'Property Home context must remain a single-property scope.');

for (const asset of [
  '/property/js/watchdog-intelligence-context.js',
  '/property/js/watchdog-semantic-context.js',
  '/property/js/watchdog-page-context.js',
  '/property/js/watchdog-home-semantic-bridge.js',
  '/property/js/watchdog-context-feedback.js'
]) {
  assert(loader.includes("'" + asset + "'"), `Property Home runtime must load ${asset}.`);
}
assert(!loader.includes('?v='), 'Property Home Intelligence runtime assets must not use cache-busting ?v= URLs.');

if (failures.length) {
  console.error(JSON.stringify({ passed: false, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  passed: true,
  contract: 'property-home-global-score-history-v2',
  checks: 16
}, null, 2));
