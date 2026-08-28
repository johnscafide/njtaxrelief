import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (file) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
const page = await read('property/farm-map/index.html');
const adapter = await read('property/js/farm-map-vector-basemap.js');
const farmMap = await read('property/js/farm-map.js');

assert.match(page, /farm-map-vector-basemap\.js\?v=20260828a/);
assert.match(adapter, /maplibre-gl@5\.24\.0\/dist\/maplibre-gl\.js/);
assert.match(adapter, /@maplibre\/maplibre-gl-leaflet@0\.1\.4\/leaflet-maplibre-gl\.js/);
assert.match(adapter, /https:\/\/tiles\.openfreemap\.org\/styles\/liberty/);
assert.match(adapter, /new VectorBasemap\(options\)/);
assert.match(adapter, /this\._fallback=originalTileLayer/);
assert.match(adapter, /farmBasemap='openfreemap-vector'/);
assert.match(adapter, /farmBasemap='osm-fallback'/);
assert.match(adapter, /OpenFreeMap/);
assert.match(adapter, /OpenStreetMap contributors/);
assert.match(farmMap, /L\.Control\.Draw/);
assert.match(farmMap, /L\.Draw\.Event\.CREATED/);
assert.match(farmMap, /farm-intelligence-scan/);
assert.match(farmMap, /https:\/\/\{s\}\.tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);

console.log('farm-map vector basemap contract: ok');
