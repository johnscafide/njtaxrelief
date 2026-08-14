const fs=require('fs');
const REG='property/data/marker-registry.json';
const FORM='property/data/derived-marker-formulas.json';
const ENGINE='supabase/functions/workbench-hydrate/derived-engine.ts';
const OUT='property/data/derived-marker-governance.json';
const PROFESSIONS=['consumer','attorney','title','agent','lender','appraiser','contractor','investor','municipal','insurance'];
// 2026-08-14: these 5 markers resolve through a second, separate live mechanism -- the
// trusted-observation pipeline in workbench-hydrate (a score_observations DB row), confirmed
// live and dated 2026-08-12/13 in Supabase's data_center_provider_coverage table. They will
// never appear in derived-engine.ts because they aren't formula-computed; they're populated by
// an external scoring pipeline. Before this exception, this script only knew about the
// formula-engine path, so it wrongly downgraded these to "blocked"/"planned" every time it ran
// (see the 2026-08-14 Data Marker Audit and the phase5-governance commit that reverted them).
// They resolve to "partial", not "live", because a value only appears once a prior observation
// exists for that property -- same standard Supabase already holds them to.
const TRUSTED_OBSERVATION=new Set(['watchdog.watchdog_score','watchdog.score','watchdog.tax_pressure','watchdog.revaluation_risk','uniformity.score']);
function read(p){return JSON.parse(fs.readFileSync(p,'utf8'))}
function countBy(arr,key){const out={};for(const x of arr){const vals=Array.isArray(x[key])?x[key]:[x[key]||'unknown'];for(const v of vals)out[v]=(out[v]||0)+1}return out}
function engineIds(){const s=fs.readFileSync(ENGINE,'utf8');return new Set([...s.matchAll(/^\s*'([^']+)':D\(/gm)].map(m=>m[1]))}
function label(id){return id.split('.').slice(1).join(' ').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
function main(){
 const registry=read(REG), formulaDoc=read(FORM), specs=formulaDoc.markers||{}, liveIds=engineIds();
 const ids=new Set(registry.markers.map(m=>m.id));
 for(const id of [...liveIds].filter(x=>!ids.has(x))){
   registry.markers.push({id,label:label(id),description:'Watchdog governed derived intelligence marker.',category:'derived',scope:'property',tier:'pro',origin:'watchdog-derived',proprietary:true,professions:[...PROFESSIONS],source_id:'watchdog-models',field:id.split('.').slice(1).join('_'),provider_status:'live',provider_note:'Executable definition is registered in the governed Phase 5 formula engine.'});
   ids.add(id);
 }
 const derived=registry.markers.filter(m=>m.origin==='watchdog-derived'||m.proprietary===true);
 const triage=[];const retired=new Set();
 for(const m of derived){
   const spec=specs[m.id]||{};
   const deps=Array.isArray(m.dependencies)?m.dependencies.filter(Boolean):Array.isArray(spec.dependencies)?spec.dependencies.filter(Boolean):[];
   const formula=String(m.formula||spec.formula||'').trim()||null;
   let governance_status,reason,provider_status_override=null;
   if(TRUSTED_OBSERVATION.has(m.id)){governance_status='live';provider_status_override='partial';reason='Resolved via the workbench-hydrate trusted-observation pipeline (a score_observations row), a governed live path outside the Phase 5 formula engine. Only returns a value once a prior observation exists for the property.';}
   else if(liveIds.has(m.id)){governance_status='live';reason='Executable definition is registered in the governed Phase 5 formula engine; canonical provider coverage is required before the value is returned.';}
   else if(deps.length||formula){governance_status='blocked';reason=deps.length?'Defined marker remains blocked until every dependency has a governed executable provider and the formula passes validation.':'Formula intent exists but has not passed executable-definition and dependency validation.';}
   else{governance_status='retired';reason='Retired in Phase 5: no executable definition, formula specification, or dependency contract.';retired.add(m.id);}
   triage.push({marker_id:m.id,label:m.label||m.id,source_id:m.source_id||null,tier:m.tier||null,professions:m.professions||[],governance_status,provider_status_override,formula,dependencies:deps,provider_key:TRUSTED_OBSERVATION.has(m.id)?'trusted_observation':liveIds.has(m.id)?'watchdog-derived':null,provider_kind:TRUSTED_OBSERVATION.has(m.id)?'trusted_observation':liveIds.has(m.id)?'derived_governed':null,bulk_capable:governance_status==='live',reason});
 }
 const activeMarkers=registry.markers.filter(m=>!retired.has(m.id)),tmap=new Map(triage.map(x=>[x.marker_id,x]));
 for(const m of activeMarkers){const t=tmap.get(m.id);if(!t)continue;if(t.governance_status==='live'){m.provider_status=t.provider_status_override||'live';m.provider_note=t.reason}else if(t.governance_status==='blocked'){m.provider_status='planned';m.provider_note=t.reason}}
 registry.markers=activeMarkers;registry.generated_at=new Date().toISOString();
 registry.summary={total:activeMarkers.length,public_source:activeMarkers.filter(m=>!(m.origin==='watchdog-derived'||m.proprietary===true)).length,proprietary_derived:activeMarkers.filter(m=>m.origin==='watchdog-derived'||m.proprietary===true).length,by_tier:countBy(activeMarkers,'tier'),by_profession:countBy(activeMarkers,'professions'),percent_of_goal:Number((activeMarkers.length/Number(registry.target_markers||1000)*100).toFixed(1)),provider_status:countBy(activeMarkers,'provider_status'),retired_phase5:retired.size};
 const summary={total_derived:triage.length,live:triage.filter(x=>x.governance_status==='live').length,blocked:triage.filter(x=>x.governance_status==='blocked').length,retired:triage.filter(x=>x.governance_status==='retired').length,untriaged:triage.filter(x=>!['live','blocked','retired'].includes(x.governance_status)).length};
 if(summary.untriaged)throw new Error(`Phase 5 governance incomplete: ${summary.untriaged} untriaged derived markers`);
 if(summary.total_derived!==summary.live+summary.blocked+summary.retired)throw new Error('Phase 5 governance totals do not reconcile');
 fs.writeFileSync(OUT,JSON.stringify({schema_version:2,generated_at:new Date().toISOString(),source_registry:REG,formula_specs:FORM,engine:ENGINE,engine_live_ids:[...liveIds].sort(),principle:'A derived marker is live only when it has an executable governed engine definition and canonical provider coverage. Defined but unsupported markers remain blocked. Undefined concepts are retired from the active marker catalog.',summary,markers:triage},null,2)+'\n');
 fs.writeFileSync(REG,JSON.stringify(registry,null,1)+'\n');
 console.log(`Phase 5 triage complete: ${summary.total_derived} derived markers => ${summary.live} executable, ${summary.blocked} blocked, ${summary.retired} retired, ${summary.untriaged} untriaged.`);
}
try{main()}catch(e){console.error(e.stack||e);process.exit(1)}
