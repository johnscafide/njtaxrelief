import fs from 'node:fs';
import assert from 'node:assert/strict';

const readiness = fs.readFileSync('supabase/functions/intelligence-model-repair-readiness/index.ts','utf8');
const panel = fs.readFileSync('property/js/intelligence-model-repair-readiness.js','utf8');

assert.match(readiness,/watchdog-model-repair-readiness-v4/,'readiness engine must identify the watcher-health contract');
assert.match(readiness,/intelligence_source_fact_watch_control/,'readiness must inspect watcher control state');
assert.match(readiness,/intelligence_source_fact_watch_runs/,'readiness must inspect aggregate watcher runs');
assert.match(readiness,/intelligence_source_fact_watch_state/,'readiness must inspect authoritative watcher baseline state');
assert.match(readiness,/healthy_baseline_no_changes/,'readiness must distinguish healthy no-change evidence from pipeline failure');
assert.match(readiness,/healthy_changes_observed/,'readiness must distinguish actual observed source changes');
assert.match(readiness,/Zero candidates reflects evidence scarcity, not a broken pipeline/,'readiness must explain evidence scarcity explicitly');
assert.doesNotMatch(readiness,/token_hash/,'readiness must never query or return the watcher token hash');
assert.doesNotMatch(readiness,/project_url\s*:/,'readiness response must not serialize the configured project URL');
assert.match(panel,/Longitudinal source-fact watcher/,'developer repair UI must expose watcher health');
assert.match(panel,/SOURCE WATCH HEALTHY/,'developer repair UI must make healthy longitudinal collection explicit');
assert.match(panel,/governed baselines/,'developer repair UI must explain the baseline population');
assert.match(panel,/watchdog-model-repair-readiness-panel-v5/,'panel contract must advance with watcher-health UX');
assert.doesNotMatch(panel,/\?v=/,'repair UI must keep stable asset conventions');

console.log('intelligence-source-fact-watch-readiness-contract: PASS');
