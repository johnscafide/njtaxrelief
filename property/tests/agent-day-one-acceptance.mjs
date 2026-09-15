// Real Agent entry/interaction acceptance. Full report, notification, and purchase
// lifecycle certification remains a separate release checklist.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const productionRef = ['uvkva','xljhhng','ydvlrzom'].join('');
const base = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:4173';
const url = (process.env.STAGING_SUPABASE_URL || '').replace(/\/$/,'');
const key = process.env.STAGING_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.WATCHDOG_TEST_AGENT_EMAIL;
const password = process.env.WATCHDOG_TEST_AGENT_PASSWORD;
const dir = path.join(process.env.VISUAL_EVIDENCE_DIR || 'visual-acceptance-evidence','agent');
await fs.mkdir(dir,{recursive:true});
const checks=[];
let browser;
try {
  assert(url && key && email && password,'Dedicated staging Agent credentials and Supabase configuration are required.');
  const staging = new URL(url);
  assert(!url.includes(productionRef) && staging.protocol==='https:' && staging.hostname.endsWith('.supabase.co'),'Only a non-production staging Supabase project is allowed.');
  assert(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Use the locally hosted checkout rewritten to staging.');
  const login = await fetch(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email,password}),signal:AbortSignal.timeout(20000)});
  assert(login.ok,`Staging Agent login failed (HTTP ${login.status}).`);
  const session = await login.json();
  assert(session.access_token && session.user?.id,'Staging login did not return a valid session.');
  const headers={apikey:key,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'};
  async function rpc(name) {
    const response=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(20000)});
    assert(response.ok,`${name} failed: HTTP ${response.status}`);
    return response.json();
  }
  const [developer,entitlements]=await Promise.all([rpc('is_watchdog_developer'),rpc('get_my_entitlement')]);
  const entitlement=Array.isArray(entitlements)?entitlements[0]:entitlements;
  assert.equal(developer,false,'A Developer account cannot certify the Agent experience.');
  assert.equal(entitlement?.plan_tier,'agent','A genuine Agent entitlement is required.');
  assert(['active','trialing'].includes(entitlement.subscription_status),'Agent subscription must be active or trialing.');
  const {chromium,webkit}=await import('playwright');
  const surfaces=[
    {name:'desk',route:'/property/agent-desk/',ready:'#ad-app',button:'#ad-list-new',opened:'#ad-list-form'},
    {name:'farm-builder',route:'/property/farm-builder/',ready:'#fb-form'},
    {name:'farm-map',route:'/property/farm-map/',ready:'#fm-map'},
    {name:'growth',route:'/property/growth/',ready:'#gc-grid'},
    {name:'report-builder',route:'/property/report-builder/',ready:'#rb-app',button:'#rb-new',opened:'#rb-modal'}
  ];
  for (const spec of [{engine:chromium,name:'chromium',width:390},{engine:chromium,name:'chromium',width:1440},{engine:webkit,name:'webkit',width:390}]){
    browser=await spec.engine.launch({headless:true});
    for(const surface of surfaces){
      const context=await browser.newContext({viewport:{width:spec.width,height:900},isMobile:spec.width<500});
      const errors=[],failedRequests=[],blockedRequests=[];
      await context.route('**/*',route=>{
        const requestUrl=new URL(route.request().url());
        if(requestUrl.hostname.endsWith('.supabase.co') && requestUrl.origin!==staging.origin){blockedRequests.push(requestUrl.origin);return route.abort();}
        // API proxy calls from the local static host cannot reach production.
        return route.continue();
      });
      await context.addInitScript(({storageKey,session})=>localStorage.setItem(storageKey,JSON.stringify(session)),{storageKey:`sb-${staging.hostname.split('.')[0]}-auth-token`,session});
      const page=await context.newPage();
      page.on('pageerror',error=>errors.push(error.message.slice(0,300)));
      page.on('response',response=>{if(response.url().startsWith(staging.origin+'/rest/v1/') && response.status()>=400)failedRequests.push({path:new URL(response.url()).pathname,status:response.status()});});
      let failure=null;
      try{
        const response=await page.goto(base+surface.route,{waitUntil:'domcontentloaded',timeout:30000});
        assert(response?.ok(),'Page response failed.');
        await page.locator(surface.ready).waitFor({state:'visible',timeout:20000});
        assert(!/[?&]access=(signin|restricted)/.test(page.url()),'Agent was redirected by a plan gate.');
        assert.equal(new URL(page.url()).pathname.replace(/\/$/,''),surface.route.replace(/\/$/,''),'Unexpected navigation.');
        if(surface.button){await page.locator(surface.button).click();await page.locator(surface.opened).waitFor({state:'visible'});}
        const width=await page.evaluate(()=>document.documentElement.scrollWidth);
        assert(width<=spec.width+1,`Horizontal overflow: ${width}/${spec.width}`);
        assert.equal(blockedRequests.length,0,'A non-staging Supabase request was attempted.');
        assert.equal(failedRequests.length,0,'An Agent data request failed.');
        assert.equal(errors.length,0,'Page JavaScript errors occurred.');
      }catch(error){failure=String(error.message||error).replaceAll(email,'[test-email]').slice(0,500);}
      const screenshot=`${spec.name}-${spec.width}-${surface.name}.png`;
      await page.screenshot({path:path.join(dir,screenshot),fullPage:true});
      checks.push({surface:surface.name,engine:spec.name,width:spec.width,passed:!failure,failure,errors,failedRequests,blockedRequests,screenshot});
      await context.close();
    }
    await browser.close(); browser=null;
  }
  assert(checks.every(check=>check.passed),`${checks.filter(check=>!check.passed).length} Agent entry/interaction checks failed.`);
}catch(error){
  checks.push({stage:'acceptance',passed:false,failure:String(error.message||error).replaceAll(email||'\u0000','[test-email]').slice(0,600)});
  process.exitCode=1;
}finally{
  if(browser)await browser.close();
  await fs.writeFile(path.join(dir,'agent-acceptance.json'),JSON.stringify({checkedAt:new Date().toISOString(),scope:'actual-agent-entry-and-basic-interaction',passed:checks.length>0&&checks.every(c=>c.passed),checks},null,2));
  console.log(JSON.stringify({scope:'actual-agent-entry-and-basic-interaction',passed:!process.exitCode,checks:checks.length}));
}
