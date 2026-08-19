import fs from 'node:fs';

const files={
  migration:'supabase/migrations/20260819144500_intelligence_source_fact_watch.sql',
  fn:'supabase/functions/intelligence-source-fact-watch/index.ts',
  config:'supabase/config.toml'
};
for(const p of Object.values(files))if(!fs.existsSync(p))throw new Error(`${p} must exist`);
const read=p=>fs.readFileSync(p,'utf8');
const migration=read(files.migration),fn=read(files.fn),config=read(files.config);
const must=(ok,msg)=>{if(!ok)throw new Error(msg)};

must(migration.includes("enabled boolean not null default false"),'Watcher control must default disabled in every environment.');
must(migration.includes('project_url text'),'Watcher must require an environment-local project URL before dispatch.');
must(migration.includes("name='watchdog_source_fact_watch_token'")&&migration.includes("vault.create_secret"),'Watcher token must be environment-local in Supabase Vault.');
must(migration.includes("encode(digest(v_token,'sha256'),'hex')"),'Migration must store only the raw-token SHA-256 hash.');
must(migration.includes("if not coalesce(v_enabled,false) or v_url is null then")&&migration.includes('return null'),'Scheduler dispatcher must fail closed while disabled or unconfigured.');
must(migration.includes("'17 */6 * * *'"),'Watcher cadence must remain bounded to every six hours.');
must(migration.includes('revoke all on public.intelligence_source_fact_watch_state from anon, authenticated'),'Watcher state must remain closed to browser roles.');
must(migration.includes('revoke all on public.intelligence_source_fact_watch_runs from anon, authenticated'),'Watcher run history must remain closed to browser roles.');
must(!migration.includes('https://uvkvaxljhhngydvlrzom.supabase.co'),'Production activation must not be hardcoded into the portable migration.');

must(fn.includes('x-watchdog-watch-token'),'Worker must require the internal watch token.');
must(fn.includes('shaText(token)')&&fn.includes('shaValue(next)'),'Worker must hash auth token as raw text while hashing marker values canonically.');
must(fn.includes('watchdog_effective_plan'),'Worker must use the authoritative server-side effective-plan contract.');
must(fn.includes('PLAN_RANK.agent'),'Worker must exclude Standard/Free saved properties from the background paid-property watch.');
must(fn.includes('NJ_PARCEL_ITEM_ID="533599bbfbaa4748bf39faf1375a8a9c"'),'Worker must resolve the current official NJ ArcGIS parcel item.');
must(!fn.includes('3e9f5e68c12f47e3b3dbd58201e051b2'),'Worker must not regress to the retired/wrong parcel item.');
must(fn.includes('www.arcgis.com/sharing/rest/content/items')&&fn.includes('resolveParcelQueryUrl'),'Worker must dynamically resolve the current official ArcGIS service instead of hardcoding a brittle FeatureServer path.');
must(fn.includes('if(!prior){baselines++')&&fn.includes('candidateUpserts.push'),'First observation must be baseline-only and candidate creation must require a prior value.');
must(fn.includes('if(String(prior.value_hash)===nextHash){unchanged++'),'Unchanged authoritative facts must remain idempotent.');
must(fn.includes('intelligence_material_change_candidates'),'Real later changes must enter only the service-only research candidate ledger.');
must(!fn.includes('property_update_events").insert')&&!fn.includes("property_update_events').insert"),'Watcher must not turn source-fact changes directly into customer update notifications.');
must(!fn.includes('intelligence_runs").insert')&&!fn.includes('intelligence_findings").insert'),'Watcher must not create Intelligence runs/findings.');
for(const forbidden of ['property.address','property.owner_name','property.lat','property.lon'])must(!fn.includes(`id:"${forbidden}"`),`Watcher must not baseline sensitive/static marker ${forbidden}.`);
for(const required of ['property.land_assessment','property.improvement_assessment','property.assessed_value','property.annual_tax','property.sale_price','property.sale_date','property.deed_book','property.deed_page'])must(fn.includes(`id:"${required}"`),`Watcher must include governed MOD-IV marker ${required}.`);
must(fn.includes('provider_batches')&&fn.includes('baselines_created')&&fn.includes('unchanged_observations')&&fn.includes('changed_observations')&&fn.includes('candidates_created'),'Watcher must record aggregate operational certification metrics.');
must(/\[functions\.intelligence-source-fact-watch\][\s\S]*?verify_jwt = false/.test(config),'Gateway JWT verification may be disabled only because the worker performs its own Vault-token authentication.');

for(const [name,content] of Object.entries({migration,fn,config}))must(!content.includes('?v='),`${name} must not introduce ?v= asset URLs.`);
console.log('Intelligence source-fact watch contract passed: env-safe disablement, Vault token auth, paid-plan gate, current official NJ service resolution, baseline-first/idempotent semantics, service-only research candidates, no notifications/findings, six-hour cadence, no ?v=.');
