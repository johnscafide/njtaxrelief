import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const helper = fs.readFileSync(path.join(root, 'property/js/public-score-on-demand.js'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'property/js/public-nav.js'), 'utf8');
const score = fs.readFileSync(path.join(root, 'property/js/watchdog-score-public.js'), 'utf8');

function requireMatch(label, source, pattern) {
  if (!pattern.test(source)) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${label}`);
  }
}

requireMatch('loads public score-on-demand before autocomplete', nav, /public-score-on-demand\.js[\s\S]*nj-address-autocomplete\.js/);
requireMatch('uses the existing workbench-score function instead of adding a parallel scoring endpoint', helper, /\/functions\/v1\/workbench-score/);
requireMatch('requests the bounded public_score mode', helper, /mode\s*:\s*['"]public_score['"]/);
requireMatch('limits autocomplete score batches to eight parcels', helper, /\.slice\(0,8\)/);
requireMatch('derives block and lot from PAMS_PIN when needed', helper, /block:String\(raw\.block\|\|parts\[1\]/);
requireMatch('upgrades only the canonical public realtime score RPC response', helper, /get_public_realtime_watchdog_scores/);
requireMatch('property detail requests score-on-demand directly', score, /function fetchOnDemand[\s\S]*mode:\s*['"]public_score['"]/);
requireMatch('property detail falls back to governed stored observations if the on-demand request fails', score, /fetchOnDemand\(record\)[\s\S]*fetchObservedFallback\(record\)/);
requireMatch('keeps ROBUST-v1 as the only canonical property score model', score, /Core\.isCanonicalVersion/);

if (process.exitCode) throw new Error('Public Watchdog score-on-demand contract failed');
console.log('Public Watchdog score-on-demand contract passed.');
