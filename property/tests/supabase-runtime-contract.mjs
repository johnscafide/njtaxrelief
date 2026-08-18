import fs from 'node:fs';

function read(path){ return fs.readFileSync(path,'utf8'); }
function must(value,message){ if(!value) throw new Error(message); }

const runtime=read('property/js/supabase-runtime.js');
const nav=read('property/js/public-nav.js');
const index=read('property/index.html');
const anchorBridge=read('anchor-watchdog-bridge.js');
const anchorEstimator=read('anchor-estimator.html');
const anchorMigration=read('supabase/migrations/20260818233000_anchor_calculator_usage_consolidation.sql');
const anchorEdgeMigration=read('supabase/migrations/20260818233500_anchor_usage_edge_boundary.sql');
const anchorEdge=read('supabase/functions/anchor-usage/index.ts');
const config=read('supabase/config.toml');

const productionRef='uvkvaxljhhngydvlrzom';
const stagingRef='pxossnwmrygxlpxtstnl';
const legacyAnchorRef='afagpnyjxomuvpfviycm';

must(runtime.includes(`ref: '${productionRef}'`),'Production Supabase ref must live in the canonical runtime.');
must(runtime.includes(`ref: '${stagingRef}'`),'Staging Supabase ref must live in the canonical runtime.');
must(runtime.includes('function knownConfigForUrl'),'Runtime must recognize legacy configured Supabase URLs.');
must(runtime.includes('window.supabase.createClient = function'),'Runtime must mediate legacy createClient calls.');
must(runtime.includes('window.fetch = function'),'Runtime must mediate legacy direct REST calls.');
must(runtime.includes("storageKey: 'sb-' + selected.ref + '-auth-token'"),'Runtime must enforce one environment-specific auth storage key.');
must(runtime.includes("flowType: 'pkce'"),'Runtime must keep the shared PKCE auth contract.');
must(runtime.includes("out.set('apikey', selected.key)"),'Runtime must rewrite legacy publishable API-key headers.');
must(runtime.includes("out.set('authorization', 'Bearer ' + selected.key)"),'Runtime must rewrite legacy publishable bearer headers.');

must(nav.includes('/property/js/supabase-runtime.js'),'Public property bootstrap must synchronously load the canonical Supabase runtime.');
must(!nav.includes('https://'+productionRef+'.supabase.co'),'Public nav must not duplicate production Supabase configuration.');
must(!nav.includes('https://'+stagingRef+'.supabase.co'),'Public nav must not duplicate staging Supabase configuration.');
must(nav.includes('opaqueCrossOrigin'),'Public bootstrap must identify opaque cross-origin script errors.');
must(nav.includes('stopImmediatePropagation'),'Public bootstrap must stop only classified non-fatal error noise before the legacy fatal listener.');

const navPos=index.indexOf('/property/js/public-nav.js');
const lookupPos=index.indexOf('/property/js/lookup.js');
must(navPos>=0 && lookupPos>navPos,'Public nav/runtime bootstrap must execute before lookup.js.');

must(anchorMigration.includes('anchor_calculator_uses'),'Primary Supabase must own the consolidated ANCHOR usage counter.');
must(anchorMigration.includes('revoke all on table public.anchor_calculator_uses from public, anon, authenticated'),'Raw calculator usage rows must not be client-readable/writable.');
must(anchorEdgeMigration.includes('drop function if exists public.record_anchor_calculator_use'),'Public ANCHOR write RPC must be removed after Edge migration.');
must(anchorEdgeMigration.includes('drop function if exists public.anchor_calculator_weekly_count'),'Public ANCHOR count RPC must be removed after Edge migration.');
must(anchorEdge.includes('anchor_calculator_uses'),'ANCHOR usage Edge Function must own table access.');
must(anchorEdge.includes('action === "record"'),'ANCHOR usage Edge Function must expose only the record action.');
must(anchorEdge.includes('action === "count"'),'ANCHOR usage Edge Function must expose only the count action.');
must(/\[functions\.anchor-usage\][\s\S]*?verify_jwt = false/.test(config),'ANCHOR public usage Edge Function must be explicitly registered.');

// The estimator is intentionally not rewritten wholesale. Its legacy counter
// constants remain inert compatibility input while the already-loaded bridge
// reroutes only that old counter surface to the primary project's Edge boundary.
must(anchorEstimator.includes(legacyAnchorRef),'Contract expects the known legacy ANCHOR counter literal while compatibility routing is active.');
must(anchorEstimator.indexOf('anchor-watchdog-bridge.js') < anchorEstimator.indexOf('var SB_URL'),'ANCHOR bridge must load before the legacy inline counter functions are defined.');
must(anchorBridge.includes(`https://${legacyAnchorRef}.supabase.co/rest/v1/calculator_uses`),'ANCHOR bridge must recognize the exact legacy counter surface.');
must(anchorBridge.includes(`https://${productionRef}.supabase.co/functions/v1/anchor-usage`),'ANCHOR bridge must route the counter into primary Watchdog Edge API.');
must(anchorBridge.includes("usage('count')"),'ANCHOR bridge must route weekly reads through the count action.');
must(anchorBridge.includes("usage('record')"),'ANCHOR bridge must route writes through the record action.');

for (const path of ['property/js/supabase-runtime.js','property/js/public-nav.js','anchor-watchdog-bridge.js']) {
  must(!read(path).match(/\.js\?v=|\.css\?v=/),`${path} must not introduce version-query asset URLs.`);
}

console.log('Supabase runtime rotation-path contract passed.');
