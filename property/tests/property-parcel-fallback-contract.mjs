import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../js/lookup.js', import.meta.url), 'utf8');
assert.ok(source.includes('function parcelNearbyByAddress(lat, lon, typed, matched)'), 'safe nearby parcel fallback should exist');
assert.ok(source.includes("geometryType: 'esriGeometryEnvelope'"), 'nearby fallback should use a bounded envelope query');
assert.ok(source.includes('var meters = 180;'), 'fallback radius should remain tightly bounded to the immediate neighborhood');
assert.ok(source.includes('parcelCandidateMatches(feature, targets)'), 'nearby candidates must be checked against normalized recorded property identity');
assert.ok(source.includes('if (matches.length !== 1) return null;'), 'ambiguous nearby address matches must fail closed');
assert.ok(source.includes("return 'parcel|' + lat.toFixed(6) + ',' + lon.toFixed(6)"), 'property identity cache must use precise coordinates');
assert.ok(!source.includes("cached(geoKey(lat, lon, 'parcel')"), 'parcel identity must not use the coarse neighborhood cache key');
assert.ok(source.includes('parcelAt(g.lat, g.lon, addr, g.matched, g, googleGeo)'), 'address lookup should pass typed, matched, geocoder, and selected-coordinate evidence into parcel resolution');
assert.ok(source.includes('if (!targets.length) return null;'), 'coordinate-only locate must not guess a nearby parcel without address evidence');
assert.ok(source.includes('function parcelByAddressRecord(lat, lon, typed, matched)'), 'parcel resolver should have an assessor-address fallback independent of the geocoder point');
assert.ok(source.includes("where = \"PROP_LOC LIKE '\" + safeHouse + \" %'\""), 'address-record fallback should query the assessor address index by house number');
assert.ok(source.includes('var meters = 600;'), 'address-record fallback radius should remain bounded to 600 meters');
assert.ok(source.includes('dist == null || dist <= meters'), 'address-record fallback should apply its declared spatial bound');
assert.ok(source.includes('if (exact && (!targets.length || parcelCandidateMatches(exact, targets))) return exact;'), 'typed lookups should validate exact point hits against parcel address identity');
console.log('property parcel fallback contract: ok');
