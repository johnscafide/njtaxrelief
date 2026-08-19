import fs from 'node:fs';
import vm from 'node:vm';

const files={
  generator:'property/scripts/refresh_state_data.py',
  report:'property/data/data-freshness.json',
  trustPage:'property/trust/index.html',
  trustJs:'property/js/trust-data-health.js',
  trustCss:'property/css/trust-data-health.css',
  density:'property/js/watchdog-intelligence-density.js'
};
for(const path of Object.values(files))if(!fs.existsSync(path))throw new Error(`${path} must exist`);
const generator=fs.readFileSync(files.generator,'utf8');
const report=JSON.parse(fs.readFileSync(files.report,'utf8'));
const trustPage=fs.readFileSync(files.trustPage,'utf8');
const trustJs=fs.readFileSync(files.trustJs,'utf8');
const trustCss=fs.readFileSync(files.trustCss,'utf8');
const density=fs.readFileSync(files.density,'utf8');
const expect=(ok,msg)=>{if(!ok)throw new Error(msg)};
new vm.Script(trustJs,{filename:files.trustJs});
new vm.Script(density,{filename:files.density});

expect(generator.includes("'live_health'"),'Freshness generator must distinguish live endpoint health.');
expect(generator.includes("'materialized_coverage'"),'Freshness generator must distinguish materialized coverage.');
expect(generator.includes("'configured_reference'"),'Freshness generator must distinguish configured reference metadata.');
expect(generator.includes("'schema_version': 3"),'Freshness generator must emit schema v3 semantics.');
expect(generator.includes('Endpoint/service health was probed. This does not mean every property has a matching record.'),'Live health definition must reject property-match overclaiming.');
expect(generator.includes('A lineage/catalog reference is configured but is not represented as a live health check or local coverage test.'),'Configured references must not masquerade as coverage validation.');
expect(Array.isArray(report.datasets),'Freshness artifact must expose datasets.');
expect(Array.isArray(report.failures),'Freshness artifact must expose failures rather than hiding them.');
expect(report.overall_status==='passed'||report.overall_status==='failed','Freshness artifact needs an explicit overall status.');
expect(trustPage.includes('id="trust-data-health"'),'Trust Center must expose governed source evidence.');
expect(trustPage.includes('/property/js/trust-data-health.js'),'Trust Center must load the factual source-health renderer.');
expect(trustPage.includes('/property/css/trust-data-health.css'),'Trust Center must load source-health styling.');
expect(trustJs.includes("cache:'no-store'"),'Trust Center must request the current freshness artifact instead of a sticky browser copy.');
expect(trustJs.includes('A green endpoint does not mean a property matched that source'),'Public trust copy must distinguish endpoint health from property evidence.');
expect(trustJs.includes('Watchdog is not hiding degraded sources'),'Degraded sources must remain visibly disclosed.');
expect(trustJs.includes('not substituting a stale green status'),'Trust failure state must fail honest.');
expect(trustJs.includes("row.status==='failed'"),'Renderer must preserve explicit degraded rows.');
expect(trustJs.includes("if(row&&row.live)return'live_health'"),'Trust renderer must remain accurate during schema rollout.');
expect(density.includes('function trustMetrics(card)'),'Compact Analyst must extract governed trust metrics only when present.');
expect(density.includes('/Confidence\\s+(\\d{1,3})%/i'),'Compact Analyst confidence must come from rendered governed evidence text.');
expect(density.includes('/Evidence coverage\\s+(\\d{1,3})%/i'),'Compact Analyst evidence coverage must come from governed evidence text.');
expect(density.includes("trust?'<div class=\"wd-density-trust\""),'Compact trust cue must be conditional, not a fabricated generic badge.');
expect(density.includes('/property/trust/'),'Compact explainability cue must link to the Trust Center.');
expect(trustCss.includes('.trust-health-status.degraded'),'Trust Center needs a visually distinct degraded state.');
for(const [name,content] of Object.entries({generator,trustPage,trustJs,trustCss,density}))expect(!content.includes('?v='),`${name} must not introduce ?v= asset URLs.`);
console.log('Trust/freshness/explainability contract passed: explicit validation kinds, degraded-source honesty, compact governed metrics, no stale green state, no ?v=.');
