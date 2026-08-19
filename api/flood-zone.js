const FEMA = 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query';

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function coordState(raw, value, min, max) {
  if (raw === null || raw === undefined || raw === '') return 'missing';
  if (value === null) return 'non_numeric';
  if (value < min || value > max) return 'out_of_nj_bounds';
  return 'valid';
}

function referrerPath(req) {
  const raw = String(req.headers.referer || req.headers.referrer || '');
  if (!raw) return 'none';
  try {
    return new URL(raw).pathname || '/';
  } catch (_) {
    return 'invalid_referrer';
  }
}

function zoneLabel(zone) {
  const s = String(zone || '').trim().toUpperCase();
  if (!s) return 'Unknown';
  if (/^A|^V/.test(s)) return 'High-risk FEMA flood zone';
  if (s === 'X' || s.includes('X')) return s.includes('0.2') || s.includes('SHADED')
    ? 'Moderate-risk FEMA flood zone'
    : 'Minimal-risk FEMA flood zone';
  if (s === 'D') return 'Undetermined FEMA flood risk';
  return 'FEMA flood zone ' + s;
}

function risk(zone, sfha, subtype) {
  const Z = String(zone || '').toUpperCase();
  const S = String(sfha || '').toUpperCase();
  const U = String(subtype || '').toUpperCase();
  if (S === 'T' || S === 'Y' || S === 'YES' || /^A|^V/.test(Z)) return 'high';
  if (U.includes('0.2') || U.includes('500') || Z.includes('SHADED')) return 'moderate';
  if (Z === 'X' || U.includes('AREA OF MINIMAL')) return 'minimal';
  return 'unknown';
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  res.setHeader('Access-Control-Allow-Origin', 'https://njpropertytaxrelief.com');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });

  const rawLat = req.query.lat;
  const rawLon = req.query.lon;
  const lat = num(rawLat);
  const lon = num(rawLon);
  const latState = coordState(rawLat, lat, 38.8, 41.4);
  const lonState = coordState(rawLon, lon, -75.7, -73.8);

  if (latState !== 'valid' || lonState !== 'valid') {
    // Privacy-safe diagnostics only: never log coordinate values, addresses,
    // query strings, auth data, or user identifiers.
    console.warn('[flood-zone.invalid-request]', JSON.stringify({
      lat_state: latState,
      lon_state: lonState,
      referrer_path: referrerPath(req),
      fetch_site: String(req.headers['sec-fetch-site'] || 'unknown')
    }));
    return res.status(400).json({
      error: 'Valid New Jersey lat/lon required',
      code: 'INVALID_NJ_COORDINATES'
    });
  }

  try {
    const params = new URLSearchParams({
      f: 'json',
      where: '1=1',
      geometry: `${lon},${lat}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: '*',
      returnGeometry: 'false'
    });
    const response = await fetch(FEMA + '?' + params.toString(), {
      headers: {
        accept: 'application/json',
        'user-agent': 'Watchdog-NJPropertyTaxRelief/1.0'
      }
    });
    if (!response.ok) throw new Error('FEMA ' + response.status);
    const json = await response.json();
    if (json.error) throw new Error(json.error.message || 'FEMA query error');
    const attributes = json.features?.[0]?.attributes || null;
    if (!attributes) {
      return res.status(200).json({
        found: false,
        risk: 'unknown',
        zone: null,
        label: 'No effective FEMA flood-zone polygon returned at this point',
        source: 'FEMA National Flood Hazard Layer',
        source_layer: 28,
        checked_at: new Date().toISOString()
      });
    }

    const zone = attributes.FLD_ZONE ?? attributes.FLOOD_ZONE ?? attributes.ZONE ?? attributes.ZONE_LID;
    const subtype = attributes.ZONE_SUBTY ?? attributes.ZONE_SUBTYPE ?? attributes.SUBTYPE;
    const sfha = attributes.SFHA_TF ?? attributes.SFHA ?? attributes.SFHA_FLAG;
    return res.status(200).json({
      found: true,
      risk: risk(zone, sfha, subtype),
      zone: zone || null,
      subtype: subtype || null,
      sfha: sfha || null,
      label: zoneLabel(zone),
      static_bfe: attributes.STATIC_BFE ?? null,
      depth: attributes.DEPTH ?? null,
      velocity: attributes.VELOCITY ?? null,
      dfirm_id: attributes.DFIRM_ID ?? null,
      source: 'FEMA National Flood Hazard Layer',
      source_layer: 28,
      checked_at: new Date().toISOString()
    });
  } catch (_) {
    return res.status(502).json({
      error: 'Flood intelligence temporarily unavailable',
      code: 'FEMA_NFHL_UNAVAILABLE'
    });
  }
};
