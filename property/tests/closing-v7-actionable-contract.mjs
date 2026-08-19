import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const fail = (message) => {
  console.error(`Closing v7 actionable contract failed: ${message}`);
  process.exitCode = 1;
};
const requireText = (text, needle, label) => {
  if (!text.includes(needle)) fail(`${label} is missing required contract text: ${needle}`);
};
const forbidText = (text, needle, label) => {
  if (text.includes(needle)) fail(`${label} contains forbidden contract text: ${needle}`);
};

const v7 = read('supabase/migrations/20260819211000_closing_v7_granular_actionable_exceptions.sql');
const freeze = read('supabase/migrations/20260819211500_closing_v7_freeze_sanity_threshold.sql');
const review = read('property/js/intelligence-calibration-review.js');
const retiredSeeder = read('supabase/functions/intelligence-closing-v7-sanity-seed/index.ts');
const v7Dispatch = read('supabase/migrations/20260819211700_closing_v7_shadow_dispatcher.sql');
const sanityDispatch = read('supabase/migrations/20260819211900_closing_v7_sanity_dispatcher.sql');
const sourceMatrix = read('property/intelligence/closing-evidence/SOURCE-MATRIX.md');

requireText(v7, "'aggregation','max_direct_exception'", 'v7 model registry');
requireText(v7, "'environmental_flood_tidelands','context_only'", 'v7 context policy');
requireText(v7, "'may_independently_create_priority',false", 'v7 context policy');
requireText(v7, "'reuse_v5_labels_as_promotion_proof',false", 'v7 holdout policy');
requireText(v7, "watchdog.closing_permit_lifecycle_exception_v7", 'v7 direct exception registry');
requireText(v7, "watchdog.closing_recording_exception_v7", 'v7 direct exception registry');
requireText(v7, "Evidence coverage is not prediction confidence", 'v7 evidence semantics');

requireText(freeze, "development_sanity_threshold','50'", 'v7 frozen threshold');
requireText(freeze, 'Frozen before development sanity labels', 'v7 frozen threshold rationale');

requireText(review, "['draft','reviewing'].includes", 'active review queue filter');
requireText(review, 'DEVELOPMENT SANITY · NOT CALIBRATION', 'development sanity UX');
requireText(review, 'Surface this', 'development sanity UX');
requireText(review, 'Do not surface', 'development sanity UX');
requireText(review, 'cannot validate or promote', 'development sanity UX');
forbidText(review, '?v=', 'calibration review asset');

requireText(retiredSeeder, 'Retired. Closing Review v7 development sanity queue has already been seeded.', 'retired v7 sanity seeder');
forbidText(retiredSeeder, '.insert(', 'retired v7 sanity seeder');
forbidText(retiredSeeder, 'service_role', 'retired v7 sanity seeder');

for (const [label, sql, fn] of [
  ['v7 shadow dispatcher', v7Dispatch, 'intelligence_kick_closing_v7_shadow'],
  ['v7 sanity dispatcher', sanityDispatch, 'intelligence_kick_closing_v7_sanity'],
]) {
  requireText(sql, fn, label);
  requireText(sql, 'revoke all on function', label);
  requireText(sql, 'public, anon, authenticated', label);
  requireText(sql, 'watchdog_closing_shadow_token', label);
}

requireText(sourceMatrix, 'Missing coverage is not a negative finding', 'Closing source matrix');
requireText(sourceMatrix, 'Supporting context only', 'Closing source matrix');
requireText(sourceMatrix, 'do not ingest', 'Closing source matrix');

if (!process.exitCode) {
  console.log('Closing v7 actionable evidence contract passed.');
}
