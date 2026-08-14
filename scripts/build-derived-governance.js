const fs=require('fs');
const REG='property/data/marker-registry.json';
const FORM='property/data/derived-marker-formulas.json';
const OUT='property/data/derived-marker-governance.json';
const LIVE_URL=process.env.WATCHDOG_LIVE_MARKERS_URL||'https://njpropertytaxrelief.com/api/workbench-live-markers';
function read(p){return JSON.parse(fs.readFileSync(p,'utf8'))}
function countBy(arr,key){const out={};for(const x of arr){const vals=Array.isArray(x[key])?x[key]:[x[key]||'unknown'];for(const v of vals)out[v]=(out[v]||0)+1}return out}
async function main(){
 const registry=read(REG), formulaDoc=read(FORM), specs=formulaDoc.markers||{};
 const rr=await fetch(LIVE_URL,{headers:{accept:'application/json'}});
 if(!rr.ok)throw new Error(`live marker registry HTTP ${rr.status}`);
 const livePayload=await rr.json(), liveRows=Array.isArray(livePayload.markers)?livePayload.markers:[];
 const liveMap=new Map(liveRows.map(x=>[x.marker_id,x]));
 const derived=registry.markers.filter(m=>m.origin==='watchdog-derived'||m.proprietary===true);
 const triage=[]; const retired=new Set();
 for(const m of derived){
   const spec=specs[m.id]||{};
   const deps=Array.isArray(m.dependencies)?m.dependencies.filter(Boolean):Array.isArray(spec.dependencies)?spec.dependencies.filter(Boolean):[];
   const formula=String(m.formula||spec.formula||'').trim()||null;
   const live=liveMap.get(m.id);
   let governance_status,reason;
   if(live){governance_status='live';reason=`Canonical provider coverage is live via ${live.provider_key||live.provider_kind||'governed provider'}.`;}
   else if(deps.length||formula){governance_status='blocked';reason=deps.length?'Defined marker is blocked until all declared dependencies have executable governed providers.':'Formula intent exists but has not passed executable-definition and dependency validation.';}
   else{governance_status='retired';reason='Retired in Phase 5: no executable definition, formula specification, or dependency contract.';retired.add(m.id);}
   triage.push({marker_id:m.id,label:m.label||m.id,source_id:m.source_id||null,tier:m.tier||null,professions:m.professions||[],governance_status,formula,dependencies:deps,provider_key:live?.provider_key||null,provider_kind:live?.provider_kind||null,bulk_capable:live?.bulk_capable??false,reason});
 }
 const activeMarkers=registry.markers.filter(m=>!retired.has(m.id));
 const tmap=new Map(triage.map(x=>[x.marker_id,x]));
 for(const m of activeMarkers){const t=tmap.get(m.id);if(!t)continue;if(t.governance_status==='live'){m.provider_status='live';m.provider_note=t.reason}else if(t.governance_status==='blocked'){m.provider_status='planned';m.provider_note=t.reason}}
 registry.markers=activeMarkers;
 registry.generated_at=new Date().toISOString();
 registry.summary={
   total:activeMarkers.length,
   public_source:activeMarkers.filter(m=>!(m.origin==='watchdog-derived'||m.proprietary===true)).length,
   proprietary_derived:activeMarkers.filter(m=>m.origin==='watchdog-derived'||m.proprietary===true).length,
   by_tier:countBy(activeMarkers,'tier'),
   by_profession:countBy(activeMarkers,'professions'),
   percent_of_goal:Number((activeMarkers.length/Number(registry.target_markers||1000)*100).toFixed(1)),
   provider_status:countBy(activeMarkers,'provider_status'),
   retired_phase5:retired.size
 };
 const summary={total_derived:triage.length,live:triage.filter(x=>x.governance_status==='live').length,blocked:triage.filter(x=>x.governance_status==='blocked').length,retired:triage.filter(x=>x.governance_status==='retired').length,untriaged:triage.filter(x=>!['live','blocked','retired'].includes(x.governance_status)).length};
 if(summary.untriaged)throw new Error(`Phase 5 governance incomplete: ${summary.untriaged} untriaged derived markers`);
 for(const x of triage.filter(x=>x.governance_status==='live'))if(!liveMap.has(x.marker_id))throw new Error(`Live governance without canonical provider: ${x.marker_id}`);
 fs.writeFileSync(OUT,JSON.stringify({schema_version:1,generated_at:new Date().toISOString(),source_registry:REG,formula_specs:FORM,live_provider_registry:LIVE_URL,principle:'A derived marker is live only when canonical provider coverage is live. Defined but unsupported markers remain blocked. Undefined concepts are retired from the active marker catalog.',summary,markers:triage},null,2)+'\n');
 fs.writeFileSync(REG,JSON.stringify(registry,null,1)+'\n');
 console.log(`Phase 5 triage complete: ${summary.total_derived} derived markers => ${summary.live} live, ${summary.blocked} blocked, ${summary.retired} retired, ${summary.untriaged} untriaged.`);
}
main().catch(e=>{console.error(e.stack||e);process.exit(1)});
