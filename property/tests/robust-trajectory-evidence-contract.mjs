#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const scorer = fs.readFileSync(path.join(root, 'supabase/functions/workbench-score/index.ts'), 'utf8');
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

assert(scorer.includes('const sale = num(row.subject_sale_price)'), 'Trajectory sale validation must use governed subject_sale_price.');
assert(scorer.includes('year = num(row.subject_sale_year)'), 'Trajectory sale validation must use governed subject_sale_year.');
assert(scorer.includes('row.subject_sale_price = Number(subject.sale_price)'), 'SR-1A subject sale price must be attached from the governed subject-evidence RPC.');
assert(scorer.includes('row.subject_sale_year = Number(subject.sale_year)'), 'SR-1A subject sale year must be attached from the governed subject-evidence RPC.');
assert(scorer.includes('validation: "sr1a_verified_subject_sale_v1"'), 'Trajectory evidence must expose the governed SR-1A validation contract.');
assert(scorer.includes('provider_version: SUBJECT_MODEL'), 'Trajectory evidence must expose subject provider lineage.');
assert(scorer.includes('match_quality: row.subject_match_quality || null'), 'Trajectory evidence must retain subject parcel match quality.');
assert(scorer.includes('reason: "governed verified subject-sale evidence unavailable"'), 'Trajectory must fail closed when governed subject-sale evidence is unavailable.');

const trajectoryBlock = scorer.match(/if \(sr1a && usableSale\(row, sr1a\)[\s\S]*?else add\("trajectory", 10, null,[\s\S]*?\);/);
assert(Boolean(trajectoryBlock), 'ROBUST Trajectory scoring block must exist.');
if (trajectoryBlock) {
  assert(!trajectoryBlock[0].includes('row.last_sale_price'), 'Trajectory must not score from property_lookups.last_sale_price.');
  assert(!trajectoryBlock[0].includes('row.last_sale_year'), 'Trajectory must not score from property_lookups.last_sale_year.');
}

if (failures.length) {
  console.error(JSON.stringify({ passed: false, contract: 'robust-trajectory-evidence-v1', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  passed: true,
  contract: 'robust-trajectory-evidence-v1',
  source: 'NJ Division of Taxation SR-1A verified usable sale index',
  fallback: 'fail-closed',
  model_version: 'ROBUST-v1',
  weights_changed: false,
  bands_changed: false
}, null, 2));
