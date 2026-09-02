from pathlib import Path

path = Path('property/js/lookup.js')
src = path.read_text()

old = """  function parcelAt(lat, lon) {
    return cached(geoKey(lat, lon, 'parcel'), 6e5,
      function () { return parcelAtRaw(lat, lon); });
  }
  function parcelAtRaw(lat, lon) {
    var p = new URLSearchParams({
      geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
      geometryType: 'esriGeometryPoint', inSR: '4326', outSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: FIELDS, returnGeometry: 'true', resultRecordCount: '1', f: 'json'
    });
    return xfetch(NJ_PARCEL + '?' + p, 15000).then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) throw new Error(d.error.message || 'parcel');
        return (d.features && d.features[0]) ? d.features[0] : null;
      });
  }
"""

new = """  function parcelStreetKey(value) {
    var first = String(value || '').split(',')[0].trim();
    return first ? normAddr(first) : '';
  }

  function parcelCacheKey(lat, lon, typed, matched) {
    // Property identity must never share the coarse neighborhood cache key.
    // Six decimal places is roughly decimeter precision in New Jersey, and the
    // address component keeps two unit/address attempts at the same point apart.
    return 'parcel|' + lat.toFixed(6) + ',' + lon.toFixed(6) + '|' +
      parcelStreetKey(matched || typed);
  }

  function parcelAt(lat, lon, typed, matched) {
    return cached(parcelCacheKey(lat, lon, typed, matched), 6e5, function () {
      return parcelAtRaw(lat, lon).then(function (exact) {
        if (exact) return exact;
        // NJ address points can sit on a curb, driveway, building point or road
        // centerline instead of inside the tax polygon. Search a very small
        // envelope only when the exact point misses, then require the parcel's
        // recorded address to agree before accepting it.
        if (!typed && !matched) return null;
        return parcelNearbyByAddress(lat, lon, typed, matched);
      });
    });
  }

  function parcelAtRaw(lat, lon) {
    var p = new URLSearchParams({
      geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
      geometryType: 'esriGeometryPoint', inSR: '4326', outSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: FIELDS, returnGeometry: 'true', resultRecordCount: '1', f: 'json'
    });
    return xfetch(NJ_PARCEL + '?' + p, 15000).then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) throw new Error(d.error.message || 'parcel');
        return (d.features && d.features[0]) ? d.features[0] : null;
      });
  }

  function parcelNearbyByAddress(lat, lon, typed, matched) {
    var keys = [parcelStreetKey(matched), parcelStreetKey(typed)].filter(Boolean);
    keys = keys.filter(function (key, i) { return keys.indexOf(key) === i; });
    if (!keys.length) return Promise.resolve(null);

    var meters = 100;
    var dLat = meters / 111320;
    var dLon = meters / (111320 * Math.cos(lat * Math.PI / 180));
    var env = {
      xmin: lon - dLon, ymin: lat - dLat, xmax: lon + dLon, ymax: lat + dLat,
      spatialReference: { wkid: 4326 }
    };
    var p = new URLSearchParams({
      geometry: JSON.stringify(env), geometryType: 'esriGeometryEnvelope',
      inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects',
      outFields: FIELDS, returnGeometry: 'true', resultRecordCount: '60', f: 'json'
    });

    return xfetch(NJ_PARCEL + '?' + p, 15000).then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) throw new Error(d.error.message || 'parcel nearby');
        var matches = (d.features || []).filter(function (feature) {
          var a = feature && feature.attributes;
          var key = a ? parcelStreetKey(a.PROP_LOC) : '';
          return !!key && keys.indexOf(key) !== -1;
        });
        // Never guess among multiple tax parcels sharing one street address
        // (common with condos/qualifiers). A safe miss is better than opening
        // the wrong property.
        if (matches.length !== 1) return null;
        return matches[0];
      });
  }
"""

if src.count(old) != 1:
    raise SystemExit(f'parcel block expected once, found {src.count(old)}')
src = src.replace(old, new, 1)

old_call = "return parcelAt(g.lat, g.lon).then(function (f) { return { g: g, f: f }; });"
new_call = "return parcelAt(g.lat, g.lon, addr, g.matched).then(function (f) { return { g: g, f: f }; });"
if src.count(old_call) != 1:
    raise SystemExit(f'main parcel call expected once, found {src.count(old_call)}')
src = src.replace(old_call, new_call, 1)

old_msg = "msg = 'We found the location but no parcel record there. That usually means a condo unit, a brand new build, or a property billed together with other lots.';"
new_msg = "msg = 'We found the address, but could not verify one matching New Jersey tax parcel nearby. Rather than open the wrong property, Watchdog stopped here. Try the address without a unit number or verify the street spelling.';"
if src.count(old_msg) != 1:
    raise SystemExit(f'noparcel message expected once, found {src.count(old_msg)}')
src = src.replace(old_msg, new_msg, 1)

path.write_text(src)

test = Path('property/tests/property-parcel-fallback-contract.mjs')
test.write_text("""import fs from 'node:fs';
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
""")
