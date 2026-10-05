/* Watchdog Email updates (/newsletter-studio), in partnership with Kit.
   One page, five steps: connect Kit -> audience -> write (live preview) -> send -> track.
   Every Kit call goes through the Kit gateway edge function (tmp-boldtrail-probe)
   using the agent's own Kit key, which is stored server-side and never returned.
   The email is built here from plain fields as email-safe HTML; Kit adds the
   unsubscribe link and mailing address. Page copy lives in the HTML templates. */
(()=>{'use strict';
const qs=(s,r=document)=>r.querySelector(s);
const qsa=(s,r=document)=>Array.from(r.querySelectorAll(s));
const safe=(e,c)=>window.WatchdogAgentSafety?window.WatchdogAgentSafety.friendlyError(e,c):(e&&e.message)||'Something went wrong. Please try again.';
const W=window.WatchdogAgentWorkspace,route=W&&W.route?W.route:(p=>'/property'+p);
const GATEWAY='tmp-boldtrail-probe';
const DRAFT_KEY='wd-email-updates-draft:';
const FIELDS=['subject','preview_text','headline','body','image_url','image_alt','cta_label','cta_url','snapshot_town'];
const SEND_NOW_MINUTES=3,SCHEDULE_MIN_MINUTES=10;
const FONT='Arial,Helvetica,sans-serif',INK='#14213d',MUTED='#5d6678',LINE='#e3dfd6';

let client,user,st=null,catalog={tags:[],segments:[]},count={type:'',id:'',n:null,counted:false},countSeq=0,words={},starter='';
let towns=null,townKeys=new Map(),rates=null,ratios=null,previewTimer=0,draftTimer=0;

const word=k=>words[k]||'';
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const httpsUrl=v=>{const x=String(v||'').trim();return /^https:\/\/[^\s"'<>]{3,500}$/i.test(x)?x:''};
const fmtDate=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):''};
const pct=v=>{const n=Number(v);return Number.isFinite(n)?`${Math.round(n*10)/10}%`:'-'};

function toast(m){const n=qs('#pl-toast');if(!n)return;n.textContent=m;n.style.display='block';clearTimeout(window.__eu);window.__eu=setTimeout(()=>n.style.display='none',4600)}
function fill(key,text){qsa(`[data-f="${key}"]`).forEach(n=>n.textContent=text)}
function show(sel,on){const n=qs(sel);if(n)n.hidden=!on}
function stepState(step,state,label){const li=qs(`.eu-step[data-step="${step}"]`);if(!li)return;li.dataset.status=state;const pill=qs('[data-state]',li);if(pill)pill.textContent=label}
async function message(e){try{const b=await e?.context?.json?.();if(b?.error)return b.error}catch(_){}return safe(e,'email-updates')}
async function busy(btn,fn){if(btn){btn.disabled=true;btn.setAttribute('aria-busy','true')}try{return await fn()}catch(e){toast(await message(e));return null}finally{if(btn){btn.disabled=false;btn.removeAttribute('aria-busy')}updateSend()}}
async function gateway(action,extra={}){const r=await client.functions.invoke(GATEWAY,{body:{action,...extra}});if(r.error)throw r.error;return r.data}

const connected=()=>Boolean(st?.provider&&st.provider.status==='connected');
const form=()=>qs('#eu-write');
function sender(){const list=st?.senders||[];const s=list.find(x=>x.is_default)||list[0];const email=s?.email_address||st?.provider?.primary_email_address||'';const name=s?.display_name||st?.brand?.name||'';return{email,name}}
function senderLine(){const s=sender();return s.email?(s.name?`${s.name} <${s.email}>`:s.email):''}
function fields(){const f=form();const d={};FIELDS.forEach(k=>d[k]=String(f.elements[k].value||'').trim());d.greeting=f.elements.greeting.checked;return d}
function audience(){const type=(qs('input[name="audience"]:checked')||{}).value||'all';const id=type==='tag'?qs('#eu-tag').value:type==='segment'?qs('#eu-segment').value:'';const list=type==='tag'?catalog.tags:type==='segment'?catalog.segments:[];const item=list.find(x=>String(x.id)===String(id));return{type,id,label:type==='all'?word('everyone'):(item?item.name:'')}}
function when(){return(qs('input[name="when"]:checked')||{}).value||'now'}

/* ---------- Step 1: Kit connection ---------- */
function paintConnection(){
  const on=connected();
  // content-architecture: dynamic, connection label and account name come from the live Kit connection.
  const label=qs('[data-f="connLabel"]');label.textContent=on?word('connected'):word('notConnected');label.classList.toggle('on',on);
  show('#eu-connected',on);show('#eu-connect',!on);
  fill('kitAccount',st?.provider?.account_name||'Kit');fill('senderLine',senderLine()||'-');
  stepState('connect',on?'done':'todo',on?word('done'):word('todo'));
  const cf=qs('#eu-connect-form');if(cf&&!cf.elements.sender_name.value&&st?.brand?.name)cf.elements.sender_name.value=st.brand.name;
  if(cf&&!cf.elements.sender_email.value&&st?.brand?.email)cf.elements.sender_email.value=st.brand.email;
}
async function connectKit(e){
  e.preventDefault();const f=e.currentTarget,key=String(f.elements.api_key.value||'').trim();
  if(key.length<16){f.elements.api_key.focus();f.elements.api_key.setCustomValidity('Paste your Kit V4 API key');f.elements.api_key.reportValidity();return}
  f.elements.api_key.setCustomValidity('');
  const ok=await busy(qs('#eu-connect-btn'),()=>gateway('kit.connect',{api_key:key,sender_name:f.elements.sender_name.value,sender_email:f.elements.sender_email.value}));
  if(!ok)return;f.elements.api_key.value='';toast(word('toastConnected'));await refresh();await loadCatalog();countAudience();
}
async function saveSender(e){
  e.preventDefault();const f=e.currentTarget;
  if(!f.elements.email_address.checkValidity()||!f.elements.email_address.value){f.elements.email_address.reportValidity();return}
  const ok=await busy(qs('button[type="submit"]',f),()=>gateway('sender.save',{email_address:f.elements.email_address.value,display_name:f.elements.display_name.value,is_default:true}));
  if(!ok)return;f.hidden=true;toast(word('toastSender'));await refresh();
}
function editSender(){const f=qs('#eu-sender-form'),s=sender();f.elements.email_address.value=s.email;f.elements.display_name.value=s.name;f.hidden=false;f.elements.display_name.focus()}
async function disconnect(e){if(!confirm(word('confirmDisconnect')))return;const ok=await busy(e.currentTarget,()=>gateway('kit.disconnect'));if(ok){catalog={tags:[],segments:[]};await refresh();paintCatalog();countAudience()}}

/* ---------- Step 2: audience ---------- */
async function loadCatalog(){if(!connected())return;try{catalog=await gateway('kit.catalog');}catch(e){catalog={tags:[],segments:[]};toast(await message(e))}paintCatalog()}
function paintCatalog(){
  [['#eu-tag','tags','#eu-no-tags'],['#eu-segment','segments','#eu-no-segments']].forEach(([sel,key,empty])=>{
    const box=qs(sel),keep=box.value,list=(catalog[key]||[]).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));box.replaceChildren();
    // content-architecture: dynamic, one option per tag or segment in the agent's Kit account.
    list.forEach(x=>{const o=document.createElement('option');o.value=x.id;o.textContent=x.name;box.append(o)});
    if(list.some(x=>String(x.id)===keep))box.value=keep;box.disabled=!list.length;box.dataset.empty=list.length?'':'1';
  });
  paintAudience();
}
function paintAudience(){
  const a=audience();show('#eu-tag-field',a.type==='tag');show('#eu-segment-field',a.type==='segment');
  show('#eu-no-tags',a.type==='tag'&&connected()&&!catalog.tags?.length);show('#eu-no-segments',a.type==='segment'&&connected()&&!catalog.segments?.length);
  const ok=connected()&&(a.type==='all'||Boolean(a.id));stepState('audience',ok?'done':'todo',ok?word('ready'):word('todo'));
  const crm=st?.crm,elig=st?.eligibility||{};show('#eu-crm-box',Boolean(crm?.connection)&&connected());
  fill('crmEligible',Number(elig.eligible||0).toLocaleString());fill('crmBounced',Number((elig.bounced||0)+(elig.complained||0)).toLocaleString());fill('crmUnsub',Number(elig.unsubscribed||0).toLocaleString());
  updateSend();
}
async function countAudience(){
  const a=audience(),out=qs('#eu-count'),seq=++countSeq;count={type:a.type,id:a.id,n:null,counted:false};
  if(!connected()||(a.type!=='all'&&!a.id)){out.textContent='';updateSend();return}
  // content-architecture: dynamic, live subscriber count from Kit for the chosen audience.
  if(a.type==='segment'){out.textContent=word('segmentCount');updateSend();return}
  out.textContent=word('counting');
  try{const r=await gateway('kit.audience',{target_type:a.type,target_id:a.id});if(seq!==countSeq)return;count.n=r.counted?Number(r.count):null;count.counted=Boolean(r.counted);
    out.textContent=count.counted?`${count.n.toLocaleString()} ${count.n===1?'person':'people'} will get this`:'';
    if(a.type==='all'&&count.counted)fill('allCount',`${count.n.toLocaleString()} active subscribers in Kit`);
  }catch(_){if(seq===countSeq)out.textContent=''}
  updateSend();
}
async function reconcile(e){const r=await busy(e.currentTarget,()=>gateway('kit.reconcile_existing'));if(r){toast(word('toastMatched'));await refresh()}}

/* ---------- Step 3: write ---------- */
function starterCopy(key){const n=qs(`[data-starter="${key}"]`,qs('#eu-starter-copy').content);if(!n)return null;return{subject:n.dataset.subject||'',preview_text:n.dataset.preview||'',headline:n.dataset.headline||'',cta_label:n.dataset.cta||'',body:n.textContent.replace(/^[ \t]+/gm,'').trim()}}
function useStarter(key){
  const d=fields(),dirty=Boolean(d.subject||d.body);const copy=starterCopy(key);if(!copy)return;
  if(dirty&&!confirm(word('confirmStarter')))return;
  const f=form();['subject','preview_text','headline','cta_label','body'].forEach(k=>f.elements[k].value=copy[k]);
  starter=key;qsa('.eu-starter').forEach(b=>b.classList.toggle('on',b.dataset.starter===key));
  onEdit();f.elements.subject.focus();
}
function paintSig(){
  const b=st?.brand||{},s=sender();
  // content-architecture: dynamic, signature assembled from the agent's saved brand profile.
  const parts=[b.name||s.name,b.company,b.phone,b.email||s.email,b.license?`License ${b.license}`:''].filter(Boolean);
  fill('sigLine',parts.join(' · ')||'-');show('#eu-sig-missing',!b.company||!b.phone);show('#eu-cta-default',Boolean(b.agent_url));
}
function saveDraftSoon(){clearTimeout(draftTimer);draftTimer=setTimeout(()=>{try{const d=fields();if(d.subject||d.body)localStorage.setItem(DRAFT_KEY+user.id,JSON.stringify({...d,starter,at:Date.now()}));else localStorage.removeItem(DRAFT_KEY+user.id)}catch(_){}},400)}
function restoreDraft(){let d=null;try{d=JSON.parse(localStorage.getItem(DRAFT_KEY+user.id)||'null')}catch(_){}if(!d||!(d.subject||d.body))return;const f=form();FIELDS.forEach(k=>{if(typeof d[k]==='string')f.elements[k].value=d[k]});f.elements.greeting.checked=d.greeting!==false;starter=d.starter||'';show('#eu-restored',true)}
function clearDraft(){try{localStorage.removeItem(DRAFT_KEY+user.id)}catch(_){}const f=form();FIELDS.forEach(k=>f.elements[k].value='');f.elements.greeting.checked=true;starter='';qsa('.eu-starter').forEach(b=>b.classList.remove('on'));show('#eu-restored',false);onEdit()}
function onEdit(){fill('subjectCount',String(form().elements.subject.value.length));saveDraftSoon();clearTimeout(previewTimer);previewTimer=setTimeout(renderPreview,120);const d=fields();stepState('write',d.subject&&d.body?'done':'todo',d.subject&&d.body?word('ready'):word('todo'));updateSend()}

/* Town tax snapshot (Watchdog data): NJ Division of Taxation general tax rates and Chapter 123 ratios. */
function prettyTown(key){const m=String(key).match(/^(.*) \(([^)]+)\)$/);const name=(m?m[1]:key).replace(/\bTWP\b/g,'Township').replace(/\bBORO\b/g,'Borough').replace(/^SO /,'South ').replace(/^NO /,'North ');const tc=s=>s.toLowerCase().replace(/\b[a-z]/g,c=>c.toUpperCase());return m?`${tc(name)}, ${tc(m[2])} County`:tc(name)}
async function loadTowns(){
  if(towns)return;towns=[];
  try{const [r1,r2]=await Promise.all([fetch('/tax-rates.json').then(r=>r.ok?r.json():null),fetch('/equalization-ratios.json').then(r=>r.ok?r.json():null)]);rates=r1?.rates||{};ratios=r2?.ratios||{}}catch(_){rates={};ratios={}}
  const list=qs('#eu-towns');list.replaceChildren();
  // content-architecture: dynamic, one option per municipality in the state tax-rate table.
  Object.keys(rates).sort().forEach(k=>{const label=prettyTown(k);townKeys.set(label.toLowerCase(),k);towns.push(label);const o=document.createElement('option');o.value=label;list.append(o)});
}
function snapshot(){
  const name=fields().snapshot_town;if(!name||!rates)return null;const key=townKeys.get(name.toLowerCase());show('#eu-snapshot-miss',Boolean(name)&&!key&&Boolean(towns?.length));if(!key)return null;
  const r=rates[key]||{},years=Object.keys(r).filter(y=>Number.isFinite(Number(r[y]))).sort();if(!years.length)return null;
  const y=years[years.length-1],prev=years[years.length-2],rate=Number(r[y]),change=prev?((rate-Number(r[prev]))/Number(r[prev]))*100:null;
  const rr=ratios?.[key]||{},ry=Object.keys(rr).sort().pop(),ratio=ry?Number(rr[ry]?.ratio):null;
  return{town:name.replace(/, [^,]+ County$/,''),year:y,rate,change,ratioYear:ry,ratio:Number.isFinite(ratio)?ratio:null};
}

/* ---------- Email HTML (email-safe: tables and inline styles only) ---------- */
function para(html){return `<tr><td style="padding:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${INK}">${html}</td></tr>`}
function paragraphs(text){return String(text||'').split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean).map(p=>esc(p).replace(/\n/g,'<br>'))}
function snapshotHtml(s,accent){
  const row=(k,v)=>`<tr><td style="padding:4px 12px 4px 0;font-family:${FONT};font-size:14px;color:${MUTED}">${esc(k)}</td><td style="padding:4px 0;font-family:${FONT};font-size:14px;font-weight:bold;color:${INK}">${esc(v)}</td></tr>`;
  const change=s.change==null?'':Math.abs(s.change)<0.05?word('same'):`${s.change>0?word('up'):word('down')} ${Math.abs(s.change).toFixed(1)}%`;
  const rows=[row(`${word('snapshotRate')} (${s.year})`,`$${s.rate.toFixed(3)} ${word('rateUnit')}`)];
  if(change)rows.push(row(word('snapshotChange'),change));
  if(s.ratio!=null)rows.push(row(`${word('snapshotRatio')} (${s.ratioYear})`,`${word('about')} ${Math.round(s.ratio)}%`));
  return `<tr><td style="padding:4px 0 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:1px solid ${LINE};border-left:4px solid ${accent};border-radius:8px;background:#fbfaf7"><tr><td style="padding:14px 16px"><div style="font-family:${FONT};font-size:16px;font-weight:bold;color:${INK};padding-bottom:6px">${esc(word('snapshotTitle'))} ${esc(s.town)}</div><table role="presentation" cellpadding="0" cellspacing="0" border="0">${rows.join('')}</table><div style="font-family:${FONT};font-size:12px;color:${MUTED};padding-top:8px">${esc(word('snapshotSource'))}</div></td></tr></table></td></tr>`;
}
function buttonHtml(label,url,accent){return `<tr><td style="padding:4px 0 24px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:999px;background:${accent}"><a href="${esc(url)}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:999px">${esc(label)}</a></td></tr></table></td></tr>`}
function signatureHtml(b,s,accent){
  const name=b.name||s.name,email=b.email||s.email,phone=String(b.phone||'').trim(),tel=phone.replace(/[^\d+]/g,'');
  const lines=[];if(name)lines.push(`<b style="font-size:15px;color:${INK}">${esc(name)}</b>`);if(b.company)lines.push(esc(b.company));
  const contact=[];if(phone&&tel.length>=7)contact.push(`<a href="tel:${esc(tel)}" style="color:${accent};text-decoration:none">${esc(phone)}</a>`);if(email)contact.push(`<a href="mailto:${esc(email)}" style="color:${accent};text-decoration:none">${esc(email)}</a>`);if(contact.length)lines.push(contact.join(' &middot; '));
  if(b.agent_url)lines.push(`<a href="${esc(b.agent_url)}" style="color:${accent}">${esc(word('myPage'))}</a>`);
  const photo=httpsUrl(b.photo_url),logo=httpsUrl(b.logo_url);
  const text=`<td style="font-family:${FONT};font-size:14px;line-height:1.55;color:${MUTED};vertical-align:middle">${lines.join('<br>')}</td>`;
  const pic=photo?`<td style="padding-right:14px;vertical-align:middle;width:64px"><img src="${esc(photo)}" alt="${esc(name||'')}" width="64" height="64" style="display:block;width:64px;height:64px;border-radius:50%;border:0;object-fit:cover"></td>`:'';
  const logoRow=logo?`<tr><td style="padding-top:14px"><img src="${esc(logo)}" alt="${esc(b.company||'')}" height="36" style="display:block;height:36px;width:auto;border:0"></td></tr>`:'';
  const fine=[b.license?`${word('license')} ${esc(b.license)}`:'',b.disclosure?esc(b.disclosure):''].filter(Boolean);
  const fineRow=fine.length?`<tr><td style="padding-top:12px;font-family:${FONT};font-size:12px;line-height:1.5;color:${MUTED}">${fine.join('<br>')}</td></tr>`:'';
  return `<tr><td style="padding:20px 0 0;border-top:1px solid ${LINE}"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${pic}${text}</tr></table><table role="presentation" cellpadding="0" cellspacing="0" border="0">${logoRow}${fineRow}</table></td></tr>`;
}
function emailHtml(forPreview){
  const d=fields(),b=st?.brand||{},s=sender(),accent=b.accent||'#0e2248',rows=[];
  const img=httpsUrl(d.image_url);if(img)rows.push(`<tr><td style="padding:0 0 20px"><img src="${esc(img)}" alt="${esc(d.image_alt)}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:8px"></td></tr>`);
  if(d.headline)rows.push(`<tr><td style="padding:0 0 14px;font-family:${FONT};font-size:26px;line-height:1.25;font-weight:bold;color:${INK}">${esc(d.headline)}</td></tr>`);
  if(d.greeting)rows.push(para(`${esc(word('greeting'))} ${forPreview?esc(word('sampleName')):'{{ subscriber.first_name | default: "there" }}'},`));
  paragraphs(d.body).forEach(p=>rows.push(para(p)));
  const snap=snapshot();if(snap)rows.push(snapshotHtml(snap,accent));
  const ctaUrl=httpsUrl(d.cta_url)||httpsUrl(b.agent_url);if(d.cta_label&&ctaUrl)rows.push(buttonHtml(d.cta_label,ctaUrl,accent));
  rows.push(signatureHtml(b,s,accent));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;max-width:600px;margin:0 auto">${rows.join('')}</table>`;
}
function renderPreview(){
  const d=fields(),s=sender(),frame=qs('#eu-frame');if(!frame)return;
  // content-architecture: dynamic, inbox preview mirrors the agent's own subject, preview text and sender.
  fill('pvFrom',s.name||s.email||'-');fill('pvSubject',d.subject||'-');fill('pvPreview',d.preview_text||'');
  frame.srcdoc=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>body{margin:0;padding:24px 20px;background:#fff}img{max-width:100%}</style></head><body>${emailHtml(true)}</body></html>`;
}

/* ---------- Step 4: send ---------- */
function minSchedule(){const d=new Date(Date.now()+SCHEDULE_MIN_MINUTES*60000);d.setSeconds(0,0);return d}
function localInput(d){const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`}
function blockers(){
  const d=fields(),a=audience(),w=when(),out=[];
  if(!connected())out.push('connect');else if(a.type!=='all'&&!a.id)out.push('audience');
  if(!d.subject)out.push('subject');if(!d.body)out.push('body');
  if(w!=='draft'&&!qs('#eu-consent').checked)out.push('consent');
  if(w==='later'){const t=new Date(qs('#eu-send-at').value);if(!Number.isFinite(t.getTime())||t.getTime()<Date.now()+(SCHEDULE_MIN_MINUTES-1)*60000)out.push('time')}
  return out;
}
function updateSend(){
  const btn=qs('#eu-send');if(!btn||!st)return;
  const a=audience(),w=when(),d=fields(),list=blockers();
  show('#eu-when-field',w==='later');show('#eu-consent-row',w!=='draft');
  const input=qs('#eu-send-at');input.min=localInput(minSchedule());if(w==='later'&&!input.value)input.value=localInput(new Date(minSchedule().getTime()+50*60000));
  // content-architecture: dynamic, summary and button label reflect the live audience, sender and schedule.
  const n=count.counted&&count.type===a.type&&String(count.id)===String(a.id)?count.n:null;
  fill('sumTo',[a.label||'-',n!=null?`${n.toLocaleString()} ${n===1?'person':'people'}`:''].filter(Boolean).join(' · '));
  fill('sumFrom',senderLine()||'-');fill('sumSubject',d.subject||'-');
  fill('sendLabel',w==='draft'?word('saveDraft'):w==='later'?`Schedule for ${fmtDate(input.value)||'…'}`:n!=null?`Send to ${n.toLocaleString()} ${n===1?'person':'people'}`:word('sendNow'));
  btn.disabled=list.length>0;
  const why=qs('#eu-send-blocked');why.hidden=!list.length;if(list.length){const t=qs(`[data-why="${list[0]}"]`,qs('#eu-blockers').content);why.textContent=t?t.textContent:''}
  const sent=(st.recent_broadcasts||[]).some(b=>['scheduled','sending','sent'].includes(b.status));
  stepState('send',list.length?'todo':'done',list.length?word('todo'):word('ready'));
  stepState('track',sent?'done':'todo',sent?word('done'):word('nothingYet'));
}
async function send(e){
  if(blockers().length)return updateSend();
  const a=audience(),w=when(),d=fields(),s=sender();
  if(w!=='draft'&&a.type==='all'&&!confirm(word('confirmAll')))return;
  const payload={subject:d.subject,preview_text:d.preview_text,content:emailHtml(false),target_label:a.label};
  // Kit only sends from a saved sender identity; otherwise Kit uses the account's own address.
  if(s.email&&(st.senders||[]).some(x=>x.email_address===s.email))payload.email_address=s.email;
  if(a.type!=='all'){payload.target_type=a.type;payload.target_ids=[Number(a.id)];payload.target_mode='all'}
  if(w!=='draft'){const at=w==='later'?new Date(qs('#eu-send-at').value):new Date(Date.now()+SEND_NOW_MINUTES*60000);payload.send_at=at.toISOString();payload.confirm_send=true;if(a.type==='all')payload.confirm_all_subscribers=true}
  const r=await busy(e.currentTarget,()=>gateway('broadcast.create',payload));if(!r)return;
  toast(word(w==='draft'?'toastDraft':w==='later'?'toastScheduled':'toastSent'));
  qs('#eu-consent').checked=false;clearDraft();await refresh();
  qs('.eu-step[data-step="track"]')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
}

/* ---------- Step 5: sent and scheduled ---------- */
function statusWord(b){return word(b.status)||b.status}
function paintSent(){
  const list=st?.recent_broadcasts||[],ul=qs('#eu-sent'),tpl=qs('#eu-row');ul.replaceChildren();show('#eu-sent-empty',!list.length);
  list.forEach(b=>{
    const li=tpl.content.firstElementChild.cloneNode(true),r=k=>qs(`[data-r="${k}"]`,li),t=b.target_definition||{};
    // content-architecture: dynamic, one row per broadcast with live status and Kit stats.
    r('subject').textContent=b.subject||'-';const pill=r('status');pill.textContent=statusWord(b);pill.dataset.status=b.status;
    const to=t.label||(t.all_subscribers?word('everyone'):t.type==='tag'?'A tag':t.type==='segment'?'A segment':'');
    const whenText=b.status==='scheduled'?`${word('scheduled')} ${fmtDate(b.send_at)}`:b.status==='sent'||b.status==='sending'?fmtDate(b.send_at||b.created_at):fmtDate(b.created_at);
    r('meta').textContent=[whenText,to].filter(Boolean).join(' · ');
    if(b.stats){r('stats').hidden=false;r('recipients').textContent=Number(b.stats.recipients||0).toLocaleString();r('opens').textContent=pct(b.stats.open_rate);r('clicks').textContent=pct(b.stats.click_rate);r('unsubs').textContent=Number(b.stats.unsubscribes||0).toLocaleString()}
    const cancelable=b.status==='draft'||(b.status==='scheduled'&&new Date(b.send_at).getTime()>Date.now()+60000);
    const cancel=r('cancel');cancel.hidden=!cancelable;r('cancelLabel').textContent=b.status==='draft'?word('deleteDraft'):word('cancelSend');
    cancel.addEventListener('click',async ev=>{if(!confirm(word('confirmCancel')))return;const ok=await busy(ev.currentTarget,()=>gateway('broadcast.cancel',{broadcast_id:b.id}));if(ok){toast(word('toastCanceled'));await refresh()}});
    ul.append(li);
  });
}
async function refreshStats(btn,quiet){if(!connected())return;const r=await busy(btn,()=>gateway('broadcast.refresh'));if(r){st.recent_broadcasts=r.recent_broadcasts||[];paintSent();updateSend();if(!quiet)toast(word('toastRefreshed'))}}
function statsStale(){return(st?.recent_broadcasts||[]).some(b=>(b.status==='sending'||b.status==='sent'||(b.status==='scheduled'&&new Date(b.send_at).getTime()<Date.now()))&&(!b.stats_synced_at||Date.now()-new Date(b.stats_synced_at).getTime()>15*60000))}

/* ---------- Load ---------- */
async function refresh(){st=await gateway('email.status');paintConnection();paintAudience();paintSig();paintSent();renderPreview();updateSend()}
function wire(root){
  qs('#eu-connect-form',root).addEventListener('submit',connectKit);
  qs('#eu-sender-form',root).addEventListener('submit',saveSender);
  qs('#eu-sender-edit',root).addEventListener('click',editSender);
  qs('#eu-sender-cancel',root).addEventListener('click',()=>{qs('#eu-sender-form').hidden=true});
  qs('#eu-disconnect',root).addEventListener('click',disconnect);
  qsa('input[name="audience"]',root).forEach(r=>r.addEventListener('change',()=>{paintAudience();countAudience()}));
  ['#eu-tag','#eu-segment'].forEach(s=>qs(s,root).addEventListener('change',()=>{paintAudience();countAudience()}));
  qs('#eu-reconcile',root).addEventListener('click',reconcile);
  qsa('.eu-starter',root).forEach(b=>b.addEventListener('click',()=>useStarter(b.dataset.starter)));
  qs('#eu-start-over',root).addEventListener('click',clearDraft);
  const f=qs('#eu-write',root);f.addEventListener('input',onEdit);f.addEventListener('change',onEdit);f.addEventListener('submit',ev=>ev.preventDefault());
  qs('#eu-snapshot',root).addEventListener('toggle',ev=>{if(ev.currentTarget.open)loadTowns().then(onEdit)});
  qsa('.eu-seg button',root).forEach(b=>b.addEventListener('click',()=>{qsa('.eu-seg button').forEach(x=>{const on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-pressed',String(on))});qs('.eu-preview').classList.toggle('phone',b.dataset.size==='phone')}));
  qsa('input[name="when"]',root).forEach(r=>r.addEventListener('change',updateSend));
  qs('#eu-send-at',root).addEventListener('input',updateSend);qs('#eu-consent',root).addEventListener('change',updateSend);
  qs('#eu-send',root).addEventListener('click',send);
  qs('#eu-refresh',root).addEventListener('click',ev=>refreshStats(ev.currentTarget,false));
  qsa('[data-route]',root).forEach(a=>a.setAttribute('href',route(a.dataset.route)));
}
async function start(ctx){
  if(!ctx?.user)throw new Error('Sign in required');user=ctx.user;
  client=window.NJPTRAccess?.client?.();if(!client)throw new Error('Watchdog data client unavailable');
  qsa('[data-w]',qs('#eu-words').content).forEach(n=>{words[n.dataset.w]=n.textContent.trim()});
  const page=qs('#eu-page').content.cloneNode(true);wire(page);qs('#eu-app').replaceChildren(page);
  restoreDraft();fill('subjectCount',String(form().elements.subject.value.length));
  await refresh();
  if(connected()){await loadCatalog();countAudience();if(statsStale())refreshStats(null,true)}
  onEdit();
}
const ready=window.njptrAccessReady||Promise.reject(new Error('Access info did not initialize'));
Promise.resolve(ready).then(start).catch(err=>{
  if(window.WatchdogAgentSafety)window.WatchdogAgentSafety.report('email-updates-start',err);
  const h=qs('#eu-app'),t=qs('#eu-fail');if(!h||!t)return;
  const box=t.content.cloneNode(true);qs('[data-f="message"]',box).textContent=safe(err,'email-updates-start');
  qs('[data-reload]',box).addEventListener('click',()=>location.reload());
  h.replaceChildren(box);
});
})();
