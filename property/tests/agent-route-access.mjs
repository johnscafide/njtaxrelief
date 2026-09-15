import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const routes = ['agent-desk', 'farm-builder', 'farm-map', 'market-list', 'growth', 'report-studio', 'report-builder', 'marketing-studio'];
const guard = fs.readFileSync('property/js/access-guard.js', 'utf8');
let checks = 0;
for (const route of routes) {
  const html = fs.readFileSync(`property/${route}/index.html`, 'utf8');
  const required = html.match(/data-access-require="([^"]+)"/)?.[1];
  assert.equal(required, 'agent', `${route} is part of the Agent workflow`);
  for (const [plan, status, allowed] of [['agent','active',true], ['agent','trialing',true], ['agent','canceled',false], ['standard','active',false], ['pro','active',true], ['pro_plus','active',true], ['teams','active',true], ['unknown','active',false]]) {
    let redirect = null;
    const client = { auth: { getUser: async () => ({data:{user:{id:'agent-test'}}}) }, rpc: async name => ({data:name === 'is_watchdog_developer' ? false : [{plan_tier:plan,subscription_status:status}]}) };
    const document = { documentElement: {getAttribute:()=>required,classList:{add(){},remove(){}}}, body:{getAttribute:()=>null}, dispatchEvent(){} };
    const window = {supabase:{createClient:()=>client}};
    const location = {hostname:'www.watchdogindex.com',pathname:`/${route}`,search:'',hash:'',replace(value){redirect=value;}};
    vm.runInNewContext(guard, {window,document,location,URLSearchParams,CustomEvent:class {}});
    const result = await window.njptrAccessReady.then(()=>true,()=>false);
    assert.equal(result, allowed, `${route}: ${plan}/${status}`);
    assert.equal(redirect === null, allowed);
    checks++;
  }
}
console.log(`Agent route authorization: ${checks} actual guard executions passed (no network).`);
