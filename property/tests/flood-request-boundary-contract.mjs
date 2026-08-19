import fs from 'node:fs';
import vm from 'node:vm';

const guardPath='property/js/data-workbench-flood-guard.js';
const pagePath='property/data-workbench/index.html';
const apiPath='api/flood-zone.js';
const guard=fs.readFileSync(guardPath,'utf8');
const page=fs.readFileSync(pagePath,'utf8');
const api=fs.readFileSync(apiPath,'utf8');
const expect=(ok,msg)=>{if(!ok)throw new Error(msg)};

new vm.Script(guard,{filename:guardPath});
new vm.Script(api,{filename:apiPath});

expect(page.includes('/property/js/data-workbench-flood-guard.js'),'Data Workbench must load the flood request guard.');
expect(page.indexOf('/property/js/data-workbench-flood-guard.js')<page.indexOf('/property/js/data-workbench.js'),'Flood request guard must load before Data Workbench request producers.');
expect(guard.includes('lat>=38.8&&lat<=41.4&&lon>=-75.7&&lon<=-73.8'),'Client flood guard must enforce New Jersey bounds before network.');
expect(guard.includes("u.pathname==='/api/flood-zone'"),'Guard must be scoped only to the Watchdog flood endpoint.');
expect(guard.includes('local_guard:true'),'Invalid requests must fail locally rather than reaching production.');
expect(guard.includes('inflight.has(key)'),'Identical concurrent flood requests must share one in-flight network request.');
expect(api.includes("'[flood-zone.invalid-request]'"),'Server must retain privacy-safe invalid-request diagnostics.');
expect(api.includes('lat_state: latState'),'Diagnostics may record coordinate validity class.');
expect(api.includes('lon_state: lonState'),'Diagnostics may record coordinate validity class.');
expect(api.includes('referrer_path: referrerPath(req)'),'Diagnostics may record referrer pathname only.');
expect(!api.includes('lat_value'),'Diagnostics must not log latitude values.');
expect(!api.includes('lon_value'),'Diagnostics must not log longitude values.');
expect(!api.includes('req.url'),'Diagnostics must not log request URLs/query strings.');
expect(api.includes("code: 'INVALID_NJ_COORDINATES'"),'Invalid server requests need a stable error code.');
for(const [path,content] of [[guardPath,guard],[pagePath,page],[apiPath,api]])expect(!content.includes('?v='),`${path} must not introduce ?v= asset query parameters.`);
console.log('Flood request boundary, NJ coordinate validation, deduplication and privacy-safe diagnostics contract passed.');
