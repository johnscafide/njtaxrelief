/* ------------------------------------------------------------------
   nj-parcel-enrich.js
   Address -> NJ parcel -> MOD-IV assessment/tax data

   Two free public state endpoints, no API key, no signup:
     1. NJ_Geocode      (NJ Office of GIS statewide geocoder)
     2. Parcels_Composite_NJ_WM  (statewide parcels joined to MOD-IV)

   Drop this in btc.html and call enrichLead(address) per contact.
   ------------------------------------------------------------------ */

const NJ_GEOCODE_URL =
  'https://geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates';

const NJ_PARCEL_URL =
  'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query';

// Fields worth pulling. Full list is on the layer page if you want more.
const OUT_FIELDS = [
  'PAMS_PIN',     // unique parcel ID (county-mun-block-lot-qual)
  'COUNTY',
  'MUN_NAME',     // actual municipality, not the mailing town
  'PROP_LOC',     // property location as the assessor has it
  'PCLBLOCK',
  'PCLLOT',
  'PCLQCODE',
  'PROP_CLASS',   // 2 = residential, 4A/4B/4C = commercial, 3B = farm, etc.
  'BLDG_DESC',
  'LAND_DESC',
  'CALC_ACRE',
  'YR_CONSTR',
  'LAND_VAL',
  'IMPRVT_VAL',
  'NET_VALUE',    // total assessed value
  'LAST_YR_TX',   // actual prior-year tax bill in dollars
  'SALE_PRICE',
  'DEED_DATE',
  'DEED_BOOK',
  'DEED_PAGE',
  'DWELL'
].join(',');

/* Step 1: address -> lat/lon using NJ's own geocoder */
async function geocodeNJ(address) {
  const params = new URLSearchParams({
    SingleLine: address,
    outSR: '4326',
    maxLocations: '1',
    f: 'json'
  });

  const res = await fetch(`${NJ_GEOCODE_URL}?${params}`);
  if (!res.ok) throw new Error(`Geocoder returned ${res.status}`);

  const data = await res.json();
  const hit = data.candidates && data.candidates[0];
  if (!hit) return null;

  return {
    matchedAddress: hit.address,
    score: hit.score,          // 100 = clean rooftop-level match
    lat: hit.location.y,
    lon: hit.location.x
  };
}

/* Step 2: lat/lon -> the parcel polygon that contains that point */
async function parcelAtPoint(lat, lon) {
  const params = new URLSearchParams({
    geometry: JSON.stringify({
      x: lon,
      y: lat,
      spatialReference: { wkid: 4326 }
    }),
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: OUT_FIELDS,
    returnGeometry: 'false',
    resultRecordCount: '1',
    f: 'json'
  });

  const res = await fetch(`${NJ_PARCEL_URL}?${params}`);
  if (!res.ok) throw new Error(`Parcel service returned ${res.status}`);

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  const feat = data.features && data.features[0];
  return feat ? feat.attributes : null;
}

/* Fallback: no geocode hit, so try a text match on the assessor's own
   address string. Less reliable, use only when step 1 comes up empty. */
async function parcelByText(houseNumber, streetFragment, munName) {
  const where =
    `MUN_NAME = '${munName.toUpperCase().replace(/'/g, "''")}' ` +
    `AND PROP_LOC LIKE '${houseNumber} %${streetFragment.toUpperCase()}%'`;

  const params = new URLSearchParams({
    where,
    outFields: OUT_FIELDS,
    returnGeometry: 'false',
    resultRecordCount: '5',
    f: 'json'
  });

  const res = await fetch(`${NJ_PARCEL_URL}?${params}`);
  const data = await res.json();
  return (data.features || []).map(f => f.attributes);
}

/* Main entry point. Returns a flat object ready to merge into a contact. */
async function enrichLead(address) {
  const geo = await geocodeNJ(address);
  if (!geo) {
    return { status: 'no_geocode_match', inputAddress: address };
  }

  const p = await parcelAtPoint(geo.lat, geo.lon);
  if (!p) {
    return {
      status: 'geocoded_but_no_parcel',
      inputAddress: address,
      matchedAddress: geo.matchedAddress,
      lat: geo.lat,
      lon: geo.lon
    };
  }

  const assessed = p.NET_VALUE || 0;
  const tax = p.LAST_YR_TX || 0;
  const effectiveRate = assessed > 0 ? (tax / assessed) * 100 : null;

  return {
    status: 'ok',
    inputAddress: address,
    matchedAddress: geo.matchedAddress,
    matchScore: geo.score,
    lat: geo.lat,
    lon: geo.lon,

    pamsPin: p.PAMS_PIN,
    county: p.COUNTY,
    municipality: p.MUN_NAME,
    propertyLocation: p.PROP_LOC,
    block: p.PCLBLOCK,
    lot: p.PCLLOT,
    qualifier: p.PCLQCODE,

    propertyClass: p.PROP_CLASS,
    buildingDesc: p.BLDG_DESC,
    landDesc: p.LAND_DESC,
    acres: p.CALC_ACRE,
    yearBuilt: p.YR_CONSTR,
    units: p.DWELL,

    landValue: p.LAND_VAL,
    improvementValue: p.IMPRVT_VAL,
    assessedValue: assessed,
    lastYearTax: tax,
    effectiveTaxRatePct: effectiveRate ? +effectiveRate.toFixed(3) : null,

    lastSalePrice: p.SALE_PRICE,
    lastSaleDeedDate: p.DEED_DATE,   // 6-char assessor string, needs parsing
    deedBookPage: p.DEED_BOOK && p.DEED_PAGE
      ? `${p.DEED_BOOK}/${p.DEED_PAGE}`
      : null
  };
}

/* Batch helper. Be polite, these are free state servers. */
async function enrichBatch(addresses, delayMs = 250) {
  const out = [];
  for (const addr of addresses) {
    try {
      out.push(await enrichLead(addr));
    } catch (err) {
      out.push({ status: 'error', inputAddress: addr, error: String(err) });
    }
    await new Promise(r => setTimeout(r, delayMs));
  }
  return out;
}

/* Example:
   const r = await enrichLead('100 Main St, Williamstown, NJ 08094');
   console.log(r.municipality, r.assessedValue, r.lastYearTax);
*/
