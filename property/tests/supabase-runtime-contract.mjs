import fs from 'node:fs';

function read(path){ return fs.readFileSync(path,'utf8'); }
function must(value,message){ if(!value) throw new Error(message); }

const runtime=read('property/js/supabase-runtime.js');
const nav=read('property/js/public-nav.js');
const index=read('property/index.html');
const anchorMigration=read('supabase/migrations/20260818233000_anchor_calculator_usage_consolidation.sql');

const productionRef='uvkvaxljhhngydvlrzom';
const stagingRef='pxossnwmrygxlpxtstnl';

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
must(nav.includes("opaqueCrossOrigin"),'Public bootstrap must identify opaque cross-origin script errors.');
must(nav.includes('stopImmediatePropagation'),'Public bootstrap must stop only classified non-fatal error noise before the legacy fatal listener.');

const navPos=index.indexOf('/property/js/public-nav.js');
const lookupPos=index.indexOf('/property/js/lookup.js');
must(navPos>=0 && lookupPos>navPos,'Public nav/runtime bootstrap must execute before lookup.js.');

must(anchorMigration.includes('anchor_calculator_uses'),'Primary Supabase must own the consolidated ANCHOR usage counter.');
must(anchorMigration.includes('record_anchor_calculator_use'),'ANCHOR usage writes must use the narrow RPC boundary.');
must(anchorMigration.includes('anchor_calculator_weekly_count'),'ANCHOR usage reads must use the narrow aggregate RPC boundary.');
must(anchorMigration.includes('revoke all on table public.anchor_calculator_uses from public, anon, authenticated'),'Raw calculator usage rows must not be client-readable/writable.');

for (const path of ['property/js/supabase-runtime.js','property/js/public-nav.js']) {
  must(!read(path).match(/\.js\?v=|\.css\?v=/),`${path} must not introduce version-query asset URLs.`);
}

console.log('Supabase runtime rotation-path contract passed.');
