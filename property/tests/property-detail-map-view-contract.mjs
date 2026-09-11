import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (file) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
const [indexHtml, legacyHtml, lookup, mapJs, mapCss] = await Promise.all([
  read('property/index.html'),
  read('property-lookup.html'),
  read('property/js/lookup.js'),
  read('property/js/property-detail-map-view.js'),
  read('property/css/property-detail-map-view.css')
]);

for (const html of [indexHtml, legacyHtml]) {
  assert.match(html, /property-detail-map-view\.css\?v=20260911b/);
  assert.match(html, /property-detail-map-view\.js\?v=20260911b/);
  assert.doesNotMatch(html, /Have me check it properly/i);
}
assert.match(lookup, /Have Watchdog check the property/);
assert.doesNotMatch(lookup, /Have me check it properly/i);
assert.match(mapJs, /World_Imagery\/MapServer\/tile\/\{z\}\/\{y\}\/\{x\}/);
assert.match(mapJs, /L\.map/);
assert.match(mapJs, /plm-rail/);
assert.match(mapJs, /pl-track-card/);
assert.match(mapJs, /wd-property-leaflet-pin/);
assert.match(mapJs, /watchdogRecentProperties/);
assert.match(mapJs, /NJ_Geocode\/GeocodeServer\/findAddressCandidates/);
assert.match(mapJs, /Have Watchdog check the property/);
assert.doesNotMatch(mapJs, /MapServer\/export/);
assert.match(mapCss, /#plm-rail \.wd-property-map-view/);
assert.match(mapCss, /wd-index-mapless #plm-rail \.wd-property-map-leaflet\.leaflet-container/);
assert.match(mapCss, /prefers-reduced-motion/);
assert.doesNotMatch(mapCss, /border-left/i);

// Parse-only syntax guard for the customer-facing runtime.
new Function(mapJs);

console.log('property detail map view contract: ok');
