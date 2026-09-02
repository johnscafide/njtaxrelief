import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../js/lookup.js', import.meta.url), 'utf8');

assert.match(src, /function displayStreetAddress\(typed, matched, assessor\)/, 'searched/geocoded address display helper must exist');
assert.match(src, /var displayAddress = displayStreetAddress\(typed, geo && geo\.matched, p\.PROP_LOC\)/, 'render must derive the user-facing address from search evidence');
assert.match(src, /address: displayAddress, assessorAddress: assessorAddress, assessorAlias: assessorAlias/, 'display and assessor addresses must be kept separately');
assert.doesNotMatch(src, /address: p\.PROP_LOC \|\| typed, town:/, 'assessor PROP_LOC must not replace the searched address');
assert.match(src, /NJ tax records list this parcel as/, 'assessor alias must be disclosed as secondary context');
assert.match(src, /normAddr\(parcelAddress\) === normAddr\(display\)/, 'equivalent spellings must not create a false alias note');

console.log('property display address contract: ok');
