from pathlib import Path

path = Path('property/js/lookup.js')
text = path.read_text()
start = text.index('  function confirmParcelAlias(')
end = text.index('  function parcelCacheKey(', start)
replacement = r'''  function confirmParcelAlias(exact, targets, geoMeta, selectedGeo) {
    if (!targets || !targets.length) return Promise.resolve(null);
    var exactAttrs = exact && exact.attributes || {};

    // A selected Google address gives us a second, independent coordinate.
    // The NJ address point is allowed to fall on roadway/no parcel: that is the
    // failure mode this safeguard exists to recover. The selected Google point
    // must still be tightly corroborated by the NJ geocoder, land on one
    // unqualified tax parcel, and that parcel must share house number + ZIP.
    if (selectedGeo && geoMeta && Number(geoMeta.score) >= 95 &&
        lookupPointDistanceMeters(geoMeta, selectedGeo) <= 120) {
      return parcelAtRaw(selectedGeo.lat, selectedGeo.lon).then(function (second) {
        if (!second || !parcelAliasCandidateMatches(second, targets)) return null;
        // If NJ's coordinate did hit a parcel, both coordinate checks must agree.
        // If it hit roadway/no polygon, the independently selected Google parcel
        // is still safe because address identity + ZIP + proximity are all gated.
        if (exact && !sameParcel(exact, second)) return null;
        var a = second.attributes || {};
        console.info('[watchdog] parcel street alias confirmed', {
          searched: targets[0] && targets[0].key,
          parcel: a.PROP_LOC || '', pin: a.PAMS_PIN || '',
          njPointHadParcel: !!exact
        });
        return second;
      });
    }

    // Manual searches do not have a second Google coordinate. Keep the stricter
    // legacy rule: NJ must itself hit an unqualified parcel with the same house
    // number + ZIP, at essentially exact geocoder confidence.
    if (exact && parcelAliasCandidateMatches(exact, targets) &&
        geoMeta && Number(geoMeta.score) >= 99) {
      console.info('[watchdog] parcel street alias accepted from high-confidence NJ geocode', {
        searched: targets[0] && targets[0].key,
        parcel: exactAttrs.PROP_LOC || '', pin: exactAttrs.PAMS_PIN || ''
      });
      return Promise.resolve(exact);
    }
    return Promise.resolve(null);
  }

'''
text = text[:start] + replacement + text[end:]
path.write_text(text)

tpath = Path('property/tests/property-address-alias-contract.mjs')
test = tpath.read_text()
old = "assert.match(lookup, /sameParcel\\(exact, second\\)/, 'independent coordinate checks must land on the same PAMS parcel');"
new = """assert.match(lookup, /if \\(exact && !sameParcel\\(exact, second\\)\\) return null;/, 'when NJ point has a parcel, independent coordinate checks must still agree');
assert.match(lookup, /if \\(!second \\|\\| !parcelAliasCandidateMatches\\(second, targets\\)\\) return null;/, 'selected Google coordinate must itself resolve to an address-compatible parcel');
assert.match(lookup, /return second;/, 'selected Google parcel can recover when the NJ point lands on roadway or no polygon');
assert.match(lookup, /Number\\(geoMeta\\.score\\) >= 95/, 'selected-address alias recovery still requires strong NJ geocoder corroboration');"""
if old not in test:
    raise SystemExit('expected alias assertion not found')
tpath.write_text(test.replace(old, new))
