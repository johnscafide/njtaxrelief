#!/usr/bin/env node
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=(p)=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const write=(p,v)=>fs.writeFileSync(path.join(ROOT,p),JSON.stringify(v,null,2)+'\n');
const now=new Date().toISOString();
const SOURCE='NJ DCA Affordable Housing Municipal Status Report · February 2026 · dca-affordable-housing-v037-feb-2026';
const AGG='dca-affordable-housing-v037-municipal-aggregate';
const pack=read('property/data/nj-source-pack-v037.json');
const ids=(pack.markers||[]).map(m=>String(m.id||'')).filter(Boolean);
if(ids.length!==31)throw new Error('Expected 31 v0.37 markers, got '+ids.length);

const overlayPath='property/data/db-governed-provider-overlay.json';
const overlay=read(overlayPath);
overlay.captured_at=now;overlay.statuses=overlay.statuses||{};overlay.providers=overlay.providers||{};
for(const item of pack.markers||[]){
  const id=String(item.id||'');const kind=String(item.provider_kind||'');
  if(!id||!['derived_governed','authoritative_reference'].includes(kind))throw new Error('Invalid v0.37 marker contract: '+id);
  overlay.statuses[id]='live';
  overlay.providers[id]={provider_key:'workbench-hydrate',provider_kind:kind,calculation_key:kind==='derived_governed'?AGG:null,source:SOURCE,bulk_capable:true};
}
write(overlayPath,overlay);

const inventoryPath='supabase/functions/PRODUCTION-INVENTORY.json';
const inventory=read(inventoryPath);inventory.captured_at=now;inventory.functions=inventory.functions||{};
inventory.functions['provider-release-canary']={...(inventory.functions['provider-release-canary']||{}),version:31,sha256:'2f023582e3614e507701e0847f86490aac6d073b0017b7ab6430d5ceaacd847f',verify_jwt:false,tracking:'source_snapshot'};
inventory.functions['workbench-hydrate']={...(inventory.functions['workbench-hydrate']||{}),version:65,sha256:'82afe85c926832b35aac796e5dd9bd306aa4277502a14438c694b04cface309b',verify_jwt:true,tracking:'source_snapshot'};
write(inventoryPath,inventory);

const sourcePath='property/data/source-registry.json';
const source=read(sourcePath);source.datasets=source.datasets||[];
const dca={id:'nj-dca-affordable-housing',label:'NJ DCA Affordable Housing Municipal Status Report',agency:'NJ Department of Community Affairs',source_url:'https://www.nj.gov/dca/dlps/hss/MuniStatusReporting.shtml',cadence:'annual / source change monitored',live:true,join:'Exact 4-digit DCA municipality code to governed project-row aggregation and municipal AHTF record',warning:'Selected municipality-entered AHMS data; the DCA workbook states it is not comprehensive and is presented as-is without DCA accuracy certification. Watchdog does not infer legal compliance. HUD-subsidized units, LMI cost burden and affordable_units_pipeline remain unavailable from this workbook.'};
const si=source.datasets.findIndex(x=>x&&x.id===dca.id);if(si>=0)source.datasets[si]={...source.datasets[si],...dca};else source.datasets.push(dca);write(sourcePath,source);

const registryPath='property/data/marker-registry.json';
const registry=read(registryPath);const byId=new Map((registry.markers||[]).map(m=>[String(m.id||''),m]));
for(const item of pack.markers||[]){const id=String(item.id||''),row=byId.get(id);if(!row)throw new Error('Canonical v0.37 marker missing: '+id);row.provider_status='live';row.provider_note=String(item.provider_kind)==='derived_governed'?'Authenticated production canary affordable_housing_v037 certified the governed municipal aggregation over exact DCA workbook fields. Source is selected municipality-entered monitoring data, not a legal/compliance determination.':'Authenticated production canary affordable_housing_v037 certified the exact municipal AHTF source field from the DCA workbook. Source is presented as-is and is not a legal/compliance determination.';row.provider_contract='workbench-hydrate-v65';}
const counts=(registry.markers||[]).reduce((a,m)=>{const k=String(m.provider_status||'planned');a[k]=(a[k]||0)+1;return a;},{});
const expected={live:572,partial:4,unavailable:12,planned:187};
for(const [k,v] of Object.entries(expected))if(Number(counts[k]||0)!==v)throw new Error(`Unexpected ${k} count: ${counts[k]||0} != ${v}`);
registry.summary=registry.summary||{};registry.summary.provider_status=Object.fromEntries(Object.entries(counts).sort());registry.generated_at=now;write(registryPath,registry);
console.log(JSON.stringify({updated:ids.length,provider_status:registry.summary.provider_status,inventory:{provider_release_canary:inventory.functions['provider-release-canary'],workbench_hydrate:inventory.functions['workbench-hydrate']}},null,2));
