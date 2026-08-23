import fs from 'node:fs';

const migrationPath = 'supabase/migrations/20260823143628_sr1a_compact_parcel_match_v2.sql';
const sql = fs.readFileSync(migrationPath, 'utf8');

const checks = [
  ['resolver stays SECURITY INVOKER', /security\s+invoker/i],
  ['resolver pins search_path', /set\s+search_path\s+to\s+'public'/i],
  ['public roles are revoked', /revoke\s+all\s+on\s+function\s+public\.lookup_sr1a_subject_evidence\(jsonb\)\s+from\s+public,\s*anon,\s*authenticated/i],
  ['service role remains the only explicit executor', /grant\s+execute\s+on\s+function\s+public\.lookup_sr1a_subject_evidence\(jsonb\)\s+to\s+service_role/i],
  ['compact block normalization removes decimal punctuation only', /replace\(item->>'block',\s*'\.',\s*''\)\s+as\s+compact_block_key/i],
  ['compact lot normalization removes decimal punctuation only', /replace\(item->>'lot',\s*'\.',\s*''\)\s+as\s+compact_lot_key/i],
  ['exact parcel candidates remain a distinct first path', /exact_candidates\s+as\s*\(/i],
  ['compact path never overrides an existing exact parcel candidate', /where\s+not\s+exists\s*\(\s*select\s+1\s+from\s+exact_candidates\s+x\s+where\s+x\.ord\s*=\s*i\.ord\s*\)/i],
  ['compact qualifier-exact matches are explicitly labeled', /'compact_exact'/i],
  ['compact one-to-one fallbacks are explicitly labeled', /'compact_unique_parcel_fallback'/i],
  ['ambiguous compact fallbacks require one evidence candidate and one warehouse property', /priority\s*=\s*0\s+or\s*\(candidate_count\s*=\s*1\s+and\s+property_count\s*=\s*1\)/i],
];

for (const [label, pattern] of checks) {
  if (!pattern.test(sql)) {
    throw new Error(`SR-1A compact subject-match contract failed: ${label}`);
  }
}

if (/sale_price\s*=.*last_sale_price|sale_year\s*=.*last_sale_year/i.test(sql)) {
  throw new Error('SR-1A compact subject-match contract failed: sale signature must not be used as a parcel fallback');
}

const exactPos = sql.search(/exact_candidates\s+as\s*\(/i);
const compactPos = sql.search(/compact_candidates\s+as\s*\(/i);
if (exactPos < 0 || compactPos < 0 || exactPos >= compactPos) {
  throw new Error('SR-1A compact subject-match contract failed: exact matching must remain ahead of compact fallback matching');
}

console.log('SR-1A compact subject-match contract passed');
