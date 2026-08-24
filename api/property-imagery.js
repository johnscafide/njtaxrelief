const NJ_AERIAL = 'https://maps.nj.gov/arcgis/rest/services/Basemap/Orthos_Natural_2020_NJ_WM/MapServer/export';
const KARTAVIEW = 'https://api.openstreetcam.org/2.0/photo/';
const MAPILLARY = 'https://graph.mapillary.com/images';

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function validNj(lat, lon) {
  return lat !== null && lon !== null && lat >= 38.8 && lat <= 41.4 && lon >= -75.7 && lon <= -73.8;
}

function aerialUrl(lat, lon, width = 760, height = 460) {
  const dx = 0.00145;
  const dy = 0.001;
  return NJ_AERIAL + '?' + new URLSearchParams({
    bbox: [lon - dx, lat - dy, lon + dx, lat + dy].join(','),
    bboxSR: '4326',
    imageSR: '3857',
    size: `${width},${height}`,
    format: 'jpg',
    transparent: 'false',
    f: 'image'
  }).toString();
}

function rad(x) { return x * Math.PI / 180; }
function distanceMeters(aLat, aLon, bLat, bLon) {
  const R = 6371000;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
function bearing(aLat, aLon, bLat, bLon) {
  const y = Math.sin(rad(bLon - aLon)) * Math.cos(rad(bLat));
  const x = Math.cos(rad(aLat)) * Math.sin(rad(bLat)) - Math.sin(rad(aLat)) * Math.cos(rad(bLat)) * Math.cos(rad(bLon - aLon));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function angleDelta(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 90;
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}
function rankCandidate(candidate, lat, lon) {
  const cLat = num(candidate.lat);
  const cLon = num(candidate.lon);
  if (cLat === null || cLon === null) return null;
  const meters = distanceMeters(cLat, cLon, lat, lon);
  if (meters > 180) return null;
  const face = bearing(cLat, cLon, lat, lon);
  const heading = num(candidate.heading);
  const headingDelta = heading === null ? 90 : angleDelta(heading, face);
  return Object.assign({}, candidate, {
    distance_m: Math.round(meters),
    heading_delta: Math.round(headingDelta),
    score: meters + headingDelta * 0.55
  });
}

function kartaImageUrl(row) {
  return row.imageProcUrl || row.image_proc_url || row.fileUrlProc || row.fileurlProc ||
    row.fileUrlLTh || row.fileurlLTh || row.fileUrl || row.fileurl || row.lth_name || row.name || null;
}
function absoluteKartaUrl(value) {
  if (!value) return null;
  if (/^https:\/\//i.test(value)) return value;
  const clean = String(value).replace(/^\/+/, '');
  return clean ? 'https://api.openstreetcam.org/' + clean : null;
}
function kartaSourceUrl(lat, lon) {
  return `https://kartaview.org/map/@${encodeURIComponent(lat)},${encodeURIComponent(lon)},18z`;
}

async function fetchKarta(lat, lon) {
  const url = KARTAVIEW + '?' + new URLSearchParams({
    lat: String(lat),
    lng: String(lon),
    radius: '140',
    zoomLevel: '18',
    join: 'sequence',
    orderBy: 'id',
    orderDirection: 'desc',
    page: '1',
    itemsPerPage: '30'
  }).toString();
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'Watchdog-Property-Imagery/1.0' },
    signal: AbortSignal.timeout(4500)
  });
  if (!response.ok) throw new Error('KartaView ' + response.status);
  const json = await response.json();
  const rows = Array.isArray(json?.result?.data) ? json.result.data
    : Array.isArray(json?.currentPageItems) ? json.currentPageItems
    : Array.isArray(json?.data) ? json.data : [];
  const candidates = rows.map((row) => {
    const image = absoluteKartaUrl(kartaImageUrl(row));
    if (!image) return null;
    return rankCandidate({
      provider: 'kartaview',
      id: String(row.id || row.photoId || row.photo_id || ''),
      sequence_id: String(row.sequenceId || row.sequence_id || row.sequence?.id || ''),
      sequence_index: String(row.sequenceIndex || row.sequence_index || ''),
      image_url: image,
      lat: row.lat ?? row.latitude,
      lon: row.lng ?? row.lon ?? row.longitude,
      heading: row.heading ?? row.compassAngle ?? row.compass_angle,
      captured_at: row.shotDate || row.shot_date || row.dateAdded || row.date_added || row.createdAt || null,
      attribution: 'KartaView · CC BY-SA 4.0'
    }, lat, lon);
  }).filter(Boolean).sort((a, b) => a.score - b.score);
  const best = candidates[0];
  if (!best) return null;
  best.source_url = kartaSourceUrl(best.lat, best.lon);
  delete best.score;
  return best;
}

async function fetchMapillary(lat, lon) {
  const token = process.env.MAPILLARY_CLIENT_TOKEN;
  if (!token) return null;
  const delta = 0.0017;
  const url = MAPILLARY + '?' + new URLSearchParams({
    bbox: [lon - delta, lat - delta, lon + delta, lat + delta].join(','),
    limit: '30',
    fields: 'id,geometry,captured_at,compass_angle,thumb_1024_url',
    access_token: token
  }).toString();
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'Watchdog-Property-Imagery/1.0' },
    signal: AbortSignal.timeout(4500)
  });
  if (!response.ok) throw new Error('Mapillary ' + response.status);
  const json = await response.json();
  const rows = Array.isArray(json?.data) ? json.data : [];
  const candidates = rows.map((row) => {
    const coordinates = row?.geometry?.coordinates || [];
    return rankCandidate({
      provider: 'mapillary',
      id: String(row.id || ''),
      image_url: row.thumb_1024_url || null,
      lat: coordinates[1],
      lon: coordinates[0],
      heading: row.compass_angle,
      captured_at: row.captured_at ? new Date(Number(row.captured_at)).toISOString() : null,
      attribution: 'Mapillary contributors'
    }, lat, lon);
  }).filter((x) => x && x.image_url).sort((a, b) => a.score - b.score);
  const best = candidates[0];
  if (!best) return null;
  best.source_url = `https://www.mapillary.com/app/?pKey=${encodeURIComponent(best.id)}&focus=photo`;
  delete best.score;
  return best;
}

function chooseStreet(results) {
  const rows = results.filter(Boolean);
  if (!rows.length) return null;
  rows.sort((a, b) => {
    const faceA = Number(a.heading_delta ?? 90);
    const faceB = Number(b.heading_delta ?? 90);
    const distanceA = Number(a.distance_m ?? 9999);
    const distanceB = Number(b.distance_m ?? 9999);
    return (distanceA + faceA * 0.55) - (distanceB + faceB * 0.55);
  });
  return rows[0];
}

module.exports = async function handler(req, res) {
  const origin = String(req.headers.origin || '');
  const allowed = ['https://www.watchdogindex.com', 'https://watchdogindex.com', 'https://njpropertytaxrelief.com', 'https://www.njpropertytaxrelief.com'];
  if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });

  const lat = num(req.query.lat);
  const lon = num(req.query.lon);
  if (!validNj(lat, lon)) return res.status(400).json({ error: 'Valid New Jersey lat/lon required', code: 'INVALID_NJ_COORDINATES' });

  const result = {
    aerial: {
      provider: 'njgin',
      image_url: aerialUrl(lat, lon),
      captured_year: 2020,
      attribution: 'NJ Office of GIS · 2020 statewide orthophotography',
      source_url: 'https://www.nj.gov/njgin/edata/imagery/'
    },
    street: null,
    provider_order: ['first_party_photo', 'mapillary', 'kartaview', 'njgin_aerial', 'google_on_demand_only']
  };

  if (String(req.query.street || '1') !== '0') {
    const settled = await Promise.allSettled([fetchMapillary(lat, lon), fetchKarta(lat, lon)]);
    result.street = chooseStreet(settled.map((x) => x.status === 'fulfilled' ? x.value : null));
  }

  return res.status(200).json(result);
};
