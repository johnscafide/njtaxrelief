#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const fail = [];
const assert = (ok, msg) => { if (!ok) fail.push(msg); };

const manifestPath = 'supabase/intelligence-closing-v3-holdout-manifest.json';
const seederPath = 'supabase/functions/intelligence-closing-holdout-seed/index.ts';
const configPath = 'supabase/config.toml';
assert(fs.existsSync(manifestPath), 'Closing v3 holdout manifest is missing.');
assert(fs.existsSync(seederPath), 'Closing v3 seeder retirement source is missing.');

const manifest = JSON.parse(read(manifestPath));
const seeder = read(seederPath);
const config = read(configPath);

assert(manifest.manifest_version === 'watchdog-closing-v3-fresh-holdout-v1', 'Unexpected Closing v3 holdout manifest version.');
assert(manifest.model?.model_key === 'closing_review' && manifest.model?.draft_version === 3, 'Manifest must describe Closing Review v3.');
assert(manifest.model?.draft_status === 'draft' && manifest.model?.draft_calibration_state === 'uncalibrated', 'Closing v3 must remain draft/uncalibrated.');
assert(manifest.model?.current_customer_version === 2, 'Current customer Closing pointer must remain v2 in this certification record.');
assert(manifest.structural_shadow?.counties_in_source_pool === 21, 'Structural source pool must span all 21 NJ counties.');
assert(manifest.structural_shadow?.sample_scorable >= 25, 'Structural shadow must have at least 25 scorable cases.');
assert(manifest.structural_shadow?.distinct_scores >= 8, 'Structural shadow must have at least 8 distinct scores.');
assert(manifest.structural_shadow?.unique_feature_vectors >= 8, 'Structural shadow must have at least 8 unique feature vectors.');
assert(manifest.structural_shadow?.variable_score_features >= 2, 'Structural shadow must have at least 2 variable score features.');
const checks = new Map((manifest.structural_shadow?.threshold_checks || []).map((x) => [Number(x.threshold), x]));
assert(checks.get(60)?.structurally_ready === false, 'Threshold 60 must remain recorded as structurally blocked.');
assert(checks.get(45)?.structurally_ready === true, 'Threshold 45 must remain recorded as structurally ready.');
assert(manifest.threshold_decision?.priority_threshold === 45, 'Fresh holdout threshold must remain frozen at 45 before human labels.');
assert(manifest.threshold_decision?.selected_before_human_labels === true, 'Threshold must be frozen before human review.');
assert(manifest.fresh_holdout?.required_reviews === 35 && manifest.fresh_holdout?.case_count === 35, 'Fresh holdout must contain 35 required cases.');
assert(manifest.fresh_holdout?.predicted_priority_hidden === 5 && manifest.fresh_holdout?.predicted_not_priority_hidden === 30, 'Fresh holdout hidden prediction mix must remain 5/30.');
assert(manifest.fresh_holdout?.nj_county_codes_represented === 21, 'Fresh holdout must represent all 21 NJ county codes.');
assert(manifest.fresh_holdout?.prior_closing_case_overlap === 0, 'Fresh v3 holdout must not reuse prior Closing calibration cases.');
assert(manifest.fresh_holdout?.reviewer_blind_to_prediction_until_save === true, 'Reviewer blindness must remain mandatory.');
assert(manifest.fresh_holdout?.reuse_prior_labels === false, 'Prior labels must never be reused as v3 promotion proof.');
assert(manifest.quality_gates?.minimum_reviewed_cases === 35, 'Calibration gate must require all 35 reviews.');
assert(manifest.quality_gates?.minimum_precision === 0.70, 'Precision gate must remain 70%.');
assert(manifest.quality_gates?.minimum_recall === 0.60, 'Recall gate must remain 60%.');
assert(manifest.quality_gates?.maximum_false_positive_rate === 0.30, 'FPR gate must remain 30%.');
assert(manifest.safety?.model_pointer_changed === false && manifest.safety?.calibration_state_changed === false, 'Holdout seeding must not move model state.');
assert(manifest.safety?.human_labels_created_by_seeder === false, 'Seeder must never fabricate human labels.');
assert(manifest.safety?.write_capable_seeder_retired_after_one_use === true, 'Write-capable seeder must be retired after one use.');
assert(/status:\s*410/.test(seeder), 'Closing holdout seeder endpoint must remain retired with HTTP 410.');
assert(/holdout has already been seeded/i.test(seeder), 'Retired seeder must explain that the holdout already exists.');
assert(!/\.update\(\{[^}]*version|intelligence_models.*update|calibration_state.*calibrated/s.test(seeder), 'Retired seeder must contain no promotion/model-pointer write path.');
const cfg = config.match(/\[functions\.intelligence-closing-holdout-seed\][\s\S]*?(?=\n\[functions\.|$)/)?.[0] || '';
assert(/verify_jwt\s*=\s*true/.test(cfg), 'Retired holdout seeder must remain JWT-gated.');

if (fail.length) {
  console.error(JSON.stringify({ passed: false, contract: 'closing-v3-fresh-holdout-v1', failures: fail }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  passed: true,
  contract: 'closing-v3-fresh-holdout-v1',
  holdout_cases: 35,
  nj_counties: 21,
  priority_threshold: 45,
  reviewer_blind: true,
  seeder_retired: true
}, null, 2));
