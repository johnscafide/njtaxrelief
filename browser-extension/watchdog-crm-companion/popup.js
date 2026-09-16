const API='https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/watchdog-crm-companion';
const VERSION='0.2.0';
const CONNECT_URL='https://watchdogindex.com/agent/extension/connect/';
const state={token:null,plan:null,contact:null,result:null,pairing:null,selectedFields:new Set(),fieldSearch:'',fieldCategory:'all',fieldSort:'recommended'};
const $=(id)=>document.getElementById(id);
const money=(v)=>Number.isFinite(Number(v))?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(v)):'—';
const plain=(v)=>v===null||v===undefined||v===''?'—':String(v);
const rate=(v)=>{const n=Number(v);if(!Number.isFinite(n))return'—';const pct=Math.abs(n)<1?n*100:n;return `${pct.toFixed(3).replace(/\.?0+$/,'')}%`;};
const acres=(v)=>Number.isFinite(Number(v))?`${Number(v).toLocaleString('en-US',{maximumFractionDigits:3})} ac`:'—';
const score=(v)=>{const n=Number(v);if(!Number.isFinite(n))return'—';return `${Math.round(n<=1?n*100:n)}/100`;};
const planLabel=(p)=>({agent:'Agent',pro:'Pro',pro_plus:'Pro+',teams:'Teams',developer:'Developer'})[p]||'Paid';
const CATEGORY_ORDER=['Watchdog','Tax & assessment','Property','Sale history','Parcel & location','CRM note'];

const FIELD_DEFS=[
  {key:'watchdog_score',label:'Watchdog Score',category:'Watchdog',format:score,recommended:true},
  {key:'assessed_value',label:'Assessment',category:'Tax & assessment',format:money,recommended:true},
  {key:'annual_property_tax',label:'Annual property tax',category:'Tax & assessment',format:money,recommended:true},
  {key:'effective_tax_rate',label:'Effective tax rate',category:'Tax & assessment',format:rate},
  {key:'land_value',label:'Land value',category:'Tax & assessment',format:money},
  {key:'improvement_value',label:'Improvement value',category:'Tax & assessment',format:money},
  {key:'property_class',label:'Property class',category:'Property',format:plain,recommended:true},
  {key:'year_built',label:'Year built',category:'Property',format:plain,recommended:true},
  {key:'dwelling_units',label:'Dwelling units',category:'Property',format:plain},
  {key:'acres',label:'Acreage',category:'Property',format:acres},
  {key:'building_description',label:'Building description',category:'Property',format:plain},
  {key:'last_sale_price',label:'Last sale price',category:'Sale history',format:money,recommended:true},
  {key:'last_sale_year',label:'Last sale year',category:'Sale history',format:plain,recommended:true},
  {key:'block',label:'Block',category:'Parcel & location',format:plain,recommended:true},
  {key:'lot',label:'Lot',category:'Parcel & location',format:plain,recommended:true},
  {key:'qualifier',label:'Qualifier',category:'Parcel & location',format:plain},
  {key:'municipality',label:'Municipality',category:'Parcel & location',format:plain},
  {key:'county',label:'County',category:'Parcel & location',format:plain},
  {key:'zip',label:'ZIP',category:'Parcel & location',format:plain},
  {key:'source_note',label:'Sourced Watchdog note',category:'CRM note',format:()=> 'Selected facts + sources + verification date',recommended:true}
];

function storageGet(keys){return new Promise((resolve)=>chrome.storage.local.get(keys,resolve));}
function storageSet(value){return new Promise((resolve)=>chrome.storage.local.set(value,resolve));}
function storageRemove(keys){return new Promise((resolve)=>chrome.storage.local.remove(keys,resolve));}
function activeTab(){return new Promise((resolve)=>chrome.tabs.query({active:true,currentWindow:true},tabs=>resolve(tabs[0]||null)));}
function send(tabId,message){return new Promise((resolve,reject)=>chrome.tabs.sendMessage(tabId,message,(response)=>{if(chrome.runtime.lastError)reject(new Error(chrome.runtime.lastError.message));else resolve(response);}));}
function browserFamily(){return /Edg\//.test(navigator.userAgent)?'edge':'chrome';}
function show(id,visible=true){const el=$(id);if(el)el.hidden=!visible;}
function status(text,tone){const el=$('wdc-status');if(!el)return;el.textContent=text;el.style.color=tone==='good'?'#15803d':tone==='bad'?'#b91c1c':'#64748b';}
function setError(title,copy,candidates=[]){show('wdc-state',false);show('wdc-match',false);show('wdc-error',true);$('wdc-error-title').textContent=title;$('wdc-error-copy').textContent=copy||'';renderCandidates(candidates,$('wdc-candidates'),'Choose this property');}

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
    if(!result?.ok||!result.contact?.address){await track('boldtrail_contact_missing',{metadata:{adapter:'boldtrail_dom'}});setError('Watchdog could not read the contact address.','The address may be visible in BoldTrail but rendered in a layout this extension does not recognize yet. Nothing was sent to Watchdog.');return;}
    state.contact=result.contact;$('wdc-contact-title').textContent=result.contact.address;$('wdc-contact').querySelector('.wdc-dot').classList.add('live');
    await track('boldtrail_contact_detected',{metadata:{adapter:'boldtrail_dom'}});await lookup(result.contact);
  }catch(_){setError('BoldTrail page is not ready.','Refresh the BoldTrail tab once after installing or reloading the extension, then try again.');}
}
async function lookup(contact){
  show('wdc-state',true);show('wdc-match',false);show('wdc-error',false);
  try{
    const result=await api('lookup',{contact});state.result=result;
    if(result.kind==='match'){renderMatch(result);return;}
    if(result.kind==='ambiguous'){setError('Watchdog found more than one possible property.','Choose the correct property below. Watchdog will use your choice exactly.',result.candidates||[]);return;}
    setError('No confident Watchdog match yet.','The CRM address was read, but Watchdog will not guess. Review the closest public-record candidates below.',result.candidates||[]);
  }catch(error){setError('Watchdog lookup is unavailable.',error.message==='lookup_rate_limited'?'This extension session reached its hourly lookup guard. Try again later.':'The request failed safely. Nothing was written to BoldTrail.');}
}
function candidateContact(item){
  return{candidate_id:item.id,address:item.address,city:item.town,state:'NJ',zip:item.zip};
}
function renderCandidates(items,host,buttonLabel='Use this property'){
  if(!host)return;host.innerHTML='';
  (items||[]).forEach((item,index)=>{
    const b=document.createElement('button');b.className='wdc-candidate';b.type='button';
    const rank=document.createElement('span');rank.className='wdc-candidate-rank';rank.textContent=`#${index+1}`;
    const copy=document.createElement('span');copy.className='wdc-candidate-copy';
    const strong=document.createElement('b');strong.textContent=item.address;
    const sub=document.createElement('span');sub.textContent=[item.town,'NJ',item.zip,item.county?`${item.county} County`:null].filter(Boolean).join(' · ');
    copy.append(strong,sub);
    const action=document.createElement('span');action.className='wdc-candidate-action';action.innerHTML=`<em>${Math.round((item.confidence||0)*100)}%</em><small>${buttonLabel}</small>`;
    b.append(rank,copy,action);b.addEventListener('click',()=>lookup(candidateContact(item)));host.appendChild(b);
  });
}
function renderAlternatives(items){
  const wrap=$('wdc-alternatives-wrap'),host=$('wdc-alternatives'),count=$('wdc-alternatives-count');
  if(!wrap||!host)return;
  const list=items||[];wrap.hidden=!list.length;if(count)count.textContent=list.length?`(${list.length})`:'';
  if(list.length)renderCandidates(list,host,'Use instead');
}
function renderMatch(result){
  show('wdc-state',false);show('wdc-error',false);show('wdc-match',true);const f=result.facts||{};
  $('wdc-address').textContent=f.address||'Matched property';$('wdc-place').textContent=[f.municipality,'NJ',f.zip].filter(Boolean).join(', ');$('wdc-confidence').textContent=`${Math.round((result.confidence||0)*100)}% match`;
  const factRows=[['Watchdog Score',score(f.watchdog_score)],['Assessment',money(f.assessed_value)],['Annual tax',money(f.annual_property_tax)],['Block / Lot',[f.block,f.lot].filter(Boolean).join(' / ')||'—']];
  const facts=$('wdc-facts');facts.innerHTML='';factRows.forEach(([label,value])=>{if(value==='—')return;const d=document.createElement('div');d.className='wdc-fact';const s=document.createElement('small');s.textContent=label;const b=document.createElement('b');b.textContent=value;d.append(s,b);facts.appendChild(d);});
  const sources=$('wdc-source-list');sources.innerHTML='';if(!(result.sources||[]).length){const d=document.createElement('div');d.className='wdc-source';d.textContent=result.source_summary||'Watchdog public-record warehouse';sources.appendChild(d);}else(result.sources||[]).forEach(src=>{const d=document.createElement('div');d.className='wdc-source';const label=src.kind?src.kind.replace(/_/g,' '):'Public record source';if(src.url){const a=document.createElement('a');a.href=src.url;a.target='_blank';a.rel='noreferrer';a.textContent=label;d.appendChild(a);}else d.textContent=label;if(src.recorded_at){const t=document.createElement('span');t.textContent=` · ${new Date(src.recorded_at).toLocaleDateString()}`;d.appendChild(t);}sources.appendChild(d);});
  renderAlternatives(result.alternatives||[]);
  initializeSelection(f);populateCategories(f);renderFields(f);
  track('field_previewed',{fields_count:availableDefs(f).length,match_status:'match'});
}
function availableDefs(f){
  return FIELD_DEFS.filter(def=>def.key==='source_note'||(f[def.key]!==null&&f[def.key]!==undefined&&f[def.key]!==''&&def.format(f[def.key])!=='—'));
}
function initializeSelection(f){
  state.selectedFields=new Set(availableDefs(f).filter(def=>def.recommended).map(def=>def.key));
}
function populateCategories(f){
  const select=$('wdc-field-category');if(!select)return;
  const cats=[...new Set(availableDefs(f).map(d=>d.category))];
  select.innerHTML='<option value="all">All data</option>'+cats.map(c=>`<option value="${c.replace(/"/g,'&quot;')}">${c}</option>`).join('');
  state.fieldCategory='all';select.value='all';
}
function sortedDefs(f){
  let defs=availableDefs(f);
  const search=state.fieldSearch.trim().toLowerCase();
  if(search)defs=defs.filter(def=>`${def.label} ${def.category} ${def.format(f[def.key])}`.toLowerCase().includes(search));
  if(state.fieldCategory!=='all')defs=defs.filter(def=>def.category===state.fieldCategory);
  const catIndex=(c)=>{const i=CATEGORY_ORDER.indexOf(c);return i<0?99:i;};
  defs=[...defs].sort((a,b)=>{
    if(state.fieldSort==='alpha')return a.label.localeCompare(b.label);
    if(state.fieldSort==='category')return catIndex(a.category)-catIndex(b.category)||a.label.localeCompare(b.label);
    return Number(!!b.recommended)-Number(!!a.recommended)||catIndex(a.category)-catIndex(b.category)||a.label.localeCompare(b.label);
  });
  return defs;
}
function renderFields(f){
  const host=$('wdc-fields');if(!host)return;host.innerHTML='';
  const defs=sortedDefs(f);
  defs.forEach(def=>{
    const row=document.createElement('label');row.className='wdc-field';row.dataset.category=def.category;
    const input=document.createElement('input');input.type='checkbox';input.value=def.key;input.checked=state.selectedFields.has(def.key);input.addEventListener('change',()=>{if(input.checked)state.selectedFields.add(def.key);else state.selectedFields.delete(def.key);updateSelectedCount();});
    const span=document.createElement('span');const top=document.createElement('span');top.className='wdc-field-title';const b=document.createElement('b');b.textContent=def.label;const tag=document.createElement('em');tag.textContent=def.category;top.append(b,tag);
    const small=document.createElement('small');small.textContent=def.key==='source_note'?def.format():def.format(f[def.key]);span.append(top,small);row.append(input,span);host.appendChild(row);
  });
  if(!defs.length)host.innerHTML='<div class="wdc-field-empty">No data points match this filter.</div>';
  updateSelectedCount();
}
function updateSelectedCount(){const el=$('wdc-selected-count');if(el)el.textContent=`${state.selectedFields.size} selected`;}
async function applySelected(){
  if(!state.result?.facts)return;const selected=[...state.selectedFields];if(!selected.length)return;
  const tab=await activeTab();if(!tab)return;$('wdc-apply').disabled=true;$('wdc-apply').textContent='Adding to BoldTrail…';await track('crm_write_started',{fields_count:selected.length,metadata:{field_mode:'explicit_selection'}});
  try{
    const res=await send(tab.id,{type:'WATCHDOG_APPLY_AGENT_INTEL',payload:{facts:state.result.facts,sources:state.result.sources||[],source_summary:state.result.source_summary,limitation:state.result.limitation,selected}});
    if(!res?.ok)throw new Error(res?.error||'write_failed');await track('crm_write_succeeded',{fields_count:selected.length,metadata:{field_mode:res.mode||'note'}});$('wdc-apply').textContent=res.skipped?.length?`Added · ${res.skipped.length} existing field${res.skipped.length===1?'':'s'} kept`:'Added to BoldTrail';status('Updated','good');
  }catch(_){await track('crm_write_failed',{fields_count:selected.length,metadata:{reason:'dom_write_failed'}});$('wdc-apply').textContent='Could not write safely';status('Nothing changed','bad');}
  finally{setTimeout(()=>{$('wdc-apply').disabled=false;$('wdc-apply').textContent='Add selected data to BoldTrail';},2200);}
}
async function disconnect(){try{await api('session.disconnect');}catch(_){}await storageRemove(['wdc_token','wdc_plan','wdc_expires_at','wdc_pairing']);state.token=null;state.plan=null;state.pairing=null;show('wdc-app',false);show('wdc-disconnect',false);show('wdc-connect',true);$('wdc-connect-btn').hidden=false;show('wdc-check-btn',false);status('Not connected');$('wdc-plan').textContent='Watchdog';}

$('wdc-connect-btn').addEventListener('click',beginConnect);
$('wdc-check-btn').addEventListener('click',claimPairing);
$('wdc-retry').addEventListener('click',scanContact);
$('wdc-apply').addEventListener('click',applySelected);
$('wdc-disconnect').addEventListener('click',disconnect);
$('wdc-all').addEventListener('click',()=>{availableDefs(state.result?.facts||{}).forEach(d=>state.selectedFields.add(d.key));renderFields(state.result?.facts||{});});
$('wdc-none').addEventListener('click',()=>{state.selectedFields.clear();renderFields(state.result?.facts||{});});
$('wdc-field-search').addEventListener('input',e=>{state.fieldSearch=e.target.value;renderFields(state.result?.facts||{});});
$('wdc-field-category').addEventListener('change',e=>{state.fieldCategory=e.target.value;renderFields(state.result?.facts||{});});
$('wdc-field-sort').addEventListener('change',e=>{state.fieldSort=e.target.value;renderFields(state.result?.facts||{});});
initSession().catch(()=>{show('wdc-connect',true);status('Reconnect Watchdog','bad');});
