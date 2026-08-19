import fs from 'node:fs';
import assert from 'node:assert/strict';

const graphPath='property/js/dashboard/home/watchdog-data-graph.js';
const cssPath='property/css/home/watchdog-data-graph.css';
const loaderPath='property/js/dashboard/home/home-menu-sync.js';

for (const p of [graphPath,cssPath,loaderPath]) assert.equal(fs.existsSync(p),true,`${p} must exist`);
const graph=fs.readFileSync(graphPath,'utf8');
const css=fs.readFileSync(cssPath,'utf8');
const loader=fs.readFileSync(loaderPath,'utf8');

assert.match(loader,/watchdog-data-graph\.js/,'Property Home must load the Data Graph runtime');
assert.match(graph,/WatchdogSemanticContext\.get/,'Data Graph must resolve governed Semantic Context rather than inventing counts');
assert.match(graph,/state==='available'/,'Only available markers may be counted as resolved property evidence');
assert.match(graph,/truth_class/,'Graph must preserve truth-class distinctions');
assert.match(graph,/source_fact/,'Graph must distinguish source facts');
assert.match(graph,/derived_signal/,'Graph must distinguish derived signals');
assert.match(graph,/source_id\|\|m\.provider_kind/,'Graph must retain provider/source lineage');
assert.match(graph,/intelligence_findings/,'Graph may surface persisted Intelligence lineage');
assert.match(graph,/intelligence_runs/,'Graph must connect findings to model/version runs');
assert.match(graph,/recommended_actions/,'Action counts must come from persisted finding actions');
assert.match(graph,/registry_total_markers/,'Registry universe must remain distinct from property-level availability');
assert.match(graph,/does not mean Watchdog has only/,'UI must explicitly prevent registry/property-evidence count confusion');
assert.match(graph,/planned, missing or unentitled marker as available data/,'UI must not imply missing or unentitled markers are available');
assert.match(graph,/placeholder counts/,'Failure state must refuse fabricated placeholder counts');
assert.match(graph,/preserved conflicts/,'Graph must expose preserved source conflicts');
assert.match(graph,/authority policy/,'Graph must expose authority-policy lineage');
assert.match(graph,/semantic contract/,'Graph must expose semantic contract lineage');
assert.match(css,/wdg-details\[hidden\]/,'Graph details disclosure must support an accessible hidden state');
assert.match(graph,/aria-expanded/,'Graph details disclosure must expose expansion state');
assert.equal(/\?v=/.test(graph),false,'Data Graph JS must not introduce version query strings');
assert.equal(/\?v=/.test(css),false,'Data Graph CSS must not introduce version query strings');

console.log('Watchdog Data Graph contract passed');
