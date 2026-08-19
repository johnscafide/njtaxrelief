import fs from 'node:fs';

const files={
  hydrate:'supabase/functions/workbench-hydrate/index.ts',
  spatial:'supabase/functions/workbench-hydrate/environment-provider.ts',
  derived:'supabase/functions/workbench-derived/index.ts',
  migration:'supabase/migrations/20260819163000_closing_v3_complete_evidence_exception.sql'
};
for(const p of Object.values(files))if(!fs.existsSync(p))throw new Error(`${p} must exist`);
const read=p=>fs.readFileSync(p,'utf8');
const hydrate=read(files.hydrate),spatial=read(files.spatial),derived=read(files.derived),migration=read(files.migration);
const must=(ok,msg)=>{if(!ok)throw new Error(msg)};

must(hydrate.includes('Parcels_Composite_NJ_WM/FeatureServer/0/query'),'Workbench parcel hydration must use the current NJGIN hosted parcel composite.');
must(!hydrate.includes('Framework/Cadastral/MapServer/0/query'),'Workbench parcel hydration must not regress to the legacy cadastral query endpoint.');
must(hydrate.includes('njdepObservation'),'Workbench must consume status-aware spatial observations.');
must(hydrate.includes("status:fam.status||'source_checked_no_value'"),'Spatial evidence status must be preserved into marker metadata.');
must(hydrate.includes('dependency_missing:0')&&hydrate.includes('provider_error:0'),'Hydration summary must expose unavailable spatial evidence separately from no-hit evidence.');

must(spatial.includes("status:'dependency_missing'" )&&spatial.includes('parcel_coordinates_unavailable'),'Missing parcel coordinates must remain dependency_missing.');
must(spatial.includes("status:'provider_error'")&&spatial.includes('provider_timeout'),'Spatial provider failures/timeouts must remain provider_error.');
must(spatial.includes("status:'source_checked_no_value'"),'A successful authoritative check with no value/hit must retain its distinct state.');
must(spatial.includes("status:'available',value:fs.length>0"),'Successful boolean spatial checks must explicitly return available false/true rather than null.');

must(derived.includes("status === 'source_checked_no_value') return 0"),'Derived engine may map only an explicitly completed no-value preflight check to zero.');
must(!derived.includes("status === 'dependency_missing') return 0"),'Derived engine must never map dependency_missing to zero.');
must(!derived.includes("status === 'provider_error') return 0"),'Derived engine must never map provider_error to zero.');

must(migration.includes("'watchdog.closing_exception_priority_vnext'"),'Closing v3 must have a separate vNext exception aggregate.');
must(migration.includes("'require_all', true"),'Closing vNext exception aggregate must refuse partial evidence.');
must(migration.includes("'watchdog.closing_exception_attention_vnext',\n  2"),'Closing v3 feature registry must prefer the complete-evidence feature version.');

for(const [name,content] of Object.entries({hydrate,spatial,derived,migration}))must(!content.includes('?v='),`${name} must not introduce ?v= asset URLs.`);
console.log('Spatial evidence integrity contract passed: current NJ parcel source, no-hit/unavailable separation, no missing-to-zero coercion, complete-evidence Closing vNext aggregate.');
