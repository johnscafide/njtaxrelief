from pathlib import Path

path = Path('property/js/lookup.js')
text = path.read_text()
marker = "  function confirmParcelAlias(exact, targets, geoMeta, selectedGeo) {\n"
if marker not in text:
    raise SystemExit('confirmParcelAlias marker missing')
helper = r'''  function parcelNearbyAliasCandidate(lat, lon, targets) {
    if (!targets || !targets.length || !Number.isFinite(lat) || !Number.isFinite(lon)) return Promise.resolve(null);

    // Manual submissions do not always carry a Google-selected coordinate. For
    // assessor street aliases, search only the immediate block around NJ's own
    // high-confidence address point and accept exactly one unqualified parcel
    // sharing the house number + ZIP. Any ambiguity still fails closed.
    var meters = 250;
    var dLat = meters / 111320;
    var dLon = meters / (111320 * Math.cos(lat * Math.PI / 180));
    var env = {
      xmin: lon - dLon, ymin: lat - dLat, xmax: lon + dLon, ymax: lat + dLat,
      spatialReference: { wkid: 4326 }
    };
    var p = new URLSearchParams({
      geometry: JSON.stringify(env), geometryType: 'esriGeometryEnvelope',
      inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects',
      outFields: FIELDS, returnGeometry: 'true', returnCentroid: 'true',
      resultRecordCount: '120', f: 'json'
    });
    return xfetch(NJ_PARCEL + '?' + p, 15000).then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) throw new Error(d.error.message || 'parcel alias nearby');
        var matches = (d.features || []).filter(function (feature) {
          return parcelAliasCandidateMatches(feature, targets);
        });
        if (matches.length !== 1) return null;
        var dist = parcelDistanceMeters(matches[0], lat, lon);
        if (dist != null && dist > meters) return null;
        return matches[0];
      });
  }

'''
text = text.replace(marker, helper + marker, 1)

old = r'''    // Manual searches do not have a second Google coordinate. Keep the stricter
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
'''
new = r'''    // Manual searches do not have a second Google coordinate. Keep the strictest
    // evidence threshold. If NJ itself hits the alias parcel, accept it. If NJ
    // lands on roadway/no polygon, search only the immediate block and require
    // one unique unqualified parcel with the same house number + ZIP.
    if (geoMeta && Number(geoMeta.score) >= 99) {
      if (exact && parcelAliasCandidateMatches(exact, targets)) {
        console.info('[watchdog] parcel street alias accepted from high-confidence NJ geocode', {
          searched: targets[0] && targets[0].key,
          parcel: exactAttrs.PROP_LOC || '', pin: exactAttrs.PAMS_PIN || ''
        });
        return Promise.resolve(exact);
      }
      if (!exact) {
        return parcelNearbyAliasCandidate(geoMeta.lat, geoMeta.lon, targets).then(function (nearAlias) {
          if (!nearAlias) return null;
          var a = nearAlias.attributes || {};
          console.info('[watchdog] nearby assessor alias confirmed from high-confidence NJ geocode', {
            searched: targets[0] && targets[0].key,
            parcel: a.PROP_LOC || '', pin: a.PAMS_PIN || ''
          });
          return nearAlias;
        });
      }
    }
    return Promise.resolve(null);
'''
if old not in text:
    raise SystemExit('manual alias block not found')
text = text.replace(old, new, 1)
path.write_text(text)

tpath = Path('property/tests/property-address-alias-contract.mjs')
test = tpath.read_text()
insert_after = "assert.match(lookup, /Number\\(geoMeta\\.score\\) >= 99/, 'manual alias resolution requires an essentially exact NJ geocode');\n"
if insert_after not in test:
    raise SystemExit('test insertion marker missing')
additions = (
    "assert.match(lookup, /function parcelNearbyAliasCandidate/, 'manual submissions should have a bounded alias recovery helper');\n"
    "assert.match(lookup, /var meters = 250;/, 'manual alias recovery must stay block-scale');\n"
    "assert.match(lookup, /if \\(matches\\.length !== 1\\) return null;/, 'manual alias recovery must fail closed on ambiguity');\n"
    "assert.match(lookup, /if \\(!exact\\) \\{[\\s\\S]*parcelNearbyAliasCandidate\\(geoMeta\\.lat, geoMeta\\.lon, targets\\)/, 'manual high-confidence NJ lookup should recover a unique nearby assessor alias when the point misses the polygon');\n"
)
test = test.replace(insert_after, insert_after + additions, 1)
tpath.write_text(test)
