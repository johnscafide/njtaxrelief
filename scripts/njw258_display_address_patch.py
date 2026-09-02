from pathlib import Path

path = Path('property/js/lookup.js')
s = path.read_text()

old = """  function propertyLocationZip(typed, matched) {
    // The property ZIP comes from the address evidence, never the parcel
    // layer's owner-mailing ZIP fields.
    return parcelZip(matched) || parcelZip(typed);
  }
"""
new = old + """
  function displayStreetAddress(typed, matched, assessor) {
    // The user-facing address should stay anchored to the address they searched
    // (prefer the NJ geocoder's canonical spelling). The parcel layer's PROP_LOC
    // can legitimately use an assessor street alias for the same tax parcel.
    var source = String(matched || typed || assessor || '').trim();
    var street = source.split(',')[0].trim();
    return street || String(assessor || typed || '').trim();
  }

  function assessorAddressAlias(display, assessor) {
    var parcelAddress = String(assessor || '').trim();
    if (!parcelAddress || !display) return '';
    return normAddr(parcelAddress) === normAddr(display) ? '' : parcelAddress;
  }
"""
if old not in s:
    raise SystemExit('propertyLocationZip anchor not found')
s = s.replace(old, new, 1)

old = """    var propertyZip = propertyLocationZip(typed, geo && geo.matched);
    var status = resolveStatus(p, dy);

    current = {
      address: p.PROP_LOC || typed, town: p.MUN_NAME || '', county: p.COUNTY || '', zip: propertyZip,
"""
new = """    var propertyZip = propertyLocationZip(typed, geo && geo.matched);
    var displayAddress = displayStreetAddress(typed, geo && geo.matched, p.PROP_LOC);
    var assessorAddress = String(p.PROP_LOC || '').trim();
    var assessorAlias = assessorAddressAlias(displayAddress, assessorAddress);
    var status = resolveStatus(p, dy);

    current = {
      address: displayAddress, assessorAddress: assessorAddress, assessorAlias: assessorAlias,
      town: p.MUN_NAME || '', county: p.COUNTY || '', zip: propertyZip,
"""
if old not in s:
    raise SystemExit('current address anchor not found')
s = s.replace(old, new, 1)

old = """      '<div class=\"plm-addr\">' + esc(current.address) + '<span>' + esc(current.town) +
        (current.county ? ', ' + esc(current.county) + ' County' : '') + (current.zip ? '  ' + esc(current.zip) : '') + '</span></div>' +
"""
new = """      '<div class=\"plm-addr\">' + esc(current.address) + '<span>' + esc(current.town) +
        (current.county ? ', ' + esc(current.county) + ' County' : '') + (current.zip ? '  ' + esc(current.zip) : '') + '</span>' +
        (current.assessorAlias
          ? '<span class=\"plm-assessor-alias\" style=\"font-size:12px;opacity:.72;margin-top:4px;\">NJ tax records list this parcel as ' + esc(current.assessorAlias) + '.</span>'
          : '') + '</div>' +
"""
if old not in s:
    raise SystemExit('headline address anchor not found')
s = s.replace(old, new, 1)

path.write_text(s)

test = Path('property/tests/property-display-address-contract.mjs')
test.write_text(r"""import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../js/lookup.js', import.meta.url), 'utf8');

assert.match(src, /function displayStreetAddress\(typed, matched, assessor\)/, 'searched/geocoded address display helper must exist');
assert.match(src, /var displayAddress = displayStreetAddress\(typed, geo && geo\.matched, p\.PROP_LOC\)/, 'render must derive the user-facing address from search evidence');
assert.match(src, /address: displayAddress, assessorAddress: assessorAddress, assessorAlias: assessorAlias/, 'current state must keep display and assessor addresses separately');
assert.doesNotMatch(src, /address: p\.PROP_LOC \|\| typed, town:/, 'assessor PROP_LOC must not overwrite the searched address in current state');
assert.match(src, /NJ tax records list this parcel as/, 'assessor alias should be disclosed as secondary context');
assert.match(src, /normAddr\(parcelAddress\) === normAddr\(display\)/, 'equivalent spellings must not produce a false alias note');

console.log('property display address contract: ok');
""")
