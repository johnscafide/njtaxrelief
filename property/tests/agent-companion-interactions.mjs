// Isolated fixtures exercise real Contacts/Transaction UI code. No customer or production network access.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.WATCHDOG_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const out=process.env.AGENT_FIXTURE_EVIDENCE_DIR;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
async function fixture(surface,width=1440,plan='agent'){
  const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const allowed=['transaction.js','shell.js','preflight.js','evidence-addons.js','municipal-clearance.js','municipal-status.js','documents.js','refinements.js','evidence-first.js','command-center-polish.js','contacts.js','crm-companion-install.js','contact-intelligence.js','simple-workflow.js','plan-context.js'];
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!=='https://companion-fixture.test')return route.abort();
    let file=url.pathname;
    if(file==='/transaction/')file='/transaction/index.html';
    if(file==='/agent/contacts')file='/property/agent/contacts/index.html';
    const target=path.resolve(root,'.'+file);if(!target.startsWith(root+path.sep))return route.abort();
    if(file.endsWith('.js')&&!allowed.includes(path.basename(file)))return route.fulfill({contentType:'text/javascript',body:''});
    try{
      let body=await fs.readFile(target);
      return route.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream',body});
    }catch{return route.abort()}
  });
  await page.addInitScript(({plan})=>{
    const rows={transaction_workspaces:[],transaction_items:[],transaction_disclosures:[],transaction_activity:[],transaction_documents:[],agent_contact_files:[],profiles:[{id:'fixture-owner',display_name:'Fixture Agent'}]};
    const blobs=new Map();let serial=0;
    const state=window.companionFixture={rows,invocations:[],failDetails:false,failUpdates:false,failArchive:false};
    function query(table){
      let op='read',payload,single=false;const filters=[];
      const chain={
        select(){return chain},order(){return chain},limit(){return chain},
        eq(key,v){filters.push(row=>row[key]===v);return chain},in(key,values){filters.push(row=>values.includes(row[key]));return chain},
        single(){single=true;return chain},maybeSingle(){single=true;return chain},
        insert(value){op='insert';payload=value;return chain},update(value){op='update';payload=value;return chain},delete(){op='delete';return chain},
        then(resolve,reject){
          if((state.failDetails&&table==='transaction_items'&&op==='read')||(state.failUpdates&&op==='update')||(state.failArchive&&table==='agent_contact_files'&&op==='insert'))return Promise.resolve({data:null,error:{message:'Fixture failure'}}).then(resolve,reject);
          const source=rows[table]||(rows[table]=[]);let result=source.filter(row=>filters.every(f=>f(row)));
          if(op==='insert'){result=(Array.isArray(payload)?payload:[payload]).map(row=>({id:'record-'+(++serial),created_at:new Date().toISOString(),readiness_status:'review',status:'under_contract',...row}));source.push(...result)}
          if(op==='update')result.forEach(row=>Object.assign(row,payload));
          if(op==='delete')rows[table]=source.filter(row=>!result.includes(row));
          return Promise.resolve({data:JSON.parse(JSON.stringify(single?result[0]||null:result)),error:null}).then(resolve,reject);
        }
      };return chain;
    }
    const user={id:'fixture-owner'};
    const client={from:query,auth:{getUser:async()=>({data:{user}}),getSession:async()=>({data:{session:{user}}})},
      rpc:async()=>({data:[{plan_tier:plan,subscription_status:'active'}],error:null}),
      functions:{invoke:async name=>{state.invocations.push(name);return{data:{},error:null}}},
      storage:{from:()=>({upload:async(p,b)=>{blobs.set(p,b);return{error:null}},download:async p=>({data:blobs.get(p),error:null}),remove:async paths=>{paths.forEach(p=>blobs.delete(p));return{error:null}}})}
    };
    window.supabase={createClient:()=>client};window.NJPTRSupabaseRuntime={createClient:()=>client};
  },{plan});
  await page.goto('https://companion-fixture.test'+(surface==='contacts'?'/agent/contacts':'/transaction/'));
  if(surface==='contacts')await page.locator('#acx-app[aria-busy="false"]').waitFor();else{await page.locator('#tx-app').waitFor();await page.locator('#tx-v2-shell').waitFor()}
  return{page,context,errors};
}
async function addTransaction(page,address,clientLabel=''){
  await page.locator('#txv2-empty [data-tx-action="add"]').click();
  await page.locator('#tx-form input[name="address"]').fill(address);
  if(clientLabel)await page.locator('#tx-form input[name="client_label"]').fill(clientLabel);
  await page.locator('#tx-save').click();
  await page.locator('#txv2-detail').waitFor();
  await page.locator('#txv2-loading').waitFor({state:'hidden'});
}
try{
  for(const width of [390,1440]){
    const {page,context,errors}=await fixture('transaction',width);
    await addTransaction(page,'123 Fixture Street, Test Town, NJ','Fixture client');
    assert.equal(await page.locator('[data-v2-action="refresh"]').isVisible(),false,'Agent must not expose a fake paid refresh action');
    assert.match(await page.locator('#txv2-document-copy').innerText(),/available with Pro\+/i);
    assert.match(await page.locator('#txv2-attention').innerText(),/review needed/i);
    await page.waitForTimeout(1700);
    assert.deepEqual(await page.evaluate(()=>companionFixture.invocations),[],'Agent must not invoke paid evidence sweeps');
    assert.equal(await page.locator('#tx-documents-card').count(),0,'Agent must see a labeled upgrade instead of an unusable Pro+ document vault');
    assert.equal(await page.evaluate(()=>!!window.__WATCHDOG_TRANSACTION_DOCUMENTS__),false);
    assert.equal(await page.evaluate(()=>companionFixture.rows.transaction_workspaces[0].watch_enabled),false);
    await page.locator('[data-v2-action="toggle-overflow"]').click();
    const edit=page.locator('#txv2-overflow-menu [data-tx-action="edit"]');await edit.click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#tx-modal-layer').isVisible(),false);
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.txAction),'edit');
    await page.evaluate(()=>companionFixture.failDetails=true);
    await page.locator('[data-v2-tx-id]').first().click();
    await page.locator('#txv2-load-error').waitFor();
    assert.equal(await page.locator('#txv2-overview').isVisible(),false,'Failed load cannot become a cleared evidence view');
    await page.evaluate(()=>companionFixture.failDetails=false);
    await page.locator('[data-v2-action="retry"]').click();
    await page.locator('#txv2-overview').waitFor();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Transaction document overflow');
    assert.deepEqual(errors,[]);
    if(out){await fs.mkdir(out,{recursive:true});await page.screenshot({path:path.join(out,`transaction-agent-${width}-FIXTURE.png`),fullPage:true})}
    await context.close();
  }
  const premium=await fixture('transaction',1440,'pro_plus');
  await addTransaction(premium.page,'456 Premium Fixture Street, NJ');
  assert.equal(await premium.page.locator('[data-v2-action="refresh"]').isVisible(),true);
  await premium.page.locator('[data-v2-action="refresh"]').click();
  await premium.page.waitForFunction(()=>companionFixture.invocations.includes('transaction-evidence-sweep'));
  await premium.page.locator('#tx-documents-card').waitFor();
  assert.deepEqual(premium.errors,[]);await premium.context.close();
  const {page,context,errors}=await fixture('contacts');
  await page.locator('#acx-file-input').setInputFiles({name:'fixture.csv',mimeType:'text/csv',buffer:Buffer.from('Full Name,Email,Phone,City,State\nAlex Morgan,alex@example.test,8565550100,Test Town,NJ\nSam Example,sam@example.test,8565550101,Test Town,NJ')});
  await page.locator('#acx-name-confirm').waitFor();await page.locator('#acx-name-confirm').click();
  await page.locator('#acx-review-next').click();
  const first=page.locator('[data-edit-key="first_name"]').first();await first.fill('Alexandra');await first.press('Tab');
  assert.match(await page.locator('#acx-current-saved').innerText(),/Edits not archived/);
  page.once('dialog',dialog=>dialog.dismiss());
  await page.locator('[data-history-action="open"]').first().click();
  assert.equal(await page.locator('[data-edit-key="first_name"]').first().inputValue(),'Alexandra','Cancel preserves unsaved cleaned edits');
  await page.locator('#acx-export-next').click();
  const downloadPromise=page.waitForEvent('download');await page.locator('#acx-export-generic').click();const download=await downloadPromise;
  const csv=await fs.readFile(await download.path(),'utf8');assert.match(csv,/Alexandra,Morgan/);
  assert.equal(await page.evaluate(()=>companionFixture.rows.agent_contact_files.filter(x=>x.kind==='export').length),1);
  assert.equal(await page.locator('#acx-current-saved').innerText(),'Clean export archived');
  await page.locator('[data-history-action="open"]').first().click();await page.locator('#acx-review-next').click();
  assert.equal(await page.locator('[data-edit-key="first_name"]').first().inputValue(),'Alexandra','Reopened exported copy preserves cleanup');
  assert.deepEqual(errors,[]);
  if(out)await page.screenshot({path:path.join(out,'contacts-review-desktop-FIXTURE.png'),fullPage:true});
  await page.setViewportSize({width:390,height:1000});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Contacts document overflow');
  if(out)await page.screenshot({path:path.join(out,'contacts-review-mobile-FIXTURE.png'),fullPage:true});
  await context.close();
  console.log('Companion browser fixtures passed: Transaction v2 Agent/Premium boundaries, failed-load recovery, keyboard/mobile layout, and Contacts edit/export/reopen.');
}finally{await browser.close()}
