from pathlib import Path


def must_replace(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label} anchor missing')
    return text.replace(old, new, 1)


auto_path = Path('property/js/nj-address-autocomplete.js')
auto = auto_path.read_text()

needle = "  function queryFor(row){return [row.address,row.town,'NJ',row.zip].filter(Boolean).join(', ');}\n"
insert = needle + "\n  function coordsFromPlace(place,legacy){\n    var loc=legacy?(place&&place.geometry&&place.geometry.location):(place&&place.location);\n    if(!loc)return null;\n    var lat=typeof loc.lat==='function'?Number(loc.lat()):Number(loc.lat);\n    var lon=typeof loc.lng==='function'?Number(loc.lng()):Number(loc.lng);\n    return Number.isFinite(lat)&&Number.isFinite(lon)?{lat:lat,lon:lon}:null;\n  }\n\n  function clearGoogleSelection(input){\n    if(!input)return;\n    input.dataset.googleAddress='0';\n    delete input.dataset.googlePlaceId;\n    delete input.dataset.googleLat;\n    delete input.dataset.googleLon;\n  }\n"
auto = must_replace(auto, needle, insert, 'autocomplete helper insertion')

old_sync = """  function syncAddress(input,formatted,placeId){
    input.value=formatted;
    input.setCustomValidity('');
    input.dataset.googleAddress='1';
    input.dataset.googlePlaceId=placeId||'';
    var other=input.id==='pl-addr'?q('ss-addr'):q('pl-addr');
    if(other){
      other.value=formatted;
      other.setCustomValidity('');
      other.dataset.googleAddress='1';
      other.dataset.googlePlaceId=placeId||'';
    }
  }
"""
new_sync = """  function syncAddress(input,formatted,placeId,coords){
    function stamp(target){
      target.value=formatted;
      target.setCustomValidity('');
      target.dataset.googlePlaceId=placeId||'';
      if(coords&&Number.isFinite(coords.lat)&&Number.isFinite(coords.lon)){
        target.dataset.googleLat=coords.lat.toFixed(7);
        target.dataset.googleLon=coords.lon.toFixed(7);
      }else{
        delete target.dataset.googleLat;
        delete target.dataset.googleLon;
      }
      // Set this last. The auto-submit MutationObserver then sees the place id
      // and the coordinates from the same selected Google result together.
      target.dataset.googleAddress='1';
    }
    stamp(input);
    var other=input.id==='pl-addr'?q('ss-addr'):q('pl-addr');
    if(other)stamp(other);
  }
"""
auto = must_replace(auto, old_sync, new_sync, 'syncAddress')
auto = must_replace(auto, "place.fetchFields({fields:['formattedAddress','addressComponents']})", "place.fetchFields({fields:['formattedAddress','addressComponents','location']})", 'new Places fields')
auto = must_replace(auto, "if(formatted)syncAddress(input,formatted,String(prediction.placeId||''));", "if(formatted)syncAddress(input,formatted,String(prediction.placeId||''),coordsFromPlace(place,false));", 'new Places sync')
auto = must_replace(auto, "fields:['formatted_address','place_id','address_components']", "fields:['formatted_address','place_id','address_components','geometry']", 'legacy fields')
auto = must_replace(auto, "syncAddress(input,formatted,String(place.place_id||''));", "syncAddress(input,formatted,String(place.place_id||''),coordsFromPlace(place,true));", 'legacy sync')

old_custom_input = """    input.addEventListener('input',function(){
      input.setCustomValidity('');
      input.dataset.googleAddress='0';
      delete input.dataset.googlePlaceId;
      clearTimeout(timer);
      timer=setTimeout(request,190);
    });
"""
new_custom_input = """    input.addEventListener('input',function(){
      input.setCustomValidity('');
      clearGoogleSelection(input);
      clearTimeout(timer);
      timer=setTimeout(request,190);
    });
"""
auto = must_replace(auto, old_custom_input, new_custom_input, 'custom input clear')
auto = must_replace(auto, "input.addEventListener('input',function(){input.setCustomValidity('');input.dataset.googleAddress='0';delete input.dataset.googlePlaceId;});", "input.addEventListener('input',function(){input.setCustomValidity('');clearGoogleSelection(input);});", 'legacy input clear')
auto_path.write_text(auto)

lookup_path = Path('property/js/lookup.js')
lookup = lookup_path.read_text()
lookup = must_replace(
    lookup,
    "return { lat: c.location.y, lon: c.location.x, matched: c.address };",
    "return { lat: c.location.y, lon: c.location.x, matched: c.address, score: Number(c.score) || 0 };",
    'geocode score',
)

start = lookup.index('  function parcelCacheKey(lat, lon, typed, matched) {')
end = lookup.index('  function parcelAtRaw(lat, lon) {', start)
replacement = r'''  function parcelAliasCandidateMatches(feature, targets) {
    var a = feature && feature.attributes;
    if (!a || String(a.PCLQCODE || '').trim()) return false;
    var candidate = parcelAddressParts(a.PROP_LOC);
    var candidateZip = String(a.ZIP5 || '').trim();
    if (!candidate || !candidate.house || !candidateZip) return false;
    return targets.some(function (target) {
      return !!(target.house && target.house === candidate.house && target.zip && target.zip === candidateZip);
    });
  }

  function sameParcel(a, b) {
    var ap = a && a.attributes && String(a.attributes.PAMS_PIN || '').trim();
    var bp = b && b.attributes && String(b.attributes.PAMS_PIN || '').trim();
    return !!(ap && bp && ap === bp);
  }

  function lookupPointDistanceMeters(a, b) {
    if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(a.lon) ||
        !Number.isFinite(b.lat) || !Number.isFinite(b.lon)) return Infinity;
    var lat = (a.lat + b.lat) / 2;
    var dx = (a.lon - b.lon) * 111320 * Math.cos(lat * Math.PI / 180);
    var dy = (a.lat - b.lat) * 111320;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function confirmParcelAlias(exact, targets, geoMeta, selectedGeo) {
    if (!exact || !parcelAliasCandidateMatches(exact, targets)) return Promise.resolve(null);
    var a = exact.attributes || {};

    // A selected Google address gives us a second, independent coordinate.
    // Only accept a street-name alias when both geocoders land on the SAME tax
    // parcel. This safely resolves market-facing aliases while still rejecting
    // neighboring-house misses such as 185 -> 189.
    if (selectedGeo && lookupPointDistanceMeters(geoMeta, selectedGeo) <= 120) {
      return parcelAtRaw(selectedGeo.lat, selectedGeo.lon).then(function (second) {
        if (!sameParcel(exact, second)) return null;
        console.info('[watchdog] parcel street alias confirmed', {
          searched: targets[0] && targets[0].key,
          parcel: a.PROP_LOC || '', pin: a.PAMS_PIN || ''
        });
        return exact;
      });
    }

    // Manual searches do not have a second Google coordinate. In that case the
    // NJ geocoder must be essentially exact, and the parcel must share both the
    // house number and ZIP. Qualified/condo parcels are excluded above.
    if (geoMeta && Number(geoMeta.score) >= 99) {
      console.info('[watchdog] parcel street alias accepted from high-confidence NJ geocode', {
        searched: targets[0] && targets[0].key,
        parcel: a.PROP_LOC || '', pin: a.PAMS_PIN || ''
      });
      return Promise.resolve(exact);
    }
    return Promise.resolve(null);
  }

  function parcelCacheKey(lat, lon, typed, matched, selectedGeo) {
    var googlePart = selectedGeo && Number.isFinite(selectedGeo.lat) && Number.isFinite(selectedGeo.lon)
      ? '|g' + selectedGeo.lat.toFixed(6) + ',' + selectedGeo.lon.toFixed(6)
      : '|g-';
    return 'parcel|' + lat.toFixed(6) + ',' + lon.toFixed(6) + '|' +
      parcelStreetKey(matched || typed) + googlePart;
  }

  function parcelAt(lat, lon, typed, matched, geoMeta, selectedGeo) {
    return cached(parcelCacheKey(lat, lon, typed, matched, selectedGeo), 6e5, function () {
      var targets = parcelTargets(typed, matched);
      return parcelAtRaw(lat, lon).then(function (exact) {
        if (exact && (!targets.length || parcelCandidateMatches(exact, targets))) return exact;
        if (!targets.length) return null;

        // Exhaust the normal street-address paths before treating a different
        // assessor street name as an alias.
        return parcelNearbyByAddress(lat, lon, typed, matched).then(function (nearby) {
          if (nearby) return nearby;
          return parcelByAddressRecord(lat, lon, typed, matched);
        }).then(function (byAddress) {
          if (byAddress) return byAddress;
          return confirmParcelAlias(exact, targets, geoMeta || { lat: lat, lon: lon }, selectedGeo);
        });
      }).then(function (feature) {
        if (feature) return feature;
        var target = targets[0];
        console.warn('[watchdog] parcel resolution miss', {
          street: target ? target.key : parcelStreetKey(matched || typed),
          zip: target ? target.zip : '',
          lat: +lat.toFixed(5), lon: +lon.toFixed(5)
        });
        return null;
      });
    });
  }

'''
lookup = lookup[:start] + replacement + lookup[end:]

marker = "  // ══════════════════════════════════════════════\n  // MAIN LOOKUP\n"
helper = r'''  function selectedGoogleGeo(input, address) {
    if (!input || input.dataset.googleAddress !== '1') return null;
    if (lookupKey(input.value) !== lookupKey(address)) return null;
    var lat = Number(input.dataset.googleLat), lon = Number(input.dataset.googleLon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat: lat, lon: lon };
  }

'''
lookup = must_replace(lookup, marker, helper + marker, 'main lookup helper')
lookup = must_replace(
    lookup,
    "    var addr = (el('pl-addr').value || '').trim();\n    if (!addr) { el('pl-addr').focus(); return; }",
    "    var addr = (el('pl-addr').value || '').trim();\n    if (!addr) { el('pl-addr').focus(); return; }\n    var googleGeo = selectedGoogleGeo(elReal('pl-addr'), addr);",
    'google geo capture',
)
lookup = must_replace(
    lookup,
    "return parcelAt(g.lat, g.lon, addr, g.matched).then(function (f) { return { g: g, f: f }; });",
    "return parcelAt(g.lat, g.lon, addr, g.matched, g, googleGeo).then(function (f) { return { g: g, f: f }; });",
    'main parcel call',
)
lookup_path.write_text(lookup)

test = r'''import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lookup = readFileSync(new URL('../js/lookup.js', import.meta.url), 'utf8');
const autocomplete = readFileSync(new URL('../js/nj-address-autocomplete.js', import.meta.url), 'utf8');

assert.match(autocomplete, /fields:\['formattedAddress','addressComponents','location'\]/, 'new Places selection should request location');
assert.match(autocomplete, /'address_components','geometry'/, 'legacy Places selection should request geometry');
assert.match(autocomplete, /dataset\.googleLat/, 'selected Google latitude should be persisted');
assert.match(autocomplete, /dataset\.googleLon/, 'selected Google longitude should be persisted');
assert.match(autocomplete, /clearGoogleSelection/, 'manual input should clear stale Google coordinates');

assert.match(lookup, /matched: c\.address, score: Number\(c\.score\) \|\| 0/, 'NJ geocoder confidence should be preserved');
assert.match(lookup, /function parcelAliasCandidateMatches/, 'lookup should have a strict alias candidate gate');
assert.match(lookup, /target\.house === candidate\.house/, 'alias candidate must keep the same house number');
assert.match(lookup, /target\.zip === candidateZip/, 'alias candidate must keep the same ZIP');
assert.match(lookup, /String\(a\.PCLQCODE \|\| ''\)\.trim\(\)/, 'qualified parcels must fail closed in alias mode');
assert.match(lookup, /lookupPointDistanceMeters\(geoMeta, selectedGeo\) <= 120/, 'Google and NJ coordinates must stay tightly corroborated');
assert.match(lookup, /sameParcel\(exact, second\)/, 'independent coordinate checks must land on the same PAMS parcel');
assert.match(lookup, /Number\(geoMeta\.score\) >= 99/, 'manual alias resolution requires an essentially exact NJ geocode');
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
'''
Path('property/tests/property-address-alias-contract.mjs').write_text(test)

for transient in [
    Path('.github/workflows/njw258-parcel-alias-patch.yml'),
    Path('.github/scripts/njw258_parcel_alias_patch.py'),
]:
    if transient.exists():
        transient.unlink()
