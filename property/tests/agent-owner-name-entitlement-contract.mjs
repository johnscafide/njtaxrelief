import fs from 'node:fs';

const baseline = fs.readFileSync('supabase/functions/workbench-baseline/index.ts', 'utf8');
const hydrate = fs.readFileSync('supabase/functions/workbench-hydrate/index.ts', 'utf8');

function must(ok, message) {
  if (!ok) throw new Error(message);
}

for (const [name, source] of [['workbench-baseline', baseline], ['workbench-hydrate', hydrate]]) {
  must(source.includes("standard:0,agent:1,pro:2,pro_plus:3,teams:4,developer:5"), `${name} must preserve the commercial plan ladder.`);
  must(/if\(level>=1\)fields\.push\('OWNER_NAME'\)/.test(source), `${name} must make owner name eligible starting at Agent.`);
  must(/if\(level>=3\)fields\.push\('ST_ADDRESS','CITY_STATE','ZIP_CODE','ZIP_PLUS4'/.test(source), `${name} must keep owner mailing-address fields at Pro+ or higher.`);
  must(!/if\(level>=0\)fields\.push\('OWNER_NAME'\)/.test(source), `${name} must not expose owner names to Standard.`);
}

console.log('Agent owner-name entitlement contract passed.');
