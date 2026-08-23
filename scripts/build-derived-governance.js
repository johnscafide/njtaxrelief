const fs=require('fs');
const REG='property/data/marker-registry.json';
const FORM='property/data/derived-marker-formulas.json';
const STATUS='property/data/db-governed-status.json';
const OVERLAY='property/data/db-governed-provider-overlay.json';
const OUT='property/data/derived-marker-governance.json';
const PROFESSIONS=['consumer','attorney','title','agent','lender','appraiser','contractor','investor','municipal','insurance'];
const TRUSTED_OBSERVATION=new Set(['watchdog.watchdog_score','watchdog.score','watchdog.tax_pressure','watchdog.revaluation_risk','uniformity.score']);
function read(p){return JSON.parse(fs.readFileSync(p,'utf8'))}
function countBy(arr,key){const out={};for(const x of arr){const vals=Array.isArray(x[key])?x[key]:[x[key]||'unknown'];for(const v of vals)out[v]=(out[v]||0)+1}return out}
function label(id){return id.split('.').slice(1).join(' ').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
function main(){
 const registry=read(REG),formulaDoc=read(FORM),specs=formulaDoc.markers||{},statusDoc=read(STATUS),overlayDoc=fs.existsSync(OVERLAY)?read(OVERLAY):{statuses:{},providers:{}},dbStatus={...(statusDoc.statuses||{}),...(overlayDoc.statuses||{})},providerMeta=overlayDoc.providers||{};
 const ids=new Set(registry.markers.map(m=>m.id));
 // DB provider coverage is the production authority. If a formula specification is
 // governed live/partial in the committed DB snapshot but is missing from the static
 // registry, add it rather than depending on source-code regexes from a specific engine.
 for(const id of Object.keys(specs).filter(id=>['live','partial'].includes(dbStatus[id])&&!ids.has(id))){
   registry.markers.push({id,label:label(id),description:'Watchdog governed derived intelligence marker.',category:'derived',scope:'property',tier:'pro',origin:'watchdog-derived',proprietary:true,professions:[...PROFESSIONS],source_id:'watchdog-models',field:id.split('.').slice(1).join('_'),provider_status:dbStatus[id],provider_note:'Production status is governed by the database-first Data Center provider registry.'});
   ids.add(id);
 }
 const derived=registry.markers.filter(m=>m.origin==='watchdog-derived'||m.proprietary===true);
 const triage=[];const retired=new Set();
 for(const m of derived){
   const spec=specs[m.id]||{};
   const deps=Array.isArray(m.dependencies)?m.dependencies.filter(Boolean):Array.isArray(spec.dependencies)?spec.dependencies.filter(Boolean):[];
   const formula=String(m.formula||spec.formula||'').trim()||null;
   const authoritative=dbStatus[m.id]||null;
   const provider=providerMeta[m.id]&&typeof providerMeta[m.id]==='object'?providerMeta[m.id]:{};
   let governance_status,reason,provider_status_override=null;
   if(authoritative==='live'){
     governance_status='live';provider_status_override='live';reason='Production Data Center provider governance marks this derived marker live. Runtime execution remains dependency-gated and missing inputs do not receive synthetic values.';
   } else if(authoritative==='partial'){
     governance_status='live';provider_status_override='partial';reason=TRUSTED_OBSERVATION.has(m.id)?'Production Data Center governance marks this trusted-observation marker partial: the path is live, but a value is present only when a governed observation exists for the property.':'Production Data Center governance marks this derived path partial because source or property-level coverage is incomplete.';
   } else if(authoritative==='unavailable'){
     governance_status='blocked';provider_status_override='unavailable';reason='Production Data Center governance marks this marker unavailable; it must not be promoted until an authoritative executable path exists.';
   } else if(deps.length||formula){
     governance_status='blocked';reason=deps.length?'Defined marker remains blocked until every dependency has a governed executable provider and the formula passes validation.':'Formula intent exists but has not passed executable-definition and dependency validation.';
   } else{
     governance_status='retired';reason='Retired in Phase 5: no executable definition, formula specification, dependency contract, or production-governed provider state.';retired.add(m.id);
   }
   triage.push({marker_id:m.id,label:m.label||m.id,source_id:m.source_id||null,tier:m.tier||null,professions:m.professions||[],governance_status,provider_status_override,formula,dependencies:deps,provider_key:authoritative==='live'?(provider.provider_key||'watchdog-derived'):TRUSTED_OBSERVATION.has(m.id)?'trusted_observation':null,provider_kind:authoritative==='live'?(provider.provider_kind||'derived_governed'):TRUSTED_OBSERVATION.has(m.id)?'trusted_observation':null,calculation_key:authoritative==='live'?(provider.calculation_key||null):null,provider_source:authoritative==='live'?(provider.source||null):null,bulk_capable:authoritative==='live'?(typeof provider.bulk_capable==='boolean'?provider.bulk_capable:true):false,reason});
 }
 const activeMarkers=registry.markers.filter(m=>!retired.has(m.id)),tmap=new Map(triage.map(x=>[x.marker_id,x]));
 for(const m of activeMarkers){
   // NJ DCA's New Home Warranty quarterly tables are county-level. Normalize the
   // legacy v0.31 municipality scope for both source markers and downstream derived
   // markers so generated canonical governance cannot overstate source granularity.
   if(m.source_id==='nj-dca-new-home-warranty'||(Array.isArray(m.dependencies)&&m.dependencies.includes('nj-dca-new-home-warranty')))m.scope='county';
   const t=tmap.get(m.id);
   if(t){
     if(t.governance_status==='live'){m.provider_status=t.provider_status_override||'live';m.provider_note=t.reason}
     else if(t.governance_status==='blocked'){m.provider_status=t.provider_status_override||'planned';m.provider_note=t.reason}
   }
   // Production Data Center governance applies to every canonical marker, including
   // authoritative public-source markers. The older Phase 5 path applied DB authority
   // only to derived markers, which left source-backed LIVE providers labeled PLANNED.
   const authoritative=dbStatus[m.id];
   if(['live','partial','planned','unavailable'].includes(authoritative)){
     m.provider_status=authoritative;
     if(!t)m.provider_note='Production status is governed by the database-first Data Center provider registry; runtime dependency and source checks remain authoritative.';
   }
 }
 registry.markers=activeMarkers;registry.generated_at=new Date().toISOString();
 registry.summary={total:activeMarkers.length,public_source:activeMarkers.filter(m=>!(m.origin==='watchdog-derived'||m.proprietary===true)).length,proprietary_derived:activeMarkers.filter(m=>m.origin==='watchdog-derived'||m.proprietary===true).length,by_tier:countBy(activeMarkers,'tier'),by_profession:countBy(activeMarkers,'professions'),percent_of_goal:Number((activeMarkers.length/Number(registry.target_markers||1000)*100).toFixed(1)),provider_status:countBy(activeMarkers,'provider_status'),retired_phase5:retired.size};
 const summary={total_derived:triage.length,live:triage.filter(x=>x.governance_status==='live').length,blocked:triage.filter(x=>x.governance_status==='blocked').length,retired:triage.filter(x=>x.governance_status==='retired').length,untriaged:triage.filter(x=>!['live','blocked','retired'].includes(x.governance_status)).length};
 if(summary.untriaged)throw new Error(`Phase 5 governance incomplete: ${summary.untriaged} untriaged derived markers`);
 if(summary.total_derived!==summary.live+summary.blocked+summary.retired)throw new Error('Phase 5 governance totals do not reconcile');
 const governedLiveIds=triage.filter(x=>x.governance_status==='live').map(x=>x.marker_id).sort();
 fs.writeFileSync(OUT,JSON.stringify({schema_version:3,generated_at:new Date().toISOString(),source_registry:REG,formula_specs:FORM,governance_status_snapshot:STATUS,governance_status_overlay:OVERLAY,engine_live_ids:governedLiveIds,governed_live_ids:governedLiveIds,principle:'A derived marker is live only when production Data Center governance records a live or partial executable path. Formula intent alone never promotes a marker. Missing dependencies remain missing rather than receiving synthetic neutral values. Database-governed provider status also overrides stale static status for authoritative public-source markers.',summary,markers:triage},null,2)+'\n');
 fs.writeFileSync(REG,JSON.stringify(registry,null,1)+'\n');
 console.log(`Phase 5 triage complete: ${summary.total_derived} derived markers => ${summary.live} governed, ${summary.blocked} blocked, ${summary.retired} retired, ${summary.untriaged} untriaged.`);
}
try{main()}catch(e){console.error(e.stack||e);process.exit(1)}
