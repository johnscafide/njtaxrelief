from pathlib import Path
import re


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 exact match, found {count}')
    return text.replace(old, new, 1)

# -----------------------------------------------------------------------------
# lookup.js: property identity must not depend on one geocoder point or one
# exact assessor spelling. Keep every fallback bounded and fail closed.
# -----------------------------------------------------------------------------
lookup_path = Path('property/js/lookup.js')
lookup = lookup_path.read_text()
start = lookup.index('  function parcelStreetKey(value) {')
end = lookup.index('  function ringsBBox(rings, pad) {', start)
new_parcel_block = r'''  function parcelStreetKey(value) {
    var first = String(value || '').split(',')[0].trim();
    return first ? normAddr(first) : '';
  }

  function parcelZip(value) {
    var m = String(value || '').match(/\b(\d{5})(?:-\d{4})?\b/);
    return m ? m[1] : '';
  }

  var PARCEL_ADDR_NOISE = {
    N:1, S:1, E:1, W:1, NE:1, NW:1, SE:1, SW:1,
    AVE:1, ST:1, RD:1, DR:1, CT:1, LN:1, PL:1, BLVD:1, CIR:1, TER:1,
    PKWY:1, HWY:1, TRL:1, SQ:1, WAY:1, LOOP:1, RUN:1, PATH:1, ROW:1,
    XING:1, PT:1, HTS:1, EXT:1, TPKE:1, PIKE:1, BRG:1, MNR:1, CMNS:1,
    ROUTE:1, RT:1, US:1, NJ:1, STATE:1
  };

  function parcelAddressParts(value) {
    var key = parcelStreetKey(value);
    if (!key) return null;
    var tokens = key.split(/\s+/).filter(Boolean);
    if (!tokens.length) return null;
    var house = tokens.shift().replace(/^0+/, '') || '0';
    var streetTokens = tokens.slice();
    var coreTokens = streetTokens.filter(function (token) { return !PARCEL_ADDR_NOISE[token]; });
    // A real street can be mostly directional/suffix words (for example North
    // Avenue). If stripping the noise leaves nothing, keep the normalized
    // street instead of inventing an empty equivalence class.
    if (!coreTokens.length) coreTokens = streetTokens;
    return {
      key: key,
      house: house,
      core: coreTokens.join(' '),
      zip: parcelZip(value)
    };
  }

  function parcelTargets(typed, matched) {
    var raw = [matched, typed], out = [];
    raw.forEach(function (value) {
      var p = parcelAddressParts(value);
      if (!p) return;
      if (!out.some(function (x) { return x.key === p.key && x.zip === p.zip; })) out.push(p);
    });
    return out;
  }

  function parcelCandidateMatches(feature, targets) {
    var a = feature && feature.attributes;
    if (!a) return false;
    var candidate = parcelAddressParts(a.PROP_LOC);
    if (!candidate) return false;
    var candidateZip = String(a.ZIP5 || '').trim();
    return targets.some(function (target) {
      if (target.house !== candidate.house) return false;
      if (target.zip && candidateZip && target.zip !== candidateZip) return false;
      if (target.key === candidate.key) return true;
      return !!(target.core && candidate.core && target.core === candidate.core);
    });
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
      var targets = parcelTargets(typed, matched);
      return parcelAtRaw(lat, lon).then(function (exact) {
        // Coordinate-only Locate Me can safely use the exact polygon under the
        // device point. Typed address lookups also confirm the parcel address;
        // this prevents a curb/road-center geocode from silently opening the
        // neighboring parcel.
        if (exact && (!targets.length || parcelCandidateMatches(exact, targets))) return exact;
        if (!targets.length) return null;

        // NJ address points can sit on a curb, driveway, building point or road
        // centerline instead of inside the tax polygon. First search the nearby
        // parcel geometry, then fall back to the assessor address index itself.
        return parcelNearbyByAddress(lat, lon, typed, matched).then(function (nearby) {
          if (nearby) return nearby;
          return parcelByAddressRecord(lat, lon, typed, matched);
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
    var targets = parcelTargets(typed, matched);
    if (!targets.length) return Promise.resolve(null);

    // 180m is still a neighborhood-scale bound, but it covers the common NJ
    // cases where the official address point is on a road centerline or a long
    // driveway rather than inside the tax polygon.
    var meters = 180;
    var dLat = meters / 111320;
    var dLon = meters / (111320 * Math.cos(lat * Math.PI / 180));
    var env = {
      xmin: lon - dLon, ymin: lat - dLat, xmax: lon + dLon, ymax: lat + dLat,
      spatialReference: { wkid: 4326 }
    };
    var p = new URLSearchParams({
      geometry: JSON.stringify(env), geometryType: 'esriGeometryEnvelope',
      inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects',
      outFields: FIELDS, returnGeometry: 'true', resultRecordCount: '100', f: 'json'
    });

    return xfetch(NJ_PARCEL + '?' + p, 15000).then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) throw new Error(d.error.message || 'parcel nearby');
        var matches = (d.features || []).filter(function (feature) {
          return parcelCandidateMatches(feature, targets);
        });
        // Never guess among multiple tax parcels sharing one street address
        // (common with condos/qualifiers). A safe miss is better than opening
        // the wrong property.
        if (matches.length !== 1) return null;
        return matches[0];
      });
  }

  function parcelFeaturePoint(feature) {
    if (!feature) return null;
    if (feature.centroid && feature.centroid.x != null && feature.centroid.y != null) {
      return { lon: +feature.centroid.x, lat: +feature.centroid.y };
    }
    var rings = feature.geometry && feature.geometry.rings;
    if (!rings || !rings.length || !rings[0].length) return null;
    var sx = 0, sy = 0, n = 0;
    rings[0].forEach(function (pt) {
      if (!pt || pt[0] == null || pt[1] == null) return;
      sx += +pt[0]; sy += +pt[1]; n++;
    });
    return n ? { lon: sx / n, lat: sy / n } : null;
  }

  function parcelDistanceMeters(feature, lat, lon) {
    var pt = parcelFeaturePoint(feature);
    if (!pt) return null;
    var dx = (pt.lon - lon) * 111320 * Math.cos(lat * Math.PI / 180);
    var dy = (pt.lat - lat) * 111320;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function parcelByAddressRecord(lat, lon, typed, matched) {
    var targets = parcelTargets(typed, matched);
    if (!targets.length) return Promise.resolve(null);
    var target = targets.find(function (x) { return x.zip; }) || targets[0];
    if (!target.house) return Promise.resolve(null);

    // This query asks the parcel layer by its own address attributes rather than
    // relying on the geocoder point. House number + ZIP keeps the candidate set
    // bounded; the normalized street-core matcher and distance check below do
    // the actual identity verification.
    var safeHouse = target.house.replace(/'/g, "''");
    var where = "PROP_LOC LIKE '" + safeHouse + " %'";
    if (target.zip) where += " AND ZIP5 = '" + target.zip.replace(/'/g, "''") + "'";
    var p = new URLSearchParams({
      where: where,
      outFields: FIELDS,
      returnGeometry: 'true', returnCentroid: 'true', outSR: '4326',
      resultRecordCount: '100', f: 'json'
    });

    return xfetch(NJ_PARCEL + '?' + p, 15000).then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) throw new Error(d.error.message || 'parcel address');
        var matches = (d.features || []).filter(function (feature) {
          if (!parcelCandidateMatches(feature, targets)) return false;
          var dist = parcelDistanceMeters(feature, lat, lon);
          return dist == null || dist <= 600;
        });
        if (matches.length !== 1) return null;
        return matches[0];
      });
  }

'''
lookup = lookup[:start] + new_parcel_block + lookup[end:]
lookup = replace_once(
    lookup,
    "  function paintHeroAuth() {\n    var host = el('pl-heroauth');\n    if (!host) return;",
    "  function paintHeroAuth() {\n    var host = elReal('pl-heroauth');\n    if (!host) return;",
    'optional hero auth lookup'
)
lookup_path.write_text(lookup)

# -----------------------------------------------------------------------------
# Current homepage shell: restore the inline status target used by the lookup
# runtime so the user sees progress instead of a console warning.
# -----------------------------------------------------------------------------
index_path = Path('property/index.html')
index = index_path.read_text()
needle = '''          <button class="pl-search-btn" id="pl-btn" onclick="plLookup()" title="Search" aria-label="Search">
            <i class="fas fa-magnifying-glass"></i>
          </button>
        </div>
      </div>
    </div>
  </div>
</div>

<section class="lp-proof-strip"'''
replacement = '''          <button class="pl-search-btn" id="pl-btn" onclick="plLookup()" title="Search" aria-label="Search">
            <i class="fas fa-magnifying-glass"></i>
          </button>
        </div>
      </div>
      <div class="pl-inline-status" id="pl-inline" aria-live="polite"></div>
    </div>
  </div>
</div>

<section class="lp-proof-strip"'''
if 'id="pl-inline"' not in index:
    index = replace_once(index, needle, replacement, 'hero inline lookup status')
index_path.write_text(index)

css_path = Path('property/css/lookup/01-search-hero.css')
css = css_path.read_text()
css_marker = '.pl-search-card { max-width: 720px; margin: 0 auto; }\n'
css_insert = '''.pl-search-card { max-width: 720px; margin: 0 auto; }
.pl-inline-status { max-width: 680px; margin: 12px auto 0; }
.pl-inline-status:empty { display: none; }
.pl-inline-status .pl-state {
  display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap;
  padding: 9px 14px; border-radius: 14px; background: rgba(255,255,255,.95);
  box-shadow: 0 6px 22px rgba(14,34,72,.16); color: var(--navy-dark);
}
.pl-inline-status .pl-spin {
  width: 16px; height: 16px; flex: 0 0 16px; border-radius: 50%;
  border: 2px solid #d6deea; border-top-color: var(--navy); animation: plspin .8s linear infinite;
}
.pl-inline-status .pl-state-title { font-size: 13px; font-weight: 800; }
.pl-inline-status .pl-state-sub { font-size: 12px; color: #5a6070; }
@media (max-width: 560px) {
  .pl-inline-status { margin-top: 9px; }
  .pl-inline-status .pl-state { padding: 9px 11px; }
  .pl-inline-status .pl-state-sub { flex-basis: 100%; text-align: center; }
}
'''
if '.pl-inline-status {' not in css:
    css = replace_once(css, css_marker, css_insert, 'inline lookup status CSS')
css_path.write_text(css)

# -----------------------------------------------------------------------------
# Root route transformer: the main Watchdog host goes through the contact-safe
# adapter, so install the same Supabase singleton guard and canonical manifest
# path there that /property/ already receives from watchdog-index-entry.js.
# -----------------------------------------------------------------------------
contact_path = Path('api/watchdog-index-page-contact-safe.js')
contact = contact_path.read_text()
const_marker = "const CONTACT_POLICY_SCRIPT = '<script src=\"/property/js/contact-routing-policy.js\" data-watchdog-contact-policy-runtime=\"1\"></script>';\n"
const_insert = const_marker + "const SUPABASE_GUARD_SCRIPT = '<script src=\"/property/js/supabase-client-singleton-guard.js\" data-watchdog-supabase-singleton-guard=\"1\"></script>';\n"
if 'SUPABASE_GUARD_SCRIPT' not in contact:
    contact = replace_once(contact, const_marker, const_insert, 'contact-safe guard constant')

helper_marker = '''function installEntityGraph(input) {
'''
helpers = r'''function installCanonicalManifestPath(input) {
  return String(input || '').replace(
    /href=(["'])\/site\.webmanifest\1/gi,
    'href="/property/site.webmanifest"'
  );
}

function installSupabaseSingletonGuard(input) {
  let html = String(input || '');
  if (/supabase-client-singleton-guard\.js/i.test(html)) return html;
  const supabaseTag = /(<script\b[^>]*\bsrc=["']https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2[^"']*["'][^>]*>\s*<\/script>)/i;
  if (!supabaseTag.test(html)) return html;
  return html.replace(supabaseTag, `$1\n${SUPABASE_GUARD_SCRIPT}`);
}

function installEntityGraph(input) {
'''
if 'function installSupabaseSingletonGuard(input)' not in contact:
    contact = replace_once(contact, helper_marker, helpers, 'contact-safe runtime helpers')

bottom_old = '''    let safeBody = sanitizeContactHtml(body, publicPath);
    safeBody = applyCanonicalRuntimeDiet(safeBody, publicPath);
'''
bottom_new = '''    let safeBody = sanitizeContactHtml(body, publicPath);
    safeBody = installCanonicalManifestPath(safeBody);
    safeBody = installSupabaseSingletonGuard(safeBody);
    safeBody = applyCanonicalRuntimeDiet(safeBody, publicPath);
'''
contact = replace_once(contact, bottom_old, bottom_new, 'contact-safe transform chain')
contact_path.write_text(contact)

# -----------------------------------------------------------------------------
# CSP remains report-only, but include the data providers that the public lookup
# intentionally calls so real violations are distinguishable from known traffic.
# -----------------------------------------------------------------------------
vercel_path = Path('vercel.json')
vercel = vercel_path.read_text()
vercel = vercel.replace(
    'https://www.google-analytics.com https://www.clarity.ms; style-src',
    'https://www.google-analytics.com https://www.clarity.ms https://maps.googleapis.com https://maps.gstatic.com; style-src'
)
vercel = vercel.replace(
    'https://www.google-analytics.com https://*.googleapis.com https://*.clarity.ms; frame-src',
    'https://www.google-analytics.com https://*.googleapis.com https://*.clarity.ms https://www.clarity.ms https://geo.nj.gov https://services2.arcgis.com https://services.arcgisonline.com https://server.arcgisonline.com https://*.bing.com https://c.bing.com; frame-src'
)
vercel_path.write_text(vercel)

# -----------------------------------------------------------------------------
# Contracts
# -----------------------------------------------------------------------------
fallback_test = Path('property/tests/property-parcel-fallback-contract.mjs')
test = fallback_test.read_text()
test = test.replace("assert.ok(source.includes('var meters = 100;'), 'fallback radius should remain tightly bounded');", "assert.ok(source.includes('var meters = 180;'), 'fallback radius should remain tightly bounded to the immediate neighborhood');")
test = test.replace("assert.ok(source.includes('parcelStreetKey(a.PROP_LOC)'), 'nearby candidates must be checked against the recorded property address');", "assert.ok(source.includes('parcelCandidateMatches(feature, targets)'), 'nearby candidates must be checked against normalized recorded property identity');")
test = test.replace("assert.ok(source.includes('if (!typed && !matched) return null;'), 'coordinate-only locate must not guess a nearby parcel without address evidence');", "assert.ok(source.includes('if (!targets.length) return null;'), 'coordinate-only locate must not guess a nearby parcel without address evidence');\nassert.ok(source.includes('function parcelByAddressRecord(lat, lon, typed, matched)'), 'parcel resolver should have an assessor-address fallback independent of the geocoder point');\nassert.ok(source.includes(\"where = \\\"PROP_LOC LIKE '\\\" + safeHouse + \\\" %'\\\"\"), 'address-record fallback should query the assessor address index by house number');\nassert.ok(source.includes('dist == null || dist <= 600'), 'address-record fallback should stay spatially bounded');\nassert.ok(source.includes('if (exact && (!targets.length || parcelCandidateMatches(exact, targets))) return exact;'), 'typed lookups should validate exact point hits against parcel address identity');")
fallback_test.write_text(test)

runtime_test = Path('property/tests/property-public-runtime-integrity-contract.mjs')
runtime_test.write_text(r'''import fs from 'node:fs';
import assert from 'node:assert/strict';

const contact = fs.readFileSync(new URL('../../api/watchdog-index-page-contact-safe.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/lookup/01-search-hero.css', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));

assert.ok(contact.includes('installSupabaseSingletonGuard'), 'root route transformer must install the Supabase singleton guard');
assert.ok(contact.includes('/property/site.webmanifest'), 'root route transformer must canonicalize the manifest path');
assert.ok(index.includes('id="pl-inline"'), 'homepage search shell must expose the lookup progress region');
assert.ok(css.includes('.pl-inline-status:empty'), 'lookup progress region should collapse when idle');

const headers = (vercel.headers || []).flatMap((entry) => entry.headers || []);
const csp = headers.find((header) => String(header.key || '').toLowerCase() === 'content-security-policy-report-only');
assert.ok(csp, 'report-only CSP should remain configured');
for (const origin of ['https://maps.googleapis.com','https://maps.gstatic.com','https://geo.nj.gov','https://services2.arcgis.com']) {
  assert.ok(csp.value.includes(origin), `report-only CSP should recognize ${origin}`);
}
assert.match(contact, /supabase-client-singleton-guard\.js/, 'singleton guard script path should be explicit');
console.log('property public runtime integrity contract: ok');
''')

print('NJW-258 lookup resolution v2 patch applied')
