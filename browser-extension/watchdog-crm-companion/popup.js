const API='https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/watchdog-crm-companion';
const VERSION='0.1.0';
const CONNECT_URL='https://watchdogindex.com/agent/extension/connect/';
const state={token:null,plan:null,contact:null,result:null,pairing:null};
const $=(id)=>document.getElementById(id);
const money=(v)=>Number.isFinite(Number(v))?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(v)):'—';
const plain=(v)=>v===null||v===undefined||v===''?'—':String(v);
const planLabel=(p)=>({agent:'Agent',pro:'Pro',pro_plus:'Pro+',teams:'Teams',developer:'Developer'})[p]||'Paid';

function storageGet(keys){return new Promise((resolve)=>chrome.storage.local.get(keys,resolve));}
function storageSet(value){return new Promise((resolve)=>chrome.storage.local.set(value,resolve));}
function storageRemove(keys){return new Promise((resolve)=>chrome.storage.local.remove(keys,resolve));}
function activeTab(){return new Promise((resolve)=>chrome.tabs.query({active:true,currentWindow:true},tabs=>resolve(tabs[0]||null)));}
function send(tabId,message){return new Promise((resolve,reject)=>chrome.tabs.sendMessage(tabId,message,(response)=>{if(chrome.runtime.lastError)reject(new Error(chrome.runtime.lastError.message));else resolve(response);}));}
function browserFamily(){return /Edg\//.test(navigator.userAgent)?'edge':'chrome';}
function show(id,visible=true){$(id).hidden=!visible;}
function status(text,tone){const el=$('wdc-status');el.textContent=text;el.style.color=tone==='good'?'#15803d':tone==='bad'?'#b91c1c':'#64748b';}
function setError(title,copy,candidates=[]){show('wdc-state',false);show('wdc-match',false);show('wdc-error',true);$('wdc-error-title').textContent=title;$('wdc-error-copy').textContent=copy||'';renderCandidates(candidates);}

async function api(action,payload={},withToken=true){
  const headers={'Content-Type':'application/json','X-Watchdog-Extension-Version':VERSION};
  if(withToken&&state.token)headers['X-Watchdog-Extension-Token']=state.token;
  const res=await fetch(API,{method:'POST',headers,body:JSON.stringify({action,extension_version:VERSION,...payload})});
  let data={};try{data=await res.json();}catch(_){data={error:'invalid_response'};}
  if(!res.ok){const err=new Error(data.error||`http_${res.status}`);err.status=res.status;err.data=data;throw err;}
  return data;
}
async function track(eventName,extra={}){try{await api('track',{event_name:eventName,...extra});}catch(_){} }

function randomSecret(){const bytes=crypto.getRandomValues(new Uint8Array(32));let s='';bytes.forEach(b=>s+=String.fromCharCode(b));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');}
async function sha256(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');}

async function beginConnect(){
  const device_id=crypto.randomUUID(),device_secret=randomSecret(),challenge=await sha256(device_secret);
  state.pairing={device_id,device_secret,created_at:Date.now()};
  await storageSet({wdc_pairing:state.pairing});
  const url=new URL(CONNECT_URL);url.searchParams.set('device_id',device_id);url.searchParams.set('challenge',challenge);url.searchParams.set('version',VERSION);
  chrome.tabs.create({url:url.toString()});
  $('wdc-connect-btn').hidden=true;show('wdc-check-btn',true);$('wdc-connect-help').textContent='Finish signing in on Watchdog, approve this browser, then return here.';
  status('Waiting for Watchdog');
}
async function claimPairing(){
  if(!state.pairing){const saved=await storageGet(['wdc_pairing']);state.pairing=saved.wdc_pairing||null;}
  if(!state.pairing)return beginConnect();
  $('wdc-check-btn').disabled=true;$('wdc-check-btn').textContent='Checking…';
  try{
    const data=await api('pair.claim',{device_id:state.pairing.device_id,device_secret:state.pairing.device_secret,browser:browserFamily()},false);
    state.token=data.token;state.plan=data.plan;
    await storageSet({wdc_token:data.token,wdc_plan:data.plan,wdc_expires_at:data.expires_at});await storageRemove(['wdc_pairing']);state.pairing=null;
    await enterApp();
  }catch(error){
    if(error.message==='pairing_not_ready'){$('wdc-connect-help').textContent='Not approved yet. Finish the Watchdog sign-in tab, then check again.';status('Waiting for approval');}
    else if(error.message==='paid_plan_required'){$('wdc-connect-help').textContent='CRM Companion requires an active paid Watchdog plan starting with Agent.';status('Paid plan required','bad');}
    else{$('wdc-connect-help').textContent='That connection request expired or could not be verified. Start a new connection.';state.pairing=null;await storageRemove(['wdc_pairing']);$('wdc-connect-btn').hidden=false;show('wdc-check-btn',false);status('Not connected','bad');}
  }finally{$('wdc-check-btn').disabled=false;$('wdc-check-btn').textContent='Check connection';}
}
async function initSession(){
  const saved=await storageGet(['wdc_token','wdc_plan','wdc_pairing']);state.token=saved.wdc_token||null;state.plan=saved.wdc_plan||null;state.pairing=saved.wdc_pairing||null;
  if(!state.token){show('wdc-connect',true);show('wdc-app',false);status('Not connected');if(state.pairing){$('wdc-connect-btn').hidden=true;show('wdc-check-btn',true);$('wdc-connect-help').textContent='A Watchdog connection is waiting for approval.';}return;}
  try{const data=await api('session.status');state.plan=data.plan;await storageSet({wdc_plan:data.plan});await enterApp();}
  catch(error){await storageRemove(['wdc_token','wdc_plan','wdc_expires_at']);state.token=null;show('wdc-connect',true);show('wdc-app',false);status(error.message==='paid_plan_required'?'Paid plan required':'Reconnect Watchdog','bad');}
}
async function enterApp(){
  show('wdc-connect',false);show('wdc-app',true);show('wdc-disconnect',true);$('wdc-plan').textContent=`Watchdog ${planLabel(state.plan)}`;status('Connected','good');
  await track('extension_opened',{metadata:{browser:browserFamily()}});await scanContact();
}

async function scanContact(){
  show('wdc-state',true);show('wdc-match',false);show('wdc-error',false);$('wdc-contact-title').textContent='Looking for an address…';$('wdc-contact').querySelector('.wdc-dot').classList.remove('live');
  const tab=await activeTab();
  if(!tab||!/^https:\/\/app\.boldtrail\.com\//i.test(tab.url||'')){await track('boldtrail_contact_missing',{metadata:{reason:'wrong_tab'}});setError('Open a BoldTrail contact first.','CRM Companion only reads the BoldTrail tab you have open.');return;}
  try{
    const result=await send(tab.id,{type:'WATCHDOG_SCAN_CONTACT'});
    if(!result?.ok||!result.contact?.address){await track('boldtrail_contact_missing',{metadata:{adapter:'boldtrail_dom'}});setError('No contact property address found.','Open the contact details or edit panel so the property address is visible, then scan again.');return;}
    state.contact=result.contact;$('wdc-contact-title').textContent=result.contact.address;$('wdc-contact').querySelector('.wdc-dot').classList.add('live');
    await track('boldtrail_contact_detected',{metadata:{adapter:'boldtrail_dom'}});await lookup(result.contact);
  }catch(_){setError('BoldTrail page is not ready.','Refresh the BoldTrail tab once after installing the extension, then try again.');}
}
async function lookup(contact){
  show('wdc-state',true);show('wdc-match',false);show('wdc-error',false);
  try{
    const result=await api('lookup',{contact});state.result=result;
    if(result.kind==='match'){renderMatch(result);return;}
    if(result.kind==='ambiguous'){setError('Watchdog found more than one possible property.','Choose the correct address below.',result.candidates||[]);return;}
    setError('No confident Watchdog match yet.','The CRM address was not strong enough to attach public-record facts safely.',result.candidates||[]);
  }catch(error){setError('Watchdog lookup is unavailable.',error.message==='lookup_rate_limited'?'This extension session reached its hourly lookup guard. Try again later.':'The request failed safely. Nothing was written to BoldTrail.');}
}
function renderCandidates(items){const host=$('wdc-candidates');host.innerHTML='';(items||[]).forEach(item=>{const b=document.createElement('button');b.className='wdc-candidate';b.type='button';const strong=document.createElement('b');strong.textContent=item.address;const sub=document.createElement('span');sub.textContent=[item.town,'NJ',item.zip].filter(Boolean).join(', ');b.append(strong,sub);b.addEventListener('click',()=>lookup({address:item.address,city:item.town,state:'NJ',zip:item.zip}));host.appendChild(b);});}
function renderMatch(result){
  show('wdc-state',false);show('wdc-error',false);show('wdc-match',true);const f=result.facts||{};
  $('wdc-address').textContent=f.address||'Matched property';$('wdc-place').textContent=[f.municipality,'NJ',f.zip].filter(Boolean).join(', ');$('wdc-confidence').textContent=`${Math.round((result.confidence||0)*100)}% match`;
  const factRows=[['Assessment',money(f.assessed_value)],['Annual tax',money(f.annual_property_tax)],['Block / Lot',[f.block,f.lot].filter(Boolean).join(' / ')||'—'],['Last sale',f.last_sale_price?`${money(f.last_sale_price)}${f.last_sale_year?` · ${f.last_sale_year}`:''}`:'—']];
  const facts=$('wdc-facts');facts.innerHTML='';factRows.forEach(([label,value])=>{const d=document.createElement('div');d.className='wdc-fact';const s=document.createElement('small');s.textContent=label;const b=document.createElement('b');b.textContent=value;d.append(s,b);facts.appendChild(d);});
  const sources=$('wdc-source-list');sources.innerHTML='';if(!(result.sources||[]).length){const d=document.createElement('div');d.className='wdc-source';d.textContent=result.source_summary||'Watchdog public-record warehouse';sources.appendChild(d);}else(result.sources||[]).forEach(src=>{const d=document.createElement('div');d.className='wdc-source';const label=src.kind?src.kind.replace(/_/g,' '):'Public record source';if(src.url){const a=document.createElement('a');a.href=src.url;a.target='_blank';a.rel='noreferrer';a.textContent=label;d.appendChild(a);}else d.textContent=label;if(src.recorded_at){const t=document.createElement('span');t.textContent=` · ${new Date(src.recorded_at).toLocaleDateString()}`;d.appendChild(t);}sources.appendChild(d);});
  renderFields(f);track('field_previewed',{fields_count:document.querySelectorAll('.wdc-field input').length,match_status:'match'});
}
function renderFields(f){
  const defs=[['assessed_value','Assessment',money(f.assessed_value)],['annual_property_tax','Annual property tax',money(f.annual_property_tax)],['block','Block',plain(f.block)],['lot','Lot',plain(f.lot)],['property_class','Property class',plain(f.property_class)],['year_built','Year built',plain(f.year_built)],['last_sale_price','Last sale price',money(f.last_sale_price)],['last_sale_year','Last sale year',plain(f.last_sale_year)],['source_note','Sourced Watchdog note','Sources, verification date and research limitation']];
  const host=$('wdc-fields');host.innerHTML='';defs.filter(([key,_label,value])=>key==='source_note'||value!=='—').forEach(([key,label,value])=>{const row=document.createElement('label');row.className='wdc-field';const input=document.createElement('input');input.type='checkbox';input.value=key;input.checked=true;const span=document.createElement('span');const b=document.createElement('b');b.textContent=label;const small=document.createElement('small');small.textContent=value;span.append(b,small);row.append(input,span);host.appendChild(row);});
}
async function applySelected(){
  if(!state.result?.facts)return;const selected=Array.from(document.querySelectorAll('.wdc-field input:checked')).map(el=>el.value);if(!selected.length)return;
  const tab=await activeTab();if(!tab)return;$('wdc-apply').disabled=true;$('wdc-apply').textContent='Adding to BoldTrail…';await track('crm_write_started',{fields_count:selected.length,metadata:{field_mode:'explicit_selection'}});
  try{
    const res=await send(tab.id,{type:'WATCHDOG_APPLY_PROPERTY',payload:{facts:state.result.facts,sources:state.result.sources||[],source_summary:state.result.source_summary,limitation:state.result.limitation,selected}});
    if(!res?.ok)throw new Error(res?.error||'write_failed');await track('crm_write_succeeded',{fields_count:selected.length,metadata:{field_mode:res.mode||'note'}});$('wdc-apply').textContent=res.skipped?.length?`Added · ${res.skipped.length} existing field${res.skipped.length===1?'':'s'} kept`:'Added to BoldTrail';status('Updated','good');
  }catch(_){await track('crm_write_failed',{fields_count:selected.length,metadata:{reason:'dom_write_failed'}});$('wdc-apply').textContent='Could not write safely';status('Nothing changed','bad');}
  finally{setTimeout(()=>{$('wdc-apply').disabled=false;if($('wdc-apply').textContent!=='Add selected data to BoldTrail')$('wdc-apply').textContent='Add selected data to BoldTrail';},2200);}
}
async function disconnect(){try{await api('session.disconnect');}catch(_){}await storageRemove(['wdc_token','wdc_plan','wdc_expires_at','wdc_pairing']);state.token=null;state.plan=null;state.pairing=null;show('wdc-app',false);show('wdc-disconnect',false);show('wdc-connect',true);$('wdc-connect-btn').hidden=false;show('wdc-check-btn',false);status('Not connected');$('wdc-plan').textContent='Watchdog';}

$('wdc-connect-btn').addEventListener('click',beginConnect);$('wdc-check-btn').addEventListener('click',claimPairing);$('wdc-retry').addEventListener('click',scanContact);$('wdc-apply').addEventListener('click',applySelected);$('wdc-disconnect').addEventListener('click',disconnect);$('wdc-all').addEventListener('click',()=>document.querySelectorAll('.wdc-field input').forEach(el=>el.checked=true));
initSession().catch(()=>{show('wdc-connect',true);status('Reconnect Watchdog','bad');});
