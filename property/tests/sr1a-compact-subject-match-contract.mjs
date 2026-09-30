import fs from 'node:fs';

// Check the live definition: the newest migration that (re)creates the resolver.
const migrationPath = fs.readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => `supabase/migrations/${name}`)
  .filter((path) => /create\s+or\s+replace\s+function\s+public\.lookup_sr1a_subject_evidence/i.test(fs.readFileSync(path, 'utf8')))
  .pop();
const sql = fs.readFileSync(migrationPath, 'utf8');

// Sep 30 2026: grouping all of property_lookups on every call timed out at 8 s
// once the table held the statewide parcel list. Parcel counts must be found
// per subject, through an expression index on the same three keys.
if (/from\s+public\.property_lookups\s+group\s+by/i.test(sql)) {
  throw new Error('SR-1A compact subject-match contract failed: the resolver must not aggregate all of property_lookups');
}
const keyExprs = [
  "left(regexp_replace(coalesce(pams_pin,''),'\\D','','g'), 4)",
  "replace(upper(regexp_replace(regexp_replace(coalesce(block,''),'\\s+','','g'),'^0+','','g')), '.', '')",
  "replace(upper(regexp_replace(regexp_replace(coalesce(lot,''),'\\s+','','g'),'^0+','','g')), '.', '')",
];
if (/property_count/i.test(sql)) {
  if (!/left\s+join\s+lateral\s*\(/i.test(sql)) throw new Error('SR-1A compact subject-match contract failed: property_count must come from a per-subject LATERAL count');
  if (!/create\s+index\s+if\s+not\s+exists\s+property_lookups_compact_parcel_key_idx/i.test(sql)) throw new Error('SR-1A compact subject-match contract failed: the compact parcel key index must be created with the resolver');
  for (const expr of keyExprs) {
    if (!sql.includes(`(${expr})`)) throw new Error(`SR-1A compact subject-match contract failed: index is missing key ${expr}`);
    if (!sql.includes(expr.replace(/coalesce\((pams_pin|block|lot),/, 'coalesce(pl.$1,'))) throw new Error(`SR-1A compact subject-match contract failed: lookup does not use indexed key ${expr}`);
  }
}

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
