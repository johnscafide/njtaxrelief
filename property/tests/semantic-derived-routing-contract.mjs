import fs from 'node:fs';

const path='supabase/functions/intelligence-semantic-context/index.ts';
if(!fs.existsSync(path))throw new Error(`${path} must exist`);
const src=fs.readFileSync(path,'utf8');
const must=(ok,msg)=>{if(!ok)throw new Error(msg)};

must(src.includes('watchdog-semantic-context-v8-derived-routing'),'Semantic Context must identify the derived-routing repair engine.');
must(src.includes('semantic-direct-markers-v2'),'Semantic direct-marker contract must invalidate stale provider_missing cache entries.');
must(src.includes('derived_formula_registry'),'Semantic Context must classify governed derived markers from the live formula registry.');
must(src.includes('derivedIds=markerIds.filter')&&src.includes('rawIds=markerIds.filter'),'Semantic Context must split derived and raw marker families.');
must(src.includes('/functions/v1/workbench-derived'),'Governed derived markers must route through workbench-derived.');
must(src.includes('/functions/v1/workbench-hydrate'),'Raw/source markers must continue to route through workbench-hydrate.');
must(src.includes('marker_ids:rawIds'),'Hydration must receive only raw/source marker IDs.');
must(src.includes('marker_ids:derivedIds'),'Derived resolution must receive only governed derived marker IDs.');
must(src.includes('providerKind==="derived"||providerKind==="derived_governed"'),'Governed derived observations must retain derived-signal authority semantics.');
must(src.includes('derivedResponse.status===403')&&src.includes('status:"not_entitled"'),'Plan denial for derived resolution must remain explicit instead of failing open or becoming provider_missing.');
must(src.includes('dependency_missing'),'Derived dependency gaps must remain distinguishable from missing provider wiring.');
must(!src.includes('?v='),'Semantic Context must not introduce versioned query-string assets.');

console.log('Semantic derived routing contract passed: raw/derived split, governed formula resolver, entitlement-safe fallback, derived authority, cache invalidation, no ?v=.');
