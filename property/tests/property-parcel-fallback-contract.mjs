import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../js/lookup.js', import.meta.url), 'utf8');
assert.ok(source.includes('function parcelNearbyByAddress(lat, lon, typed, matched)'), 'safe nearby parcel fallback should exist');
assert.ok(source.includes("geometryType: 'esriGeometryEnvelope'"), 'nearby fallback should use a bounded envelope query');
assert.ok(source.includes('var meters = 100;'), 'fallback radius should remain tightly bounded');
assert.ok(source.includes('parcelStreetKey(a.PROP_LOC)'), 'nearby candidates must be checked against the recorded property address');
assert.ok(source.includes('if (matches.length !== 1) return null;'), 'ambiguous nearby address matches must fail closed');
assert.ok(source.includes("return 'parcel|' + lat.toFixed(6) + ',' + lon.toFixed(6)"), 'property identity cache must use precise coordinates');
assert.ok(!source.includes("cached(geoKey(lat, lon, 'parcel')"), 'parcel identity must not use the coarse neighborhood cache key');
assert.ok(source.includes('parcelAt(g.lat, g.lon, addr, g.matched)'), 'address lookup should pass typed and matched address context into parcel resolution');
assert.ok(source.includes('if (!typed && !matched) return null;'), 'coordinate-only locate must not guess a nearby parcel without address evidence');
console.log('property parcel fallback contract: ok');
