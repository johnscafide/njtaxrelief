import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const brand = read('property/js/brand-consistency-runtime.js');
const runtime = read('property/js/map-persistence-runtime.js');

assert(brand.includes("MAP_PERSISTENCE='/property/js/map-persistence-runtime.js'"), 'Brand runtime must load map persistence');
assert(brand.indexOf('ensurePropertyImagery();') < brand.indexOf('ensureMapPersistence();'), 'Persistent map authority must load after legacy property imagery');
assert(runtime.includes("document.querySelector('#hm-body .hm-shot')"), 'Property Home hero must be covered');
assert(runtime.includes(".wd-mapless-property-hero"), 'Public property lookup hero must be covered');
assert(runtime.includes('MutationObserver'), 'Late async DOM replacements must be observed');
assert(runtime.includes("window.addEventListener('load'"), 'Late-load reassertion must be present');
assert(runtime.includes("window.addEventListener('watchdog:context-refresh'"), 'Context refresh must reassert the map');
assert(runtime.includes("id==='hm-switch'"), 'Property switching must reassert the map');
assert(runtime.includes('maps.nj.gov/arcgis/rest/services/Basemap/LtGray_NJ_WM/MapServer/export'), 'Only the free NJ Office of GIS basemap should render');
assert(!runtime.includes('maps.googleapis.com/maps/api/streetview'), 'Persistence runtime must not reintroduce Static Street View');
assert(!runtime.includes('StreetViewPanorama'), 'Persistence runtime must not reintroduce Dynamic Street View');

console.log('Persistent Property Home and lookup map contract passed.');