import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script=readFileSync('property/scripts/enrich_transaction_municipal_requirements_v2.py','utf8');

assert.match(script,/Expected 564 municipality codes/,'statewide run must hard-require all 564 municipalities');
assert.match(script,/ordinance_links_county_aware/,'ordinance matching must be county-aware');
assert.match(script,/\(norm, county\)/,'same-name municipalities must be disambiguated by county');
assert.match(script,/ordinance_text, ordinance_final = base\.source_text\(ordinance_url\)/,'ordinance text must actually be fetched');
assert.match(script,/municipality_specific_item_count/,'output must expose municipality-specific detail count');
assert.match(script,/municipality_specific_details_extracted/,'output must distinguish detail extraction from process discovery');
assert.match(script,/never_infer_not_required[^\n]*True/,'missing material must never imply not-required');
assert.doesNotMatch(script,/requirement_state[^\n]*not_required/,'extractor must not emit a not-required state');

console.log('Transaction municipal requirements v2 contract passed.');
