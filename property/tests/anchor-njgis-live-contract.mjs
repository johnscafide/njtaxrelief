import fs from 'node:fs';

const GEOCODER = 'https://geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates';
const BOUNDS = { west: -75.62, north: 41.38, east: -73.85, south: 38.88 };
const example = fs.readFileSync('property/tests/anchor-njgis-fallback-fixture.txt','utf8').trim();
const params = new URLSearchParams({ SingleLine: example, outSR: '4326', maxLocations: '8', f: 'json' });
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 12000);

try {
  const response = await fetch(`${GEOCODER}?${params}`, { signal: controller.signal });
  if (!response.ok) throw new Error(`NJ GIS HTTP ${response.status}`);
  const data = await response.json();
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  const valid = candidates.find((candidate) => {
    const lat = Number(candidate?.location?.y);
    const lon = Number(candidate?.location?.x);
    const score = Number(candidate?.score) || 0;
    return Number.isFinite(lat) && Number.isFinite(lon) && score >= 70 &&
      lat >= BOUNDS.south && lat <= BOUNDS.north && lon >= BOUNDS.west && lon <= BOUNDS.east;
  });
  if (!valid) throw new Error(`NJ GIS returned no acceptable NJ candidate for ${example}`);
  console.log(`NJ GIS live candidate: ${valid.address || 'matched'} (${Math.round(Number(valid.score) || 0)}%)`);
} finally {
  clearTimeout(timer);
}
