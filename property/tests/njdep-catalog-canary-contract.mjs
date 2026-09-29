#!/usr/bin/env node
// Static contract for the catalog_njdep_layers_v1 provider release canary.
// Keeps the canary's marker table, services, bootstrap chain and dispatcher
// allowlist in step with the marker registry, the live NJDEP resolver and
// earlier dispatcher definitions.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const SCENARIO = 'catalog_njdep_layers_v1';

const canary = read('supabase/functions/provider-release-canary/catalog-njdep-layers-canary.ts');
const bootstrap = read('supabase/functions/provider-release-canary/production-v044-bootstrap.ts');
const provider = read('supabase/functions/workbench-hydrate/environment-provider.ts');
const registryJson = JSON.parse(read('property/data/marker-registry.json'));
const registry = new Map((Array.isArray(registryJson) ? registryJson : registryJson.markers || []).map((m) => [m.id, m]));

// 1. Every target matches the registry's NJDEP source and layer.
const targets = [...canary.matchAll(/\{ id: '([^']+)', source: '([^']+)', layer: '([^']+)' \}/g)].map((m) => ({ id: m[1], source: m[2], layer: m[3] }));
assert.equal(targets.length, 29, 'canary covers the 29 unregistered NJDEP catalog markers');
assert.equal(new Set(targets.map((t) => t.id)).size, 29, 'no duplicate targets');
for (const t of targets) {
  const m = registry.get(t.id);
  assert.ok(m, `${t.id} is in the marker registry`);
  assert.equal(m.source_id, t.source, `${t.id} source_id matches the registry`);
  assert.equal(String(m.source_layer), t.layer, `${t.id} source_layer matches the registry`);
}

// 2. The canary queries the same NJDEP services as the resolver.
const serviceMap = (src) => Object.fromEntries([...src.matchAll(/'(njdep-(?:geology|hydro|land)-live)'\s*:\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
const canaryServices = serviceMap(canary), resolverServices = serviceMap(provider);
for (const source of new Set(targets.map((t) => t.source))) {
  assert.ok(canaryServices[source], `canary has a service for ${source}`);
  assert.equal(canaryServices[source], resolverServices[source], `${source} base URL matches environment-provider.ts`);
}

// 3. Diagnostics never persist parcel records beyond town and county.
const recordFields = new Set([...canary.matchAll(/\brecord\.(\w+)/g)].map((m) => m[1]));
assert.deepEqual([...recordFields].sort(), ['county', 'town'], 'only town and county are read from hydrate records');
assert.ok(!/owner|mailing|zip/i.test(canary.replace(/^\/\/.*$/gm, '')), 'no owner, mailing or ZIP fields in canary code');
assert.ok(/attribute_keys/.test(canary) && !/attribute_values/.test(canary), 'probes keep attribute key names only');
assert.ok(/finally\s*\{\s*if \(userId\) await cleanup\(userId\);/.test(canary), 'bootstrap user is always cleaned up');

// 4. The bootstrap routes the scenario and pins the previous graph to an immutable commit.
assert.match(bootstrap, /from '\.\/catalog-njdep-layers-canary\.ts'/);
assert.match(bootstrap, /scenario===CATALOG_NJDEP_SCENARIO\)return handleCatalogNjdepLayersCanary\(req\)/);
assert.match(bootstrap, /raw\.githubusercontent\.com\/johnscafide\/njtaxrelief\/[0-9a-f]{40}\/supabase\/functions\/provider-release-canary\/production-v043-bootstrap\.ts/);
assert.match(canary, new RegExp(`CATALOG_NJDEP_SCENARIO = '${SCENARIO}'`));

// 5. The newest dispatcher definition allows the scenario and drops no earlier scenario.
const migrations = fs.readdirSync(path.join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
const allowlists = migrations
  .map((f) => ({ f, sql: read('supabase/migrations/' + f) }))
  .filter(({ sql }) => /create or replace function public\.dispatch_provider_release_canary/i.test(sql))
  .map(({ f, sql }) => {
    const list = sql.match(/p_scenario not in \(([^)]*)\)/i);
    return { f, scenarios: list ? [...list[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [] };
  })
  .filter((x) => x.scenarios.length);
const newest = allowlists[allowlists.length - 1];
assert.ok(allowlists.some((x) => x.f === '20260929180000_allow_catalog_njdep_layers_canary.sql'), 'catalog canary dispatcher migration exists');
assert.ok(newest.scenarios.includes(SCENARIO), `newest dispatcher definition (${newest.f}) allows the catalog canary`);
const earlier = new Set(allowlists.slice(0, -1).flatMap((x) => x.scenarios));
for (const s of earlier) assert.ok(newest.scenarios.includes(s), `dispatcher still allows ${s}`);

console.log(`NJDEP catalog canary contract passed: ${targets.length} markers, ${newest.scenarios.length} dispatcher scenarios.`);
