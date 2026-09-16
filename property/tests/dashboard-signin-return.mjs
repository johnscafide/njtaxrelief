import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync('property/js/dashboard/wd-core.js','utf8');
for(const [search,expected] of [['','/dashboard'],['?county=CAMDEN','/dashboard?county=CAMDEN'],['?access=signin&return=%2Fmarket-list%3Fid%3Dexample','/market-list?id=example']]){
  let opened=null;
  const window={NJPTRSupabaseRuntime:{createClient:()=>({auth:{getSession:async()=>({data:{session:null}})}}),openOnboarding:next=>{opened=next;}}};
  const document={readyState:'complete',getElementById:()=>null};
  vm.runInNewContext(code,{window,document,location:{pathname:'/dashboard',search,hash:''},URLSearchParams,console,setTimeout:()=>1,clearTimeout(){}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(opened,expected,'Route must reach the shared safe onboarding flow with original destination');
}
console.log('Signed-out dashboard preserves the intended destination through shared onboarding.');
