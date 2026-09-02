import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lookup = readFileSync(new URL('../js/lookup.js', import.meta.url), 'utf8');
const autocomplete = readFileSync(new URL('../js/nj-address-autocomplete.js', import.meta.url), 'utf8');

const fields = lookup.slice(lookup.indexOf('var FIELDS ='), lookup.indexOf('var CLASSES ='));
assert.doesNotMatch(fields, /ZIP5|ST_ADDRESS|CITY_STATE/, 'public property lookup must not request owner mailing fields');
assert.doesNotMatch(lookup, /candidateZip = String\(a\.ZIP5/, 'mailing ZIP cannot verify parcel identity');
assert.doesNotMatch(lookup, /ZIP5 = '/, 'assessor address fallback cannot filter by owner mailing ZIP');
assert.match(lookup, /function propertyLocationZip\(typed, matched\)/, 'property location ZIP should come from address evidence');
assert.match(lookup, /zip: propertyZip/, 'current property state should use address-derived ZIP');
assert.match(lookup, /function recordLookup\(p, geo, rate, dy, propertyZip\)/, 'ledger should receive property ZIP explicitly');
assert.match(lookup, /zip: propertyZip \|\| ''/, 'ledger must not persist parcel mailing ZIP as property ZIP');
assert.doesNotMatch(lookup, /Owner mailing/, 'public property panel should not expose owner mailing address');
assert.doesNotMatch(autocomplete, /PARCEL_FIELDS=.*ZIP5/, 'autocomplete parcel enrichment must not request mailing ZIP');
assert.match(autocomplete, /zip:zipFromAddress\(address\)/, 'autocomplete enrichment should derive ZIP from selected address text');
assert.doesNotMatch(autocomplete, /a\.ZIP5/, 'autocomplete must not present parcel mailing ZIP as property ZIP');
assert.notEqual('08066', '08027');

console.log('property mailing zip contract: ok');
