import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lookup = readFileSync(new URL('../js/lookup.js', import.meta.url), 'utf8');
const autocomplete = readFileSync(new URL('../js/nj-address-autocomplete.js', import.meta.url), 'utf8');

assert.match(autocomplete, /fields:\['formattedAddress','addressComponents','location'\]/, 'new Places selection should request location');
assert.match(autocomplete, /'address_components','geometry'/, 'legacy Places selection should request geometry');
assert.match(autocomplete, /dataset\.googleLat/, 'selected Google latitude should be persisted');
assert.match(autocomplete, /dataset\.googleLon/, 'selected Google longitude should be persisted');
assert.match(autocomplete, /clearGoogleSelection/, 'manual input should clear stale Google coordinates');

assert.match(lookup, /matched: c\.address, score: Number\(c\.score\) \|\| 0/, 'NJ geocoder confidence should be preserved');
assert.match(lookup, /function parcelAliasIdentityMatches/, 'lookup should separate address identity from qualifier ambiguity');
assert.match(lookup, /function parcelAliasCandidateMatches/, 'lookup should keep a strict direct alias candidate gate');
assert.match(lookup, /target\.house === candidate\.house/, 'alias candidate must keep the same house number');
assert.match(lookup, /target\.zip === candidateZip/, 'alias candidate must keep the same ZIP');
assert.match(lookup, /String\(a\.PCLQCODE \|\| ''\)\.trim\(\)/, 'direct alias acceptance must still reject qualifiers until bounded uniqueness is established');
assert.match(lookup, /lookupPointDistanceMeters\(geoMeta, selectedGeo\) <= 120/, 'Google and NJ coordinates must stay tightly corroborated');
assert.match(lookup, /if \(exact && !sameParcel\(exact, second\)\) return null;/, 'when NJ point has a parcel, independent coordinate checks must still agree');
assert.match(lookup, /if \(!second \|\| !parcelAliasCandidateMatches\(second, targets\)\) return null;/, 'selected Google coordinate must itself resolve to an address-compatible parcel');
assert.match(lookup, /return second;/, 'selected Google parcel can recover when the NJ point lands on roadway or no polygon');
assert.match(lookup, /Number\(geoMeta\.score\) >= 95/, 'selected-address alias recovery still requires strong NJ geocoder corroboration');
assert.match(lookup, /Number\(geoMeta\.score\) >= 99/, 'manual alias resolution requires an essentially exact NJ geocode');
assert.match(lookup, /function parcelNearbyAliasCandidate/, 'manual submissions should have a bounded alias recovery helper');
assert.match(lookup, /var meters = 250;/, 'manual alias recovery must stay block-scale');
assert.match(lookup, /if \(matches\.length !== 1\) return null;/, 'manual alias recovery must fail closed on ambiguity');
assert.match(lookup, /return parcelNearbyAliasCandidate\(geoMeta\.lat, geoMeta\.lon, targets\)/, 'manual high-confidence NJ lookup should always use bounded uniqueness for unresolved assessor aliases');
assert.match(lookup, /return parcelAliasIdentityMatches\(feature, targets\)/, 'bounded alias search should include qualified parcels in the identity candidate set');
assert.match(lookup, /var seenPins = Object\.create\(null\)/, 'bounded alias search should deduplicate by parcel identity before deciding uniqueness');
assert.match(lookup, /String\(a\.PAMS_PIN \|\| ''\)\.trim\(\)/, 'bounded alias uniqueness should prefer statewide parcel ID');
assert.match(lookup, /parcelAt\(g\.lat, g\.lon, addr, g\.matched, g, googleGeo\)/, 'main lookup should pass coordinate evidence into parcel resolution');

const flow = lookup.slice(lookup.indexOf('function parcelAt(lat, lon'), lookup.indexOf('function parcelAtRaw(lat, lon'));
assert.ok(flow.indexOf('parcelNearbyByAddress') < flow.indexOf('confirmParcelAlias'), 'normal geometry address matching must run before alias acceptance');
assert.ok(flow.indexOf('parcelByAddressRecord') < flow.indexOf('confirmParcelAlias'), 'parcel address-index matching must run before alias acceptance');

// Production regression, 2026-09-02:
// Search/listing identity: 15 Railroad Ave, Paulsboro, NJ 08066
// NJ tax parcel identity: 0814_40_3.01 / 15 Quincy St
function house(v) { const m = String(v).match(/^\s*(\d+[A-Z-]?)/i); return m ? m[1].toUpperCase() : ''; }
assert.equal(house('15 Railroad Ave'), house('15 Quincy St'));
assert.notEqual('RAILROAD', 'QUINCY');

console.log('property address alias contract: ok');
