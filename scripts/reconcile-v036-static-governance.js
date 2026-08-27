#!/usr/bin/env node
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=(p)=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const write=(p,v)=>fs.writeFileSync(path.join(ROOT,p),JSON.stringify(v,null,2)+'\n');
const now=new Date().toISOString();

const FOURTH_PREFIX='njplus.nj-dca-fourth-round-affordable.';
const FOURTH_VERSION='nj-dca-fourth-round-2025-2035-v1';
const FOURTH_SOURCE='NJ DCA Fourth Round (2025–2035) non-binding affordable housing calculations · published Methodology Appendix A · '+FOURTH_VERSION;
const WALK_ID='njplus.nj-dca-neighborhood-trends.walking_to_work_share';
const WALK_VERSION='nj-dca-neighborhood-trends-walk-2020-24-v1';
const WALK_SOURCE='NJ DCA 2026 Neighborhood Trends Database · % Walking to Work, 2020-24 Estimate · '+WALK_VERSION;
const fourthFields=[
  ['present_need','Present Need'],
  ['prospective_need','Prospective Need'],
  ['prospective_need_capped','Prospective Need Obligation with 1,000/20% Cap'],
  ['qualified_urban_aid','Qualified Urban Aid Municipality'],
  ['nonresidential_value_factor_pct','Equalized Nonresidential Valuation Factor'],
  ['land_capacity_factor_pct','Land Capacity Factor'],
  ['income_capacity_factor_pct','Income Capacity Factor'],
  ['average_allocation_factor_pct','Average Allocation Factor'],
  ['cap_1000_20pct','Cap'],
];
const liveIds=fourthFields.map(([f])=>FOURTH_PREFIX+f).concat(WALK_ID);

const overlayPath='property/data/db-governed-provider-overlay.json';
const overlay=read(overlayPath);
overlay.captured_at=now;
overlay.statuses=overlay.statuses||{};
overlay.providers=overlay.providers||{};
for(const [field] of fourthFields){
  const id=FOURTH_PREFIX+field;
  overlay.statuses[id]='live';
  overlay.providers[id]={provider_key:'workbench-hydrate',provider_kind:'authoritative_reference',calculation_key:FOURTH_VERSION,source:FOURTH_SOURCE,bulk_capable:true};
}
overlay.statuses[WALK_ID]='live';
overlay.providers[WALK_ID]={provider_key:'workbench-hydrate',provider_kind:'authoritative_reference',calculation_key:WALK_VERSION,source:WALK_SOURCE,bulk_capable:true};
write(overlayPath,overlay);

const inventoryPath='supabase/functions/PRODUCTION-INVENTORY.json';
const inventory=read(inventoryPath);
inventory.captured_at=now;
inventory.functions=inventory.functions||{};
inventory.functions['provider-release-canary']={...(inventory.functions['provider-release-canary']||{}),version:29,sha256:'ad1018cf9c53129c4cf56e553c0b4d700d4bcbd072cd7ceaa3929700fb5b10a6',verify_jwt:false,tracking:'source_snapshot'};
inventory.functions['workbench-hydrate']={...(inventory.functions['workbench-hydrate']||{}),version:63,sha256:'67f7d9043f83f2748ee8508996c3623762c43a67116e6a177c578377e8e9fbf6',verify_jwt:true,tracking:'source_snapshot'};
write(inventoryPath,inventory);

const sourcePath='property/data/source-registry.json';
const source=read(sourcePath);
source.datasets=source.datasets||[];
const fourthSource={
  id:'nj-dca-fourth-round-affordable',
  label:'NJ DCA Fourth Round 2025–2035 calculations',
  agency:'NJ Department of Community Affairs',
  source_url:'https://www.nj.gov/dca/dlps/4th_Round_Numbers.shtml',
  cadence:'source change / monitored',
  live:true,
  join:'Treasury municipality code to validated 564-row DCA municipality calculation record',
  warning:'DCA publishes the Fourth Round calculations as non-binding guidance. Watchdog presents published values and does not make a legal determination of municipal affordable-housing obligation.'
};
const idx=source.datasets.findIndex(x=>x&&x.id===fourthSource.id);
if(idx>=0)source.datasets[idx]={...source.datasets[idx],...fourthSource};else source.datasets.push(fourthSource);
write(sourcePath,source);

const registryPath='property/data/marker-registry.json';
const registry=read(registryPath);
const byId=new Map((registry.markers||[]).map(m=>[String(m.id||''),m]));
for(const id of liveIds){
  const row=byId.get(id);
  if(!row)throw new Error('Canonical v0.36 marker missing: '+id);
  row.provider_status='live';
  row.provider_note=id===WALK_ID
    ? 'Authenticated production canary v036_sources_v1 certified the exact NJ DCA 2026 Neighborhood Trends walking-to-work field. Mobility statistic only; not a generalized walkability score.'
    : 'Authenticated production canary v036_sources_v1 certified the exact NJ DCA Fourth Round published calculation field. DCA non-binding guidance; not a legal determination.';
  row.provider_contract='workbench-hydrate-v63';
}
const counts=(registry.markers||[]).reduce((a,m)=>{const k=String(m.provider_status||'planned');a[k]=(a[k]||0)+1;return a;},{});
registry.summary=registry.summary||{};
registry.summary.provider_status=Object.fromEntries(Object.entries(counts).sort());
registry.generated_at=now;
write(registryPath,registry);

console.log(JSON.stringify({updated:liveIds.length,provider_status:registry.summary.provider_status,inventory:{provider_release_canary:inventory.functions['provider-release-canary'],workbench_hydrate:inventory.functions['workbench-hydrate']}},null,2));
