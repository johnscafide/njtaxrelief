#!/usr/bin/env node
// Contract for the NJDEP attribute map in supabase/functions/workbench-hydrate/environment-provider.ts
// and its production entry (production-njdep-attribute-map-bootstrap.ts plus import map).
// The provider is loaded directly as TypeScript. Node 22.18+ strips types by default.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const hydrateDir = path.join(root, 'supabase/functions/workbench-hydrate');
const registryJson = JSON.parse(fs.readFileSync(path.join(root, 'property/data/marker-registry.json'), 'utf8'));
const registry = new Map((Array.isArray(registryJson) ? registryJson : registryJson.markers || []).map((m) => [m.id, m]));

let features = [];
globalThis.fetch = async () => new Response(JSON.stringify({ features }));
const provider = await import(pathToFileURL(path.join(hydrateDir, 'environment-provider.ts')).href);
const observe = (id, i) => provider.njdepObservation(registry.get(id), { pams_pin: 'TEST_' + id + '_' + i, lat: 40 + i / 1e4, lon: -74 - i / 1e4 });

// 1. The 13 mapped markers apply to the current registry definitions; zero-feature layers stay unmapped.
const MAPPED = ['geology.bedrock_aquifer', 'geology.bedrock_geology', 'geology.groundwater_recharge_rank', 'geology.sole_source_aquifer', 'geology.physiographic_province', 'geology.surficial_geology', 'water.wellhead_community_tier', 'water.wellhead_community_travel_time', 'water.water_source_area', 'water.watershed_huc11', 'water.subwatershed_huc14', 'land.open_space_encumbrance', 'land.wetland_mitigation_service_area'];
for (const id of MAPPED) assert.ok(provider.njdepAttributeFor(registry.get(id)), `${id} attribute map matches the registry source and layer`);
for (const id of ['geology.surficial_aquifer', 'water.wellhead_noncommunity_tier', 'water.wellhead_noncommunity_travel_time', 'water.groundwater_treatment_source_area']) assert.equal(provider.njdepAttributeFor(registry.get(id)), null, `${id} stays unmapped`);
const mappedAll = [...registry.values()].filter((m) => provider.njdepAttributeFor(m)).map((m) => m.id).sort();
assert.deepEqual(mappedAll, [...MAPPED].sort(), 'no other registry marker is mapped');
assert.equal(provider.njdepAttributeFor({ ...registry.get('geology.physiographic_province'), source_layer: '21' }), null, 'a registry layer change disables the entry');

// 2. Values come from the named attribute, case-insensitively.
let i = 0;
const cases = [
  ['geology.bedrock_aquifer', [{ GEONAME: 'Passaic Formation', AQFRRANK: 'C' }], 'Passaic Formation'],
  ['geology.bedrock_geology', [{ geoname: 'Hardyston Quartzite', lithology: 'Quartzite' }], 'Hardyston Quartzite'],
  ['geology.groundwater_recharge_rank', [{ RANK: 'B', GWR: 12 }], 'B'],
  ['geology.sole_source_aquifer', [{ SSANAME: 'Highlands Aquifer System' }], 'Highlands Aquifer System'],
  ['geology.physiographic_province', [{ PROVINCE: 'Highlands', PROVINCES1: 4 }], 'Highlands'],
  ['geology.surficial_geology', [{ GEONAME: 'Cape May Formation', LITHOLOGY: 'Sand' }], 'Cape May Formation'],
  ['water.water_source_area', [{ SYS_NAME: 'Dover Water Commission', INT_NAME: 'Intake 1' }], 'Dover Water Commission'],
  ['water.watershed_huc11', [{ W_NAME: 'Mullica River', HUC11: 2040301150 }], 'Mullica River (HUC11 02040301150)'],
  ['water.subwatershed_huc14', [{ SW_NAME: 'Batsto River', HUC14: '02040301150010' }], 'Batsto River (HUC14 02040301150010)'],
  ['land.open_space_encumbrance', [{ ENCUMBRANCE_STATUS: 'Green Acres encumbered', OWNER: 'ignored' }], 'Green Acres encumbered'],
  ['land.wetland_mitigation_service_area', [{ SERVICEAREA: 'Northeast' }, { SERVICEAREA: 'Central' }], ['Northeast', 'Central']],
  ['water.wellhead_community_tier', [{ TIER: 3 }, { TIER: 1 }, { TIER: 2 }], 1],
  ['water.wellhead_community_travel_time', [{ TRAVELTIME: '12' }, { TRAVELTIME: '2' }], '2'],
];
for (const [id, attrs, want] of cases) {
  features = attrs.map((a) => ({ attributes: a }));
  assert.deepEqual(await observe(id, i++), { status: 'available', value: want }, id);
}
features = [{ attributes: { ENCUMBRANCE_STATUS: ' ' } }];
assert.deepEqual(await observe('land.open_space_encumbrance', i++), { status: 'source_checked_no_value', value: null, reason: 'mapped_attribute_empty' });
features = [];
assert.deepEqual(await observe('geology.physiographic_province', i++), { status: 'source_checked_no_value', value: null });

// 3. Hit and count markers keep their semantics.
features = [{ attributes: { NAME: 'x' } }, { attributes: { NAME: 'y' } }];
assert.deepEqual(await observe('land.open_space_hit', i++), { status: 'available', value: true });
assert.deepEqual(await observe('land.open_space_within_500m', i++), { status: 'available', value: 2 });
features = [];
assert.deepEqual(await observe('geology.abandoned_mine_within_1km', i++), { status: 'available', value: false });

// 4. The source string stays stable for existing release canaries and the source guard.
assert.equal(provider.NJDEP_PROVIDER_VERSION, 'spatial-preflight-v11-dca-community-access');
assert.equal(provider.NJDEP_ATTRIBUTE_MAP_VERSION, 'njdep-attribute-map-v1');

// 5. The production entry and its import map remap exactly the URL the entry checks.
const entry = fs.readFileSync(path.join(hydrateDir, 'production-njdep-attribute-map-bootstrap.ts'), 'utf8');
const importMap = JSON.parse(fs.readFileSync(path.join(hydrateDir, 'njdep-attribute-map.import-map.json'), 'utf8'));
const entries = Object.entries(importMap.imports || {});
assert.equal(entries.length, 1, 'import map remaps exactly one module');
assert.deepEqual(Object.keys(importMap), ['imports'], 'import map has no other settings');
const [[from, to]] = entries;
assert.match(from, /^https:\/\/raw\.githubusercontent\.com\/johnscafide\/njtaxrelief\/[0-9a-f]{40}\/supabase\/functions\/workbench-hydrate\/environment-provider\.ts$/);
assert.equal(to, './environment-provider.ts');
assert.ok(entry.includes(`from '${from}'`), 'entry imports the remapped URL');
assert.ok(entry.includes("import './production-epa-walkability-bootstrap.ts';"), 'entry loads the live v91 entry module');

console.log(`NJDEP attribute map contract passed: ${MAPPED.length} mapped markers, ${cases.length} value cases.`);
