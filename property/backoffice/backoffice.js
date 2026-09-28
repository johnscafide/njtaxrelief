/* Watchdog Backoffice — Lead Intelligence.
   One auth flow: the signed-in Watchdog account (access-guard's client) is
   exchanged for a 12-hour Backoffice session through the same-origin gateway,
   and every lead call sends that session token. Nothing here reloads the page.
   Static markup and copy live in index.html; this file fills in data. */
(function(){
'use strict';

const LOGIN_API='/api/watchdog-backoffice-gateway?target=login';
const API='/api/watchdog-backoffice-gateway?target=api';
const SESSION_KEY='watchdog-backoffice-session';
const LOCK_KEY='watchdog-backoffice-locked';
const SIGN_IN_URL='/dashboard?access=signin&return=%2Fbackoffice';
const OPEN_STAGES=['new','contacted','qualified','nurture'];
const BULK_SYNC_BATCH=50;
const MOBILE=window.matchMedia('(max-width: 899.98px)');

const state={
  token:'',appOpen:false,opening:false,
  actor:'',actorLabel:'',expiresAt:'',operators:[],integrations:{},
  leads:[],followupsAvailable:true,dupes:new Map(),
  selectedId:null,detail:null,events:[],detailSeq:0,
  selected:new Set(),
  filters:{owner:'mine',stage:'open',followup:'any',source:'all',sort:'newest',attention:false,search:''},
  sourceRange:'30'
};

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));

/* ---------- small helpers ---------- */
function store(method,key,value){
  try{
    if(method==='get')return sessionStorage.getItem(key)||'';
    if(method==='set')sessionStorage.setItem(key,value);
    if(method==='remove')sessionStorage.removeItem(key);
  }catch(_){/* storage blocked: the session just isn't remembered across reloads */}
  return '';
}
function text(v,fallback='—'){return v===null||v===undefined||String(v).trim()===''?fallback:String(v).trim()}
function num(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function digits(v){return String(v||'').replace(/\D/g,'')}
function slug(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
function humanize(v){const s=String(v||'').replace(/[._-]+/g,' ').replace(/\s+/g,' ').trim();return s?s.charAt(0).toUpperCase()+s.slice(1):''}
function pad(n){return String(n).padStart(2,'0')}
function todayIso(){const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function tenDigits(v){const d=digits(v);return d.length===11&&d.startsWith('1')?d.slice(1):d}
function fmtPhone(v){const d=tenDigits(v);return d.length===10?'('+d.slice(0,3)+') '+d.slice(3,6)+'-'+d.slice(6):text(v,'')}
function dialable(v){const d=tenDigits(v);return d.length===10?'+1'+d:digits(v)}
function money(v){const n=num(v);return n===null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n)}
function when(v){if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})}
function clock(v){if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}
function ago(v){if(!v)return '';const t=new Date(v).getTime();if(Number.isNaN(t))return '';const m=Math.max(0,Math.floor((Date.now()-t)/60000));if(m<1)return 'now';if(m<60)return m+'m';const h=Math.floor(m/60);if(h<24)return h+'h';const days=Math.floor(h/24);return days<7?days+'d':new Date(v).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
function dueDate(iso){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||'')))return '';const [y,m,d]=iso.split('-').map(Number),dt=new Date(y,m-1,d);return dt.toLocaleDateString('en-US',dt.getFullYear()===new Date().getFullYear()?{weekday:'short',month:'short',day:'numeric'}:{month:'short',day:'numeric',year:'numeric'})}
function plural(n,one,many){return n.toLocaleString()+' '+(n===1?one:(many||one+'s'))}
function possessive(name){return name+'’s'}
function setText(el,value){if(el)el.textContent=value}
function show(el,visible){if(el)el.hidden=!visible}

/* ---------- labels (names come from the API, never hard-coded) ---------- */
function ownerLabel(key){
  if(!key||key==='unassigned')return 'Unassigned';
  const op=state.operators.find((o)=>o.key===key);
  return op?op.label:'Teammate';
}
function stageLabel(key){const opt=$('#bo-stage-select option[value="'+key+'"]');return opt?opt.textContent:humanize(key)}
const SOURCE_NAMES={'anchor-estimator':'ANCHOR estimator','manual':'Added by hand','manual-backoffice':'Added by hand','leadiq csv':'LeadIQ import'};
const REFERRAL_NAMES={google:'Google search',friend_family:'Friend or family',ai_assistant:'AI assistant',social:'Social media',social_media:'Social media',facebook:'Facebook',instagram:'Instagram',nextdoor:'Nextdoor',news:'News story',mailer:'Mailer',postcard:'Postcard',realtor:'Real-estate agent',other:'Other'};
function sourceLabel(v){const k=String(v||'').trim();return SOURCE_NAMES[k.toLowerCase()]||humanize(k)||'Unknown'}
function referralLabel(v){const k=String(v||'').trim();return k?(REFERRAL_NAMES[k.toLowerCase()]||humanize(k)):'Not given'}

/* ---------- lead rules ---------- */
function isOpenStage(l){return OPEN_STAGES.includes(l.lead_status||'new')}
// Needs attention = processing_status review/error. "Mark reviewed" sets it to
// ready, and address re-checks on a reviewed lead leave it alone (server rule).
function needsAttention(l){return ['review','error'].includes(l.processing_status)}
function attentionReasons(l){
  const r=[];
  if(l.address_status==='review')r.push('Google couldn’t fully confirm the address.');
  if(l.address_status==='error')r.push('The Google address check failed or found no match.');
  if(['review','error','no_match'].includes(l.identity_status))r.push('The identity check needs a look.');
  if(l.processing_status==='error')r.push('Intake reported an error for this lead.');
  if(!r.length)r.push('Flagged for review when it came in.');
  return r;
}
function isSynced(l){return l.crm_status==='synced'||!!l.crm_synced_at}
function dueState(l){const due=l.next_action_due;if(!due)return '';const t=todayIso();return due<t?'overdue':due===t?'today':'upcoming'}
function consentOf(l){const c=l&&l.consent_data&&typeof l.consent_data==='object'&&!Array.isArray(l.consent_data)?l.consent_data:{};const email=c.marketing_consent===true||c.email_marketing_consent===true,sms=c.sms_consent===true;return {email,sms,any:email||sms}}
// Mirrors the server's bucketed BoldTrail hashtags.
function crmHashtags(l){
  const out=new Set();
  for(const t of Array.isArray(l.tags)?l.tags:[]){const c=slug(String(t).replace(/^#/,''));if(c&&!/^(?:intent-\d+|benefit-\d+|intent-engaged)$/.test(c))out.add(c)}
  const i=num(l.intent_score);if(i!==null)out.add(i>=70?'intent-high':i>=40?'intent-medium':'intent-low');
  const b=num(l.estimated_benefit);if(b!==null&&b>0)out.add(b>=1000?'benefit-1k-plus':b>=500?'benefit-500-plus':'benefit-under-500');
  return Array.from(out);
}
function computeDupes(){
  const byKey=new Map(),keysOf=new Map();
  for(const l of state.leads){
    const keys=[],email=String(l.email||'').trim().toLowerCase(),phone=tenDigits(l.phone);
    if(email)keys.push('email:'+email);
    if(phone.length===10)keys.push('phone:'+phone);
    keysOf.set(l.id,keys);
    for(const k of keys){if(!byKey.has(k))byKey.set(k,[]);byKey.get(k).push(l.id)}
  }
  state.dupes=new Map();
  for(const l of state.leads){
    const others=new Map();
    for(const k of keysOf.get(l.id)){const kind=k.split(':')[0];for(const id of byKey.get(k))if(id!==l.id)others.set(id,others.has(id)&&others.get(id)!==kind?'email and phone':kind)}
    if(others.size)state.dupes.set(l.id,others);
  }
}

/* ---------- toast ---------- */
function toast(message){
  const el=$('#bo-toast');if(!el)return;
  el.textContent=message;el.hidden=false;
  requestAnimationFrame(()=>el.classList.add('is-shown'));
  clearTimeout(toast.t);
  toast.t=setTimeout(()=>{el.classList.remove('is-shown');toast.h=setTimeout(()=>{el.hidden=true},250)},3600);
  clearTimeout(toast.h);
}

/* ---------- API ---------- */
async function api(action,payload={},options={}){
  if(!state.token)throw Object.assign(new Error('Backoffice is locked.'),{status:401});
  let res;
  try{res=await fetch(API,{method:'POST',cache:'no-store',keepalive:!!options.keepalive,headers:{'Content-Type':'application/json','Authorization':'Bearer '+state.token},body:JSON.stringify(Object.assign({action},payload))})}
  catch(_){throw new Error('Backoffice couldn’t be reached. Check your connection and try again.')}
  let data={};try{data=await res.json()}catch(_){data={}}
  if(res.status===401){if(state.appOpen)endSession('expired');else clearToken();throw Object.assign(new Error(data.error||'Backoffice session ended.'),{status:401})}
  if(!res.ok)throw Object.assign(new Error(data.error||'Request failed.'),{status:res.status,code:data.code,data});
  return data;
}
function report(ex){if(ex&&ex.status!==401)toast(ex.message||'Something went wrong.')}

/* ---------- auth: one flow ---------- */
function setToken(token){state.token=token;store('set',SESSION_KEY,token)}
function clearToken(){state.token='';store('remove',SESSION_KEY)}

async function watchdogAccessToken(){
  try{
    if(window.njptrAccessReady){try{await Promise.resolve(window.njptrAccessReady)}catch(_){/* no page gate on Backoffice */}}
    if(!window.NJPTRAccess||typeof window.NJPTRAccess.client!=='function')return '';
    const result=await window.NJPTRAccess.client().auth.getSession();
    return result&&result.data&&result.data.session&&result.data.session.access_token||'';
  }catch(_){return ''}
}

function showGate(name,message){
  state.appOpen=false;
  show($('#bo-app'),false);show($('#bo-gate'),true);
  show($('#bo-bulk'),false);document.body.classList.remove('has-bulk');
  const t=$('#bo-toast');if(t){clearTimeout(toast.t);t.classList.remove('is-shown');t.hidden=true}
  $$('[data-bo-private]').forEach((el)=>{el.hidden=true});
  $$('[data-gate]').forEach((card)=>{card.hidden=card.dataset.gate!==name});
  if(name==='locked'){const expired=message==='expired';show($('[data-gate-copy="locked"]'),!expired);show($('[data-gate-copy="expired"]'),expired)}
  if(name==='error')setText($('[data-gate-error]'),message||'The Backoffice service didn’t respond.');
  closeSheet(true);
}
function showApp(){
  state.appOpen=true;
  show($('#bo-gate'),false);show($('#bo-app'),true);
  $$('[data-bo-private]').forEach((el)=>{el.hidden=false});
}

// Exchange the Watchdog sign-in for a Backoffice session. 401 = not signed in,
// 403 = signed in but not on the Backoffice access list.
async function openSession(){
  if(state.opening)return;
  state.opening=true;
  showGate('checking');
  try{
    const accessToken=await watchdogAccessToken();
    if(!accessToken){showGate('signed-out');return}
    const res=await fetch(LOGIN_API,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','Authorization':'Bearer '+accessToken},body:'{}'});
    let data={};try{data=await res.json()}catch(_){data={}}
    if(res.status===401){showGate('signed-out');return}
    if(res.status===403){showGate('denied');return}
    if(!res.ok||!data.token)throw new Error(data.error||'Backoffice couldn’t open.');
    store('remove',LOCK_KEY);
    setToken(data.token);
    await enterApp();
  }catch(ex){showGate('error',ex&&ex.message)}
  finally{state.opening=false}
}

async function enterApp(){
  const session=await api('session');
  applySession(session);
  showApp();
  await loadLeads(true);
  if(location.hash==='#leadiq'){const el=$('#leadiq');if(el)el.scrollIntoView({block:'start'})}
}

function applySession(s){
  state.actor=s.actor||'';
  state.expiresAt=s.expires_at||'';
  state.integrations=s.integrations||{};
  const ops=Array.isArray(s.operators)&&s.operators.length?s.operators:((state.integrations.profiles||[]).map((p)=>({key:p.profile_key,label:p.label})));
  state.operators=ops.filter((o)=>o&&o.key).map((o)=>({key:String(o.key),label:String(o.label||'Teammate')}));
  state.actorLabel=s.actor_label||ownerLabel(state.actor);
  setText($('[data-bo-who]'),state.actorLabel+(state.expiresAt?' · until '+clock(state.expiresAt):''));
  fillOperatorSelects();
  renderSettings();
}

// Lock = revoke the session on the server and leave the locked card. No reload.
async function lock(){
  const token=state.token;
  store('set',LOCK_KEY,'1');
  clearToken();resetData();showGate('locked');
  if(!token)return;
  try{
    const res=await fetch(API,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({action:'logout'})});
    if(!res.ok&&res.status!==401)throw new Error('logout failed');
  }catch(_){toast('Locked on this device. The server session will also expire on its own.')}
}
function endSession(kind){clearToken();resetData();showGate('locked',kind)}
function resetData(){state.leads=[];state.detail=null;state.events=[];state.selectedId=null;state.selected.clear();const list=$('#bo-list');if(list)list.replaceChildren()}

async function switchAccount(){
  try{if(window.NJPTRAccess&&typeof window.NJPTRAccess.client==='function')await window.NJPTRAccess.client().auth.signOut()}catch(_){/* continue to sign-in either way */}
  location.assign(SIGN_IN_URL);
}

/* ---------- operators ---------- */
function operatorOption(o){const opt=document.createElement('option');opt.value=o.key;opt.textContent=o.label;return opt}
function fillOperatorSelects(){
  const owner=$('#bo-owner'),anchor=owner&&owner.querySelector('[data-owner-anchor]');
  if(owner){$$('option[data-operator]',owner).forEach((o)=>o.remove());state.operators.forEach((o)=>{const opt=operatorOption(o);opt.dataset.operator='1';owner.insertBefore(opt,anchor)});owner.value=state.filters.owner}
  for(const sel of [$('#bo-owner-select'),$('#bo-add-owner'),$('#bo-bulk-owner')]){
    if(!sel)continue;
    $$('option[data-operator]',sel).forEach((o)=>o.remove());
    state.operators.forEach((o)=>{const opt=operatorOption(o);opt.dataset.operator='1';sel.appendChild(opt)});
  }
  const add=$('#bo-add-owner');if(add&&state.actor)add.value=state.actor;
  const bulk=$('#bo-bulk-owner');if(bulk&&state.actor)bulk.value=state.actor;
  $$('[data-scope-label]').forEach((el)=>setText(el,scopeLabel()));
}
function scopeLabel(){const o=state.filters.owner;if(o==='mine')return 'your leads';if(o==='all')return 'everyone';if(o==='unassigned')return 'unassigned leads';return possessive(ownerLabel(o))+' leads'}

/* ---------- filtering ---------- */
function ownerMatch(l){const o=state.filters.owner,owner=l.crm_owner||'unassigned';if(o==='all')return true;if(o==='mine')return owner===state.actor;return owner===o}
function searchMatch(l){
  const q=state.filters.search;if(!q)return true;
  const hay=[l.full_name,l.email,l.phone,fmtPhone(l.phone),l.submitted_address,l.standardized_address,l.source,sourceLabel(l.source),l.referral_source,l.referral_source_detail,l.program,l.notes,l.next_action].join(' ').toLowerCase();
  if(hay.includes(q))return true;
  const qd=digits(q);return qd.length>=3&&digits(l.phone).includes(qd);
}
function stageMatch(l,stage){const s=l.lead_status||'new';return stage==='open'?OPEN_STAGES.includes(s):s===stage}
function followupMatch(l){const f=state.filters.followup;if(f==='any')return true;if(f==='none')return !l.next_action&&!l.next_action_due;return dueState(l)===f}
function sourceMatch(l){const v=state.filters.source;if(v==='all')return true;if(v.startsWith('src:'))return String(l.source||'')===v.slice(4);if(v.startsWith('ref:'))return String(l.referral_source||'')===v.slice(4);return true}
function baseMatch(l){return ownerMatch(l)&&searchMatch(l)&&followupMatch(l)&&sourceMatch(l)&&(!state.filters.attention||needsAttention(l))}
function byNewest(a,b){return String(b.created_at||'').localeCompare(String(a.created_at||''))}
function sortLeads(rows){
  const s=state.filters.sort;
  if(s==='oldest')return rows.sort((a,b)=>byNewest(b,a));
  if(s==='intent')return rows.sort((a,b)=>((num(b.intent_score)??-1)-(num(a.intent_score)??-1))||byNewest(a,b));
  if(s==='due')return rows.sort((a,b)=>String(a.next_action_due||'9999-12-31').localeCompare(String(b.next_action_due||'9999-12-31'))||byNewest(a,b));
  return rows.sort(byNewest);
}
function visibleLeads(){return sortLeads(state.leads.filter((l)=>baseMatch(l)&&stageMatch(l,state.filters.stage)))}

/* ---------- rendering ---------- */
function pill(label,tone){const el=document.createElement('span');el.className='bo-pill'+(tone?' is-'+tone:'');el.textContent=label;return el}
function crmPill(l){
  if(l.crm_status==='error')return pill('BoldTrail send failed','bad');
  if(isSynced(l))return pill('In BoldTrail','good');
  if(l.last_exported_at)return pill('CSV exported','good');
  return null;
}
function duePill(l){const d=dueState(l);if(!d||!isOpenStage(l))return null;if(d==='overdue')return pill('Overdue · '+dueDate(l.next_action_due),'bad');if(d==='today')return pill('Due today','warn');return pill('Due '+dueDate(l.next_action_due),'')}
function rowPills(l){
  const out=[];
  if(state.filters.stage==='open')out.push(pill(stageLabel(l.lead_status||'new'),'stage'));
  if(state.filters.owner==='all')out.push(pill(ownerLabel(l.crm_owner),'owner'));
  const due=duePill(l);if(due)out.push(due);
  if(needsAttention(l))out.push(pill('Needs attention','bad'));
  if(state.dupes.has(l.id))out.push(pill('Possible duplicate','warn'));
  const crm=crmPill(l);if(crm)out.push(crm);
  const i=num(l.intent_score);if(i!==null&&i>=40)out.push(pill('Intent '+i,'intent'));
  return out;
}

function renderAll(){renderTiles();renderStages();renderList();renderSources();renderHandoff()}

function renderTiles(){
  const scoped=state.leads.filter((l)=>ownerMatch(l)&&isOpenStage(l));
  const counts={new:scoped.filter((l)=>(l.lead_status||'new')==='new').length,today:scoped.filter((l)=>dueState(l)==='today').length,overdue:scoped.filter((l)=>dueState(l)==='overdue').length,attention:scoped.filter(needsAttention).length};
  Object.keys(counts).forEach((k)=>setText($('[data-stat="'+k+'"]'),counts[k].toLocaleString()));
  const f=state.filters;
  const active={new:f.stage==='new'&&f.followup==='any'&&!f.attention,today:f.stage==='open'&&f.followup==='today'&&!f.attention,overdue:f.stage==='open'&&f.followup==='overdue'&&!f.attention,attention:f.stage==='open'&&f.followup==='any'&&f.attention};
  $$('[data-focus]').forEach((b)=>b.setAttribute('aria-pressed',active[b.dataset.focus]?'true':'false'));
  $$('[data-scope-label]').forEach((el)=>setText(el,scopeLabel()));
}

function renderStages(){
  const base=state.leads.filter(baseMatch);
  $$('[data-stage]').forEach((b)=>{
    const stage=b.dataset.stage;
    setText($('[data-stage-count="'+stage+'"]',b),base.filter((l)=>stageMatch(l,stage)).length.toLocaleString());
    b.setAttribute('aria-pressed',stage===state.filters.stage?'true':'false');
  });
}

function renderList(){
  const host=$('#bo-list'),rows=visibleLeads(),tpl=$('#tpl-lead-row');
  const visibleIds=new Set(rows.map((l)=>l.id));
  for(const id of Array.from(state.selected))if(!visibleIds.has(id))state.selected.delete(id);
  setText($('#bo-queue-count'),plural(rows.length,'lead'));
  show($('#bo-list-loading'),false);show($('#bo-list-error'),false);
  show($('#bo-list-empty'),!rows.length);
  const frag=document.createDocumentFragment();
  for(const l of rows){
    const li=tpl.content.firstElementChild.cloneNode(true),name=text(l.full_name,'Unnamed lead');
    li.dataset.leadId=l.id;
    if(l.id===state.selectedId)li.classList.add('is-active');
    const check=$('[data-row-check]',li);check.checked=state.selected.has(l.id);check.dataset.leadId=l.id;
    setText($('[data-row-check-label]',li),'Select '+name);
    const open=$('[data-row-open]',li);open.dataset.leadId=l.id;
    if(l.id===state.selectedId)open.setAttribute('aria-current','true');
    setText($('[data-r="name"]',li),name);
    const time=$('[data-r="time"]',li);setText(time,ago(l.created_at));if(l.created_at){time.dateTime=l.created_at;time.title=when(l.created_at)}
    const contact=[fmtPhone(l.phone),l.email].filter(Boolean).join(' · ');
    setText($('[data-r="meta"]',li),text(l.standardized_address||l.submitted_address,contact||'No contact details'));
    if(l.next_action){const next=$('[data-r="next"]',li);next.hidden=false;next.textContent='Next: '+l.next_action}
    $('[data-r="pills"]',li).append(...rowPills(l));
    frag.appendChild(li);
  }
  host.replaceChildren(frag);
  renderSelectAll(rows);
  renderBulk();
}

function renderSelectAll(rows){
  const box=$('#bo-select-all');if(!box)return;
  const n=rows.filter((l)=>state.selected.has(l.id)).length;
  box.checked=rows.length>0&&n===rows.length;box.indeterminate=n>0&&n<rows.length;box.disabled=!rows.length;
}

function renderBulk(){
  const n=state.selected.size,bar=$('#bo-bulk');
  show(bar,n>0&&state.appOpen);
  document.body.classList.toggle('has-bulk',n>0&&state.appOpen);
  setText($('#bo-bulk-count'),n+' selected');
  const archived=state.filters.stage==='archived';
  show($('[data-archive-label="archive"]'),!archived);show($('[data-archive-label="restore"]'),archived);
  const dest=$('#bo-bulk-owner').value,profile=dest!=='unassigned';
  $('#bo-bulk-export').disabled=!profile;$('#bo-bulk-sync').disabled=!profile;
}

function barRows(host,groups,total){
  const tpl=$('#tpl-bar'),frag=document.createDocumentFragment();
  for(const g of groups){
    const li=tpl.content.firstElementChild.cloneNode(true),meter=$('[data-b="meter"]',li);
    setText($('[data-b="label"]',li),g.label);setText($('[data-b="count"]',li),g.count.toLocaleString());
    meter.max=Math.max(1,total);meter.value=g.count;meter.setAttribute('aria-label',g.label+': '+g.count+' of '+total+' leads');
    frag.appendChild(li);
  }
  host.replaceChildren(frag);
}
function groupBy(rows,labelOf){
  const map=new Map();for(const l of rows){const k=labelOf(l);map.set(k,(map.get(k)||0)+1)}
  const all=Array.from(map,([label,count])=>({label,count})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));
  if(all.length<=6)return all;
  const top=all.slice(0,5);top.push({label:'Everything else',count:all.slice(5).reduce((s,g)=>s+g.count,0)});return top;
}
function renderSources(){
  const since=Date.now()-30*864e5;
  const rows=state.leads.filter((l)=>ownerMatch(l)&&l.lead_status!=='archived'&&(state.sourceRange==='all'||new Date(l.created_at).getTime()>=since));
  $$('[data-range]').forEach((b)=>b.setAttribute('aria-pressed',b.dataset.range===state.sourceRange?'true':'false'));
  setText($('[data-sources-total]'),plural(rows.length,'lead')+(state.sourceRange==='all'?' in total.':' in the last 30 days.'));
  barRows($('#bo-sources-intake'),groupBy(rows,(l)=>sourceLabel(l.source)),rows.length);
  barRows($('#bo-sources-referral'),groupBy(rows,(l)=>referralLabel(l.referral_source)),rows.length);
}

function renderHandoff(){
  const host=$('#bo-handoff-list'),tpl=$('#tpl-handoff'),bt=state.integrations.boldtrail||{},frag=document.createDocumentFragment();
  for(const o of state.operators){
    const waiting=state.leads.filter((l)=>l.crm_owner===o.key&&!l.last_exported_at&&l.lead_status!=='archived').length;
    const li=tpl.content.firstElementChild.cloneNode(true),btn=$('[data-h="export"]',li);
    setText($('[data-h="label"]',li),o.label);
    setText($('[data-h="status"]',li),plural(waiting,'new lead')+' to export · direct sending '+(bt[o.key]?'connected':'not connected'));
    btn.disabled=!waiting;btn.setAttribute('aria-label','Export '+possessive(o.label)+' new leads as CSV');
    btn.addEventListener('click',()=>exportCsv(o.key,[]));
    frag.appendChild(li);
  }
  host.replaceChildren(frag);
}

function renderSettings(){
  const i=state.integrations||{},bt=i.boldtrail||{};
  setText($('[data-s="who"]'),state.actorLabel||'—');
  setText($('[data-s="expires"]'),when(state.expiresAt)||'—');
  setText($('[data-s="google"]'),i.google_address_validation?'Connected':'Not connected');
  const host=$('#bo-settings-boldtrail'),frag=document.createDocumentFragment();
  for(const o of state.operators){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=o.label;dd.textContent=bt[o.key]?'Connected':'Not connected (CSV export still works)';frag.append(dt,dd)}
  host.replaceChildren(frag);
}

/* ---------- source filter options come from the data ---------- */
function fillSourceOptions(){
  const sel=$('#bo-source');if(!sel)return;
  const fill=(group,prefix,values,labelOf)=>{const g=$('[data-source-group="'+group+'"]',sel);g.replaceChildren(...values.map((v)=>{const o=document.createElement('option');o.value=prefix+v;o.textContent=labelOf(v);return o}));g.hidden=!values.length};
  const uniq=(key)=>Array.from(new Set(state.leads.map((l)=>String(l[key]||'').trim()).filter(Boolean))).sort();
  fill('source','src:',uniq('source'),sourceLabel);
  fill('referral','ref:',uniq('referral_source'),referralLabel);
  if(!$('option[value="'+CSS.escape(state.filters.source)+'"]',sel))state.filters.source='all';
  sel.value=state.filters.source;
}

/* ---------- loading ---------- */
async function loadLeads(first){
  const refresh=$('#bo-refresh');if(refresh)refresh.disabled=true;
  if(!state.leads.length){show($('#bo-list-loading'),true);show($('#bo-list-empty'),false)}
  try{
    const d=await api('list');
    state.leads=Array.isArray(d.leads)?d.leads:[];
    state.followupsAvailable=d.followups_available!==false;
    if(d.integrations){state.integrations=d.integrations;renderSettings()}
    computeDupes();fillSourceOptions();renderAll();
    if(state.selectedId&&state.leads.some((l)=>l.id===state.selectedId))await loadDetail(state.selectedId,{refresh:true});
    else if(first&&!MOBILE.matches){const firstRow=visibleLeads()[0];if(firstRow)await selectLead(firstRow.id,{focus:false});else showDetail('empty')}
    else if(!state.selectedId)showDetail('empty');
  }catch(ex){
    if(ex.status===401)return;
    show($('#bo-list-loading'),false);show($('#bo-list-error'),true);setText($('[data-list-error]'),ex.message);
  }finally{if(refresh)refresh.disabled=false}
}

function mergeLead(updated){
  if(!updated||!updated.id)return;
  const i=state.leads.findIndex((l)=>l.id===updated.id);
  if(i>=0)state.leads[i]=Object.assign({},state.leads[i],updated);else state.leads.unshift(updated);
  if(state.detail&&state.detail.id===updated.id)state.detail=Object.assign({},state.detail,updated);
  computeDupes();renderAll();
}

/* ---------- detail ---------- */
function showDetail(which){
  show($('#bo-detail-empty'),which==='empty');show($('#bo-detail-loading'),which==='loading');
  show($('#bo-detail-error'),which==='error');show($('#bo-lead'),which==='lead');
}
async function selectLead(id,opts={}){
  state.selectedId=id;
  $$('#bo-list .bo-row').forEach((li)=>{const on=li.dataset.leadId===id;li.classList.toggle('is-active',on);const b=$('[data-row-open]',li);if(on)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current')});
  if(MOBILE.matches)openSheet();
  await loadDetail(id,{focus:opts.focus!==false});
}
async function loadDetail(id,opts={}){
  const seq=++state.detailSeq;
  if(!opts.refresh)showDetail('loading');
  try{
    const d=await api('detail',{lead_id:id});
    if(seq!==state.detailSeq)return;
    state.detail=d.lead;state.events=Array.isArray(d.events)?d.events:[];
    const i=state.leads.findIndex((l)=>l.id===d.lead.id);if(i>=0)state.leads[i]=Object.assign({},state.leads[i],d.lead);
    renderDetail();fillForms(!opts.refresh);showDetail('lead');
    if(opts.focus&&MOBILE.matches){const h=$('#bo-lead-name');if(h)h.focus()}
  }catch(ex){
    if(seq!==state.detailSeq||ex.status===401)return;
    setText($('[data-detail-error]'),ex.message);showDetail('error');
  }
}
function fillForms(force){
  const l=state.detail;if(!l)return;
  const fu=$('#bo-followup-form'),notes=$('#bo-notes-form');
  if(force||fu.dataset.dirty!=='1'){fu.elements.next_action.value=l.next_action||'';fu.elements.next_action_due.value=l.next_action_due||'';fu.dataset.dirty=''}
  if(force||notes.dataset.dirty!=='1'){notes.elements.notes.value=l.notes||'';notes.dataset.dirty=''}
  if(force){$('#bo-note-form').elements.note.value=''}
}
function dlText(field,value){setText($('[data-f="'+field+'"]'),value)}
function renderDetail(){
  const l=state.detail;if(!l)return;
  const bt=state.integrations.boldtrail||{};
  dlText('kicker',[sourceLabel(l.source),l.referral_source?'heard via '+referralLabel(l.referral_source):''].filter(Boolean).join(' · '));
  dlText('name',text(l.full_name,'Unnamed lead'));
  dlText('contact',[fmtPhone(l.phone),l.email].filter(Boolean).join(' · ')||'No phone or email on file');
  const pills=[pill(stageLabel(l.lead_status||'new'),'stage'),pill(ownerLabel(l.crm_owner),'owner')];
  const due=duePill(l);if(due)pills.push(due);
  if(needsAttention(l))pills.push(pill('Needs attention','bad'));
  const crm=crmPill(l);if(crm)pills.push(crm);
  $('[data-f="pills"]').replaceChildren(...pills);

  // Reach out
  const phone=dialable(l.phone),call=$('#bo-call'),sms=$('#bo-text'),mail=$('#bo-email');
  call.hidden=sms.hidden=!phone;mail.hidden=!l.email;
  if(phone){call.href='tel:'+phone;sms.href='sms:'+phone;call.setAttribute('aria-label','Call '+text(l.full_name,'this lead')+' at '+fmtPhone(l.phone));sms.setAttribute('aria-label','Text '+text(l.full_name,'this lead')+' at '+fmtPhone(l.phone))}
  if(l.email){mail.href='mailto:'+encodeURIComponent(l.email).replace(/%40/g,'@');mail.setAttribute('aria-label','Email '+text(l.full_name,'this lead')+' at '+l.email)}
  show($('#bo-no-contact'),!phone&&!l.email);
  const consent=consentOf(l);
  show($('#bo-consent-none'),!consent.any);show($('#bo-consent-some'),consent.any);
  dlText('consent',[consent.email?'email':'',consent.sms?'texts':''].filter(Boolean).join(' and '));
  dlText('last-contacted',l.last_contacted_at?when(l.last_contacted_at):'Not yet');

  // Attention + duplicates
  const attn=needsAttention(l);show($('#bo-attention-card'),attn);
  if(attn)$('[data-f="reasons"]').replaceChildren(...attentionReasons(l).map((r)=>{const li=document.createElement('li');li.textContent=r;return li}));
  const dupes=state.dupes.get(l.id);show($('#bo-dupes'),!!dupes);
  if(dupes){
    const tpl=$('#tpl-dupe');
    $('[data-f="dupes"]').replaceChildren(...Array.from(dupes,([id,kind])=>{const other=state.leads.find((x)=>x.id===id)||{};const li=tpl.content.firstElementChild.cloneNode(true),btn=$('[data-d="open"]',li);btn.textContent=text(other.full_name,'Unnamed lead');btn.addEventListener('click',()=>selectLead(id));setText($('[data-d="why"]',li),'same '+kind+' · '+ownerLabel(other.crm_owner)+' · '+stageLabel(other.lead_status||'new'));return li}));
  }

  // Pipeline
  $('#bo-stage-select').value=l.lead_status||'new';
  $('#bo-owner-select').value=l.crm_owner||'unassigned';
  const fu=$('#bo-followup-form');show($('#bo-followup-off'),!state.followupsAvailable);
  $$('input,button',fu).forEach((el)=>{el.disabled=!state.followupsAvailable});

  // BoldTrail
  const dest=destinationFor(l),synced=isSynced(l);
  dlText('crm-owner',l.crm_owner&&l.crm_owner!=='unassigned'?possessive(ownerLabel(l.crm_owner))+' BoldTrail':'Not assigned yet (sending assigns it to you)');
  dlText('crm-synced',synced?(when(l.crm_synced_at||l.last_exported_at)||'Yes'):'Not sent yet');
  const direct=l.crm_synced_at?l.crm_synced_at===l.last_exported_at:l.crm_status==='synced';
  dlText('crm-exported',l.last_exported_at?when(l.last_exported_at)+' · '+(l.last_export_profile?possessive(ownerLabel(l.last_export_profile))+' BoldTrail':'BoldTrail')+(direct?' (sent directly)':' (CSV file)'):'Never');
  dlText('hashtags',crmHashtags(l).map((t)=>'#'+t).join(' ')||'None');
  const err=$('[data-f="crm-error"]');show(err,l.crm_status==='error'&&!!l.crm_error);setText(err,l.crm_error?'Last send failed: '+l.crm_error:'');
  const connected=!!bt[dest];show($('#bo-sync-off'),!connected);
  const syncBtn=$('#bo-sync');syncBtn.disabled=!connected||l.lead_status==='archived';
  setText($('[data-sync-label]',syncBtn),(synced?'Re-send to ':'Send to ')+possessive(ownerLabel(dest))+' BoldTrail');

  // What they submitted
  dlText('submitted-address',text(l.submitted_address));
  dlText('google-address',text(l.standardized_address,l.submitted_address?'Not checked yet':'—'));
  const st=$('[data-f="address-status"]'),as=l.address_status;
  if(as&&!['pending','skipped'].includes(as)&&(l.address_validated_at||l.standardized_address)){st.hidden=false;st.className='bo-pill is-'+(as==='verified'?'good':as==='review'?'warn':'bad');st.textContent=as==='verified'?'Confirmed':as==='review'?'Needs a look':'No match'}else st.hidden=true;
  dlText('phone',fmtPhone(l.phone)||'—');dlText('email',text(l.email));
  dlText('tenure',text(l.tenure));dlText('income',text(l.household_income));dlText('program',text(l.program));
  dlText('intent',l.intent_score===null||l.intent_score===undefined?'—':l.intent_score+(l.intent_label?' · '+humanize(String(l.intent_label).toLowerCase()):''));
  dlText('benefit',money(l.estimated_benefit));dlText('source',sourceLabel(l.source));
  dlText('referral',l.referral_source?referralLabel(l.referral_source)+(l.referral_source_detail?' — '+l.referral_source_detail:''):'Not given');
  dlText('created',when(l.created_at)||'—');
  const v=$('#bo-validate');v.disabled=!l.submitted_address;setText(v,l.address_validated_at?'Re-check address with Google':'Check address with Google');

  renderTimeline();
}
function destinationFor(l){return l.crm_owner==='john'||l.crm_owner==='wife'?l.crm_owner:state.actor}

const CHANNEL_WORD={call:'Called',text:'Texted',email:'Emailed'};
function eventView(e){
  const d=e.details&&typeof e.details==='object'?e.details:{};
  const dest=d.destination||String(e.provider||'').replace(/^boldtrail:/,'');
  let title='',note='';
  switch(e.event_type){
    case 'lead.created':title='Lead received'+(e.provider?' from '+sourceLabel(e.provider):'');break;
    case 'lead.updated':title=Array.isArray(d.fields)&&d.fields.includes('notes')?'Lead notes edited':'Lead updated';break;
    case 'lead.stage_changed':title='Stage changed to '+stageLabel(d.lead_status||e.status);break;
    case 'followup.updated':title=d.next_action||d.next_action_due?'Follow-up set':'Follow-up cleared';note=[d.next_action,d.next_action_due?'due '+dueDate(d.next_action_due):''].filter(Boolean).join(' · ');break;
    case 'lead.reviewed':title='Marked reviewed';break;
    case 'lead.archived':title='Archived';break;
    case 'lead.unarchived':title='Restored from the archive';break;
    case 'note.added':title='Note';note=d.note||'';break;
    case 'contact.logged':title=CHANNEL_WORD[d.channel||e.status]||'Contact logged';if(d.stage_changed_to)note='Moved to '+stageLabel(d.stage_changed_to);break;
    case 'address.validated':title=e.status==='verified'?'Google confirmed the address':e.status==='review'?'Google couldn’t fully confirm the address':'Google found no matching address';if(d.kept_manual_review)note='The earlier review decision was kept.';break;
    case 'address.validation_failed':title='Google address check failed';break;
    case 'crm.assignment_changed':{const to=d.owner||e.status;title=to==='unassigned'?'Unassigned':'Assigned to '+ownerLabel(to);break}
    case 'crm.csv_exported':title='Exported in '+possessive(ownerLabel(dest))+' BoldTrail CSV';break;
    case 'crm.boldtrail_synced':{title='Sent to '+possessive(ownerLabel(dest))+' BoldTrail';const f=d.consent_flags;if(f)note='Email opt-in '+(f.email_optin?'yes':'no')+' · texts '+(f.text_on?'yes':'no')+' · calls '+(f.phone_on?'yes':'no');break}
    case 'crm.boldtrail_sync_failed':title='BoldTrail send failed';break;
    default:title=humanize(e.event_type)||'Activity';
  }
  // Older BoldTrail events stored the destination as "actor"; only trust it once "destination" is recorded separately.
  const trustedActor=!/^crm\.boldtrail_sync/.test(e.event_type)||!!d.destination;
  const actor=trustedActor&&d.actor&&state.operators.some((o)=>o.key===d.actor)?'by '+ownerLabel(d.actor):'';
  return {title,note,meta:actor};
}
function renderTimeline(){
  const host=$('#bo-timeline'),tpl=$('#tpl-event'),frag=document.createDocumentFragment();
  for(const e of state.events){
    const li=tpl.content.firstElementChild.cloneNode(true),v=eventView(e);
    setText($('[data-e="title"]',li),v.title);setText($('[data-e="meta"]',li),v.meta);
    if(v.note){const p=$('[data-e="note"]',li);p.hidden=false;p.textContent=v.note}
    const t=$('[data-e="time"]',li);t.textContent=when(e.created_at);if(e.created_at)t.dateTime=e.created_at;
    if(e.event_type==='note.added')li.classList.add('is-note');
    frag.appendChild(li);
  }
  host.replaceChildren(frag);
  show($('#bo-timeline-empty'),!state.events.length);
}

/* ---------- mobile sheet ---------- */
function openSheet(){
  const d=$('#bo-detail');if(!d||d.classList.contains('is-open'))return;
  d.classList.add('is-open');document.documentElement.classList.add('bo-sheet-open');
  try{history.pushState({boSheet:true},'')}catch(_){/* history unavailable */}
}
function closeSheet(fromHistory){
  const d=$('#bo-detail');if(!d||!d.classList.contains('is-open'))return;
  d.classList.remove('is-open');document.documentElement.classList.remove('bo-sheet-open');
  if(!fromHistory&&history.state&&history.state.boSheet){try{history.back()}catch(_){/* ignore */}}
  const row=state.selectedId&&$('#bo-list [data-row-open][data-lead-id="'+CSS.escape(state.selectedId)+'"]');
  if(row&&!fromHistory)row.focus();
}

/* ---------- lead actions ---------- */
async function afterChange(d,message){
  if(d&&d.lead)mergeLead(d.lead);
  if(state.detail)await loadDetail(state.detail.id,{refresh:true});
  if(message)toast(message);
}
async function changeStage(stage){
  const l=state.detail;if(!l||stage===l.lead_status)return;
  try{await afterChange(await api('update',{lead_id:l.id,patch:{lead_status:stage}}),'Stage set to '+stageLabel(stage))}catch(ex){report(ex);renderDetail()}
}
async function changeOwner(owner){
  const l=state.detail;if(!l||owner===(l.crm_owner||'unassigned'))return;
  try{
    const d=await api('assign',{lead_ids:[l.id],profile_key:owner});
    for(const row of d.updated||[]){const x=state.leads.find((y)=>y.id===row.id);if(x)x.crm_owner=row.crm_owner}
    state.detail.crm_owner=owner;renderAll();
    await afterChange(null,owner==='unassigned'?'Lead unassigned':'Assigned to '+ownerLabel(owner));
  }catch(ex){report(ex);renderDetail()}
}
async function saveFollowup(e){
  e.preventDefault();
  const l=state.detail,form=e.currentTarget;if(!l)return;
  const patch={next_action:form.elements.next_action.value.trim(),next_action_due:form.elements.next_action_due.value};
  if(patch.next_action&&!patch.next_action_due){toast('Pick a due date for the next step.');form.elements.next_action_due.focus();return}
  try{form.dataset.dirty='';await afterChange(await api('update',{lead_id:l.id,patch}),'Follow-up saved')}catch(ex){report(ex)}
}
async function clearFollowup(){
  const l=state.detail;if(!l)return;
  try{const form=$('#bo-followup-form');form.dataset.dirty='';await afterChange(await api('update',{lead_id:l.id,patch:{next_action:'',next_action_due:''}}),'Follow-up cleared')}catch(ex){report(ex)}
}
async function saveNotes(e){
  e.preventDefault();
  const l=state.detail,form=e.currentTarget;if(!l)return;
  try{form.dataset.dirty='';await afterChange(await api('update',{lead_id:l.id,patch:{notes:form.elements.notes.value}}),'Notes saved')}catch(ex){report(ex)}
}
async function addNote(e){
  e.preventDefault();
  const l=state.detail,form=e.currentTarget,note=form.elements.note.value.trim();
  if(!l)return;if(!note){form.elements.note.focus();return}
  try{
    const d=await api('add_note',{lead_id:l.id,note});
    if(d.event){state.events.unshift(d.event);renderTimeline()}
    form.elements.note.value='';toast('Note added');
  }catch(ex){report(ex)}
}
// Quick contact: the link still opens the phone, messages or mail app; this just logs it.
async function logContact(channel){
  const l=state.detail;if(!l)return;
  try{
    const d=await api('log_contact',{lead_id:l.id,channel},{keepalive:true});
    if(d.lead)mergeLead(d.lead);
    if(d.event){state.events.unshift(d.event);}
    renderDetail();
  }catch(ex){report(ex)}
}
async function markReviewed(){
  const l=state.detail;if(!l)return;
  const btn=$('#bo-mark-reviewed');btn.disabled=true;
  try{await afterChange(await api('mark_reviewed',{lead_id:l.id}),'Marked reviewed')}catch(ex){report(ex)}finally{btn.disabled=false}
}
async function validateAddress(){
  const l=state.detail;if(!l)return;
  const btn=$('#bo-validate');btn.disabled=true;
  try{const d=await api('validate_address',{lead_id:l.id});await afterChange(d,d.lead&&d.lead.address_status==='verified'?'Google confirmed the address':'Google returned an address that needs a look')}catch(ex){report(ex)}finally{btn.disabled=false}
}
async function syncOne(){
  const l=state.detail;if(!l)return;
  const dest=destinationFor(l),synced=isSynced(l),label=possessive(ownerLabel(dest))+' BoldTrail';
  let resend=false;
  if(synced){
    const answer=await confirmDialog({title:'Re-send '+text(l.full_name,'this lead')+' to '+label+'?',lines:['Already sent '+(when(l.crm_synced_at||l.last_exported_at)||'before')+'. Sending again can create a second contact in BoldTrail.'],ok:'Re-send'});
    if(!answer.ok)return;resend=true;
  }
  const btn=$('#bo-sync');btn.disabled=true;
  try{await afterChange(await api('sync_boldtrail',{lead_id:l.id,profile_key:dest,resend}),'Sent to '+label)}catch(ex){report(ex);if(state.detail)await loadDetail(state.detail.id,{refresh:true})}finally{btn.disabled=false;renderDetail()}
}
function crmBrief(l){
  return [
    'Name: '+text(l.full_name,''),'Email: '+text(l.email,''),'Phone: '+fmtPhone(l.phone),
    'Submitted address: '+text(l.submitted_address,''),'Google standardized: '+text(l.standardized_address,'Not checked yet'),
    'Program: '+text(l.program,''),'Tenure: '+text(l.tenure,''),'Household income: '+text(l.household_income,''),
    'Intent: '+text(l.intent_score,'')+(l.intent_label?' '+l.intent_label:''),'Estimated benefit: '+money(l.estimated_benefit),
    'Heard about Watchdog: '+referralLabel(l.referral_source)+(l.referral_source_detail?' ('+l.referral_source_detail+')':''),
    'Next step: '+text(l.next_action,'')+(l.next_action_due?' (due '+l.next_action_due+')':''),
    'Hashtags: '+crmHashtags(l).map((t)=>'#'+t).join(' '),'Owner: '+ownerLabel(l.crm_owner),'Source: '+sourceLabel(l.source),'Notes: '+text(l.notes,'')
  ].join('\n');
}
async function copyBrief(){const l=state.detail;if(!l)return;try{await navigator.clipboard.writeText(crmBrief(l));toast('CRM brief copied')}catch(_){toast('Copy didn’t work in this browser.')}}

/* ---------- bulk actions ---------- */
function selectedLeads(){return state.leads.filter((l)=>state.selected.has(l.id))}
function clearSelection(){state.selected.clear();renderList()}
function ownedByOthers(leads,dest){
  const by=new Map();
  for(const l of leads){const o=l.crm_owner;if(o&&o!=='unassigned'&&o!==dest&&l.lead_status!=='archived')by.set(o,(by.get(o)||0)+1)}
  return Array.from(by,([owner,count])=>plural(count,'lead')+' '+(count===1?'belongs':'belong')+' to '+ownerLabel(owner)+' and will move to '+ownerLabel(dest)+'.');
}
async function bulkAssign(){
  const ids=Array.from(state.selected),owner=$('#bo-bulk-owner').value;if(!ids.length)return;
  try{
    const d=await api('assign',{lead_ids:ids,profile_key:owner});
    for(const row of d.updated||[]){const l=state.leads.find((x)=>x.id===row.id);if(l)l.crm_owner=row.crm_owner}
    state.selected.clear();renderAll();
    if(state.detail&&ids.includes(state.detail.id))await loadDetail(state.detail.id,{refresh:true});
    toast(owner==='unassigned'?'Unassigned '+plural(ids.length,'lead'):'Assigned '+plural(ids.length,'lead')+' to '+ownerLabel(owner));
  }catch(ex){report(ex)}
}
function downloadCsv(filename,csv){const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)}
async function exportCsv(profile,ids){
  try{
    const d=await api('export_csv',{profile_key:profile,lead_ids:ids});
    downloadCsv(d.filename,d.csv);
    state.selected.clear();
    toast(plural(d.count,'lead')+' exported for '+ownerLabel(profile)+(d.excluded_count?' · '+plural(d.excluded_count,'archived lead')+' left out':''));
    await loadLeads(false);
  }catch(ex){report(ex)}
}
async function bulkExport(){
  const dest=$('#bo-bulk-owner').value;if(dest==='unassigned')return;
  const leads=selectedLeads(),archived=leads.filter((l)=>l.lead_status==='archived').length,moving=ownedByOthers(leads,dest);
  if(moving.length||archived){
    const lines=moving.slice();if(archived)lines.push(plural(archived,'archived lead')+' will be left out.');
    const answer=await confirmDialog({title:'Export for '+ownerLabel(dest)+'?',lines,ok:'Export CSV'});
    if(!answer.ok)return;
  }
  await exportCsv(dest,leads.map((l)=>l.id));
}
async function bulkSync(){
  const dest=$('#bo-bulk-owner').value;if(dest==='unassigned')return;
  const label=possessive(ownerLabel(dest))+' BoldTrail';
  if(!(state.integrations.boldtrail||{})[dest]){toast(label+' isn’t connected for direct sending. Use Export CSV.');return}
  const leads=selectedLeads(),active=leads.filter((l)=>l.lead_status!=='archived'),archived=leads.length-active.length,already=active.filter(isSynced).length;
  const lines=['Send '+plural(active.length-already,'lead')+' to '+label+'.'];
  if(already)lines.push(plural(already,'lead')+' '+(already===1?'is':'are')+' already in BoldTrail and will be skipped unless you re-send.');
  lines.push(...ownedByOthers(leads,dest));
  if(archived)lines.push(plural(archived,'archived lead')+' will be skipped.');
  lines.push('Email and text opt-ins are only sent for leads with marketing consent on file.');
  const answer=await confirmDialog({title:'Send to '+label+'?',lines,ok:'Send',resend:already>0});
  if(!answer.ok)return;
  const ids=active.map((l)=>l.id),totals={synced:0,skipped:0,failed:[]};
  const btn=$('#bo-bulk-sync');btn.disabled=true;
  try{
    for(let i=0;i<ids.length;i+=BULK_SYNC_BATCH){
      const d=await api('sync_boldtrail_bulk',{lead_ids:ids.slice(i,i+BULK_SYNC_BATCH),profile_key:dest,resend:answer.resend});
      totals.synced+=d.synced_count||0;totals.skipped+=d.skipped_count||0;totals.failed.push(...(d.failed||[]));
    }
  }catch(ex){report(ex)}
  finally{btn.disabled=false}
  const parts=[plural(totals.synced,'lead')+' sent to '+label];
  if(totals.skipped+archived)parts.push((totals.skipped+archived)+' skipped');
  if(totals.failed.length)parts.push(totals.failed.length+' failed'+(totals.failed[0]&&totals.failed[0].error?' ('+totals.failed[0].error+')':''));
  toast(parts.join(' · '));
  state.selected.clear();
  await loadLeads(false);
}
async function bulkArchive(){
  const ids=Array.from(state.selected);if(!ids.length)return;
  const archive=state.filters.stage!=='archived';
  try{await api('archive_bulk',{lead_ids:ids,archive});state.selected.clear();toast((archive?'Archived ':'Restored ')+plural(ids.length,'lead'));await loadLeads(false)}catch(ex){report(ex)}
}

/* ---------- dialogs ---------- */
function openDialog(dlg){if(!dlg)return;if(typeof dlg.showModal==='function'){if(!dlg.open)dlg.showModal()}else dlg.setAttribute('open','')}
function closeDialog(dlg){if(!dlg)return;if(dlg.open&&typeof dlg.close==='function')dlg.close();else dlg.removeAttribute('open')}
function confirmDialog({title,lines=[],ok='Continue',resend=false}){
  const dlg=$('#bo-confirm');
  setText($('[data-c="title"]',dlg),title);
  $('[data-c="lines"]',dlg).replaceChildren(...lines.map((t)=>{const li=document.createElement('li');li.textContent=t;return li}));
  setText($('[data-c="ok"]',dlg),ok);
  show($('[data-c="resend-wrap"]',dlg),resend);
  const box=$('[data-c="resend"]',dlg);box.checked=false;
  dlg.returnValue='';
  return new Promise((resolve)=>{
    dlg.addEventListener('close',()=>resolve({ok:dlg.returnValue==='ok',resend:resend&&box.checked}),{once:true});
    openDialog(dlg);
  });
}
async function saveLead(e){
  e.preventDefault();
  const form=e.currentTarget,btn=$('#bo-add-save'),err=$('#bo-add-error');
  btn.disabled=true;err.textContent='';
  try{
    const d=await api('add',{lead:Object.fromEntries(new FormData(form).entries())});
    closeDialog($('#bo-add-dialog'));
    form.reset();form.elements.program.value='ANCHOR Estimator';form.elements.source.value='manual';if(state.actor)form.elements.crm_owner.value=state.actor;
    mergeLead(d.lead);toast('Lead added');await selectLead(d.lead.id);
  }catch(ex){if(ex.status!==401)err.textContent=ex.message}
  finally{btn.disabled=false}
}

/* ---------- wiring ---------- */
function setFilter(patch){
  Object.assign(state.filters,patch);
  $('#bo-owner').value=state.filters.owner;$('#bo-followup').value=state.filters.followup;$('#bo-source').value=state.filters.source;
  $('#bo-sort').value=state.filters.sort;$('#bo-attention-only').checked=state.filters.attention;
  renderAll();
}
function bind(){
  const on=(sel,evt,fn)=>{const el=$(sel);if(el)el.addEventListener(evt,fn)};
  if(window.WatchdogBackofficeShell)window.WatchdogBackofficeShell.onLock=lock;
  on('#bo-open','click',openSession);on('#bo-retry','click',openSession);on('#bo-switch-account','click',switchAccount);
  on('#bo-refresh','click',()=>loadLeads(false));
  on('#bo-add','click',()=>openDialog($('#bo-add-dialog')));
  on('#bo-settings','click',()=>{renderSettings();openDialog($('#bo-settings-dialog'))});
  $$('dialog [data-close]').forEach((b)=>b.addEventListener('click',()=>closeDialog(b.closest('dialog'))));
  on('#bo-add-form','submit',saveLead);
  let searchTimer=0;
  on('#bo-search','input',(e)=>{clearTimeout(searchTimer);const v=e.target.value.trim().toLowerCase();searchTimer=setTimeout(()=>setFilter({search:v}),120)});
  on('#bo-owner','change',(e)=>setFilter({owner:e.target.value}));
  on('#bo-followup','change',(e)=>setFilter({followup:e.target.value}));
  on('#bo-source','change',(e)=>setFilter({source:e.target.value}));
  on('#bo-sort','change',(e)=>setFilter({sort:e.target.value}));
  on('#bo-attention-only','change',(e)=>setFilter({attention:e.target.checked}));
  $$('[data-stage]').forEach((b)=>b.addEventListener('click',()=>setFilter({stage:b.dataset.stage})));
  const FOCUS={new:{stage:'new',followup:'any',attention:false},today:{stage:'open',followup:'today',attention:false},overdue:{stage:'open',followup:'overdue',attention:false},attention:{stage:'open',followup:'any',attention:true}};
  $$('[data-focus]').forEach((b)=>b.addEventListener('click',()=>{setFilter(b.getAttribute('aria-pressed')==='true'?{stage:'open',followup:'any',attention:false}:FOCUS[b.dataset.focus]);const q=$('#bo-queue-title');if(q)q.scrollIntoView({block:'start',behavior:'smooth'})}));
  $$('[data-range]').forEach((b)=>b.addEventListener('click',()=>{state.sourceRange=b.dataset.range;renderSources()}));

  const list=$('#bo-list');
  list.addEventListener('click',(e)=>{const open=e.target.closest('[data-row-open]');if(open)selectLead(open.dataset.leadId)});
  list.addEventListener('change',(e)=>{const box=e.target.closest('[data-row-check]');if(!box)return;if(box.checked)state.selected.add(box.dataset.leadId);else state.selected.delete(box.dataset.leadId);renderSelectAll(visibleLeads());renderBulk()});
  on('#bo-select-all','change',(e)=>{const rows=visibleLeads();rows.forEach((l)=>{if(e.target.checked)state.selected.add(l.id);else state.selected.delete(l.id)});renderList()});

  on('#bo-back','click',()=>closeSheet(false));
  window.addEventListener('popstate',()=>{if(!(history.state&&history.state.boSheet))closeSheet(true)});
  document.addEventListener('keydown',(e)=>{if(e.key==='Escape'&&$('#bo-detail').classList.contains('is-open')&&!document.querySelector('dialog[open]'))closeSheet(false)});
  const onMedia=()=>{if(!MOBILE.matches)closeSheet(true)};
  if(MOBILE.addEventListener)MOBILE.addEventListener('change',onMedia);else if(MOBILE.addListener)MOBILE.addListener(onMedia);

  $$('#bo-call,#bo-text,#bo-email').forEach((a)=>a.addEventListener('click',()=>logContact(a.dataset.channel)));
  on('#bo-mark-reviewed','click',markReviewed);
  on('#bo-validate','click',validateAddress);
  on('#bo-sync','click',syncOne);
  on('#bo-copy-brief','click',copyBrief);
  on('#bo-stage-select','change',(e)=>changeStage(e.target.value));
  on('#bo-owner-select','change',(e)=>changeOwner(e.target.value));
  on('#bo-followup-form','submit',saveFollowup);
  on('#bo-followup-form','input',(e)=>{e.currentTarget.dataset.dirty='1'});
  on('#bo-followup-clear','click',clearFollowup);
  on('#bo-notes-form','submit',saveNotes);
  on('#bo-notes-form','input',(e)=>{e.currentTarget.dataset.dirty='1'});
  on('#bo-note-form','submit',addNote);

  on('#bo-bulk-owner','change',renderBulk);
  on('#bo-bulk-assign','click',bulkAssign);
  on('#bo-bulk-export','click',bulkExport);
  on('#bo-bulk-sync','click',bulkSync);
  on('#bo-bulk-archive','click',bulkArchive);
  on('#bo-bulk-clear','click',clearSelection);
}

async function init(){
  bind();
  const existing=store('get',SESSION_KEY);
  if(existing){
    state.token=existing;
    try{await enterApp();return}
    catch(ex){if(ex.status!==401){showGate('error',ex.message);return}clearToken()}
  }
  if(store('get',LOCK_KEY)){showGate('locked');return}
  await openSession();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
