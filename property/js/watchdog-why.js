(function(){
'use strict';

const $=(s,r=document)=>r.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const FALLBACK_URL='https://uvkvaxljhhngydvlrzom.supabase.co';
const FALLBACK_KEY='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
let fallbackClient=null;
let installTimer=null;

/* Plain-English layer: the drawer leads with a short, readable finding and
   keeps the governed signal ids and formula lineage in "Technical details". */
function ensurePlain(){
  if(window.WatchdogPlain)return Promise.resolve();
  return new Promise(resolve=>{
    let s=document.querySelector('script[data-watchdog-plain]');
    if(!s){s=document.createElement('script');s.src='/property/js/watchdog-plain-language.js?v=20260928a';s.dataset.watchdogPlain='true';document.head.appendChild(s);}
    s.addEventListener('load',()=>resolve(),{once:true});s.addEventListener('error',()=>resolve(),{once:true});
    setTimeout(resolve,4000);
  });
}

function ensureCss(){
  if(document.querySelector('link[data-watchdog-why-css]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='/property/css/watchdog-why.css';
  link.dataset.watchdogWhyCss='true';
  document.head.appendChild(link);
}

function client(){
  try{
    const access=window.NJPTRAccess?.client?.();
    if(access)return access;
  }catch(_){}
  try{
    const dashboard=window.NJDashboard?.client?.();
    if(dashboard)return dashboard;
  }catch(_){}
  if(fallbackClient)return fallbackClient;
  if(!window.supabase?.createClient)return null;
  fallbackClient=window.supabase.createClient(FALLBACK_URL,FALLBACK_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:'sb-uvkvaxljhhngydvlrzom-auth-token'}});
  return fallbackClient;
}

function safeUrl(value){
  try{
    const u=new URL(String(value||''),location.origin);
    return /^https?:$/.test(u.protocol)?u.href:'';
  }catch(_){return'';}
}

function dateLabel(value){
  if(!value)return'';
  const d=new Date(value);
  if(!Number.isFinite(d.getTime()))return'';
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
}

function close(){
  document.getElementById('wdwhy-backdrop')?.remove();
  document.getElementById('wdwhy-panel')?.remove();
  document.body.classList.remove('wdwhy-open');
}

function shell(address){
  close();
  const backdrop=document.createElement('div'),panel=document.createElement('aside');
  backdrop.id='wdwhy-backdrop';
  backdrop.className='wdwhy-backdrop';
  panel.id='wdwhy-panel';
  panel.className='wdwhy-panel';
  panel.setAttribute('role','dialog');
  panel.setAttribute('aria-modal','true');
  panel.setAttribute('aria-labelledby','wdwhy-title');
  panel.innerHTML=`<header class="wdwhy-head"><div><span>WATCHDOG INTELLIGENCE</span><h2 id="wdwhy-title">Why Watchdog flagged this</h2><p>${esc(address||'Property review')}</p></div><button type="button" class="wdwhy-close" aria-label="Close"><i class="fas fa-xmark"></i></button></header><div class="wdwhy-body" id="wdwhy-body"><div class="wdwhy-loading"><i class="fas fa-circle-notch fa-spin"></i><b>Checking the evidence</b><span>Watchdog is reviewing the current property record.</span></div></div>`;
  document.body.append(backdrop,panel);
  document.body.classList.add('wdwhy-open');
  backdrop.onclick=close;
  $('.wdwhy-close',panel).onclick=close;
  document.addEventListener('keydown',escapeOnce,{once:true});
}

function escapeOnce(e){if(e.key==='Escape')close();}

function isDerived(e){
  const kind=String(e?.lineage?.provider_kind||'').toLowerCase();
  return !!e?.lineage?.formula||kind.includes('derived')||kind.includes('formula');
}

function evidenceCard(e,derived){
  const url=safeUrl(e?.source_url),meta=[];
  if(e?.observed_at)meta.push(`Observed ${esc(dateLabel(e.observed_at))}`);
  return `<article class="wdwhy-evidence ${derived?'derived':''}"><div><b>${esc(e.signal_id)}</b><span>${derived?'Watchdog calculation':'Source fact'}</span></div><strong>Evidence score ${esc(e.score)} / 100${e.value!=null?` · source value ${esc(e.value)}`:''}</strong>${meta.length?`<small>${meta.join(' · ')}</small>`:''}${e?.explanation?`<p>${esc(e.explanation)}</p>`:''}${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">View source <i class="fas fa-arrow-up-right-from-square"></i></a>`:''}</article>`;
}

function renderError(message,status){
  const host=$('#wdwhy-body');
  if(!host)return;
  const upgrade=status===403;
  host.innerHTML=`<div class="wdwhy-error"><i class="fas ${upgrade?'fa-lock':'fa-triangle-exclamation'}"></i><h3>${upgrade?'Pro Intelligence required':'Watchdog could not complete this review'}</h3><p>${esc(message||'Watchdog Intelligence is unavailable for this property right now.')}</p>${upgrade?'<a href="/property/pro#plans">Compare Pro plans</a>':'<button type="button" data-wdwhy-close>Close</button>'}</div>`;
  $('[data-wdwhy-close]',host)?.addEventListener('click',close);
}

async function resolvePin(sb,pin,address){
  if(pin)return pin;
  if(!address)return'';
  try{
    const {data,error}=await sb.from('saved_properties').select('pams_pin').eq('address',address).not('pams_pin','is',null).limit(1).maybeSingle();
    if(error)return'';
    return String(data?.pams_pin||'').trim();
  }catch(_){return'';}
}

async function propertyContext(sb,pin,existing){
  if(existing&&(existing.municipality||existing.county||existing.property_class))return existing;
  try{
    const r=await sb.functions.invoke('intelligence-property-context',{body:{pams_pins:[pin]}});
    return r.error?existing||{}:r.data?.contexts?.[pin]||existing||{};
  }catch(_){return existing||{};}
}

function plainRow(e){
  const P=window.WatchdogPlain,p=P?P.signal(e):{label:e?.signal_id,value:'',why:''},url=safeUrl(e?.source_url);
  const when=e?.observed_at?`Checked ${esc(dateLabel(e.observed_at))}`:'';
  return `<li class="wdwhy-fact"><div><b>${esc(p.label)}</b>${p.value?`<span>${esc(p.value)}</span>`:''}${p.why?`<small>${esc(p.why)}</small>`:''}</div><div class="wdwhy-fact-meta">${isDerived(e)?'<em>Watchdog calculation</em>':'<em>Public record</em>'}${when?`<small>${when}</small>`:''}${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Source <i class="fas fa-arrow-up-right-from-square"></i></a>`:''}</div></li>`;
}

function missingRow(e){
  const P=window.WatchdogPlain,m=P?P.missing(e):{label:e?.signal_id,reason:e?.reason||'Evidence unavailable'};
  return `<li class="wdwhy-fact missing"><div><b>${esc(m.label)}</b><small>${esc(m.reason)}</small></div></li>`;
}

function render(data,context){
  const host=$('#wdwhy-body');
  if(!host)return;
  const f=Array.isArray(data?.findings)?data.findings[0]:null;
  if(!f){
    host.innerHTML='<div class="wdwhy-empty"><i class="fas fa-circle-check"></i><h3>Nothing flagged</h3><p>Watchdog checked the current public record and did not find anything that needs a closer look. It never fills missing records with a guess.</p></div>';
    return;
  }
  const evidence=Array.isArray(f.evidence)?f.evidence:[],facts=evidence.filter(e=>!isDerived(e)),derived=evidence.filter(isDerived),missing=Array.isArray(f.missing_evidence)?f.missing_evidence:[],why=Array.isArray(f.why_now)?f.why_now:[],ctx=context||f.property_context||{},model=data?.model||{};
  const modelLabel=String(model.label||model.key||'Assessment review').trim();
  const modelVersion=model.version?` v${esc(model.version)}`:'';
  const modelStatus=String(model.status||'').toLowerCase()==='preview'?' · Preview':'';
  const sum=window.WatchdogPlain?window.WatchdogPlain.summary(f):{headline:'Review finding',text:'',priority:'',score:Math.round(Number(f.score||0)),confidence:Math.round(Number(f.confidence||0)),coverage:Math.round(Number(f.evidence_coverage||0)),confidenceLevel:''};
  const ordered=window.WatchdogPlain?.order?window.WatchdogPlain.order(f):evidence;
  host.innerHTML=`
    <section class="wdwhy-plain"><span class="wdwhy-plain-kicker">The short version</span><h3>${esc(sum.headline)}</h3>${sum.text?`<p>${esc(sum.text)}</p>`:''}
      <div class="wdwhy-plain-chips"><span><b>${esc(sum.priority||'')}</b> priority · ${sum.score}/100</span><span><b>${esc(sum.confidenceLevel?sum.confidenceLevel.charAt(0).toUpperCase()+sum.confidenceLevel.slice(1):'')}</b> confidence · ${sum.confidence}%</span><span>${sum.coverage}% of evidence checked</span></div>
    </section>
    <div class="wdwhy-context">${[ctx.municipality,ctx.county?`${ctx.county} County`:null,ctx.property_class?`Class ${ctx.property_class}`:null].filter(Boolean).map(x=>`<span>${esc(x)}</span>`).join('')}</div>
    ${ordered.length?`<section class="wdwhy-section"><h3>What Watchdog checked</h3><ul class="wdwhy-facts">${ordered.map(plainRow).join('')}</ul></section>`:''}
    ${missing.length?`<section class="wdwhy-section"><h3>What Watchdog couldn't check</h3><ul class="wdwhy-facts">${missing.map(missingRow).join('')}</ul></section>`:''}
    <p class="wdwhy-disclaimer">This is a review flag from public records, not a valuation, legal opinion or guaranteed outcome.</p>
    <details class="wdwhy-tech"><summary>Technical details</summary>
      ${why.length?`<ul class="wdwhy-why">${why.map(w=>`<li><b>${esc(w.signal_id)}</b>${w.explanation?` · ${esc(w.explanation)}`:''}</li>`).join('')}</ul>`:''}
      ${facts.length?`<section class="wdwhy-section"><h3>Source evidence</h3><div class="wdwhy-grid">${facts.map(e=>evidenceCard(e,false)).join('')}</div></section>`:''}
      ${derived.length?`<section class="wdwhy-section"><h3>Watchdog calculations</h3><div class="wdwhy-grid">${derived.map(e=>evidenceCard(e,true)).join('')}</div></section>`:''}
      ${missing.length?`<section class="wdwhy-section"><h3>Missing evidence</h3><div class="wdwhy-grid">${missing.map(e=>`<article class="wdwhy-evidence missing"><b>${esc(e.signal_id)}</b><strong>${esc(e.reason||'Evidence unavailable')}</strong>${e?.normalization?.detail?.reason?`<p>${esc(e.normalization.detail.reason)}</p>`:''}</article>`).join('')}</div></section>`:''}
      <section class="wdwhy-lineage"><h3>Method</h3><p>${esc(modelLabel)}${modelVersion}${modelStatus}</p></section>
    </details>
    <div class="wdwhy-footer"><a href="/data-workbench">Open Data Workbench</a><button type="button" data-wdwhy-close>Close</button></div>`;
  $('[data-wdwhy-close]',host)?.addEventListener('click',close);
}

async function open(options){
  let pin=String(options?.pamsPin||options?.pams_pin||'').trim();
  const address=String(options?.address||'').trim();
  shell(address||pin||'Property review');
  const sb=client();
  if(!sb){renderError('Your signed-in Watchdog session is not available on this page.',401);return;}
  pin=await resolvePin(sb,pin,address);
  if(!pin){renderError('Watchdog could not match this saved property to a parcel record.',400);return;}
  try{
    const r=await sb.functions.invoke('intelligence-assessment-run-preview',{body:{model_key:'assessment_anomaly',scope_type:'property',scope_value:{source:'watchdog_why',surface:String(options?.surface||'unknown').slice(0,80)},pams_pins:[pin],limit:1}});
    if(r.error){
      const status=Number(r.error?.context?.status||r.error?.status||0);
      throw Object.assign(new Error(r.error?.message||'Watchdog Intelligence could not complete this review.'),{status});
    }
    const finding=Array.isArray(r.data?.findings)?r.data.findings[0]:null;
    const [context]=await Promise.all([propertyContext(sb,pin,finding?.property_context||{}),ensurePlain()]);
    render(r.data,context);
    window.dispatchEvent(new CustomEvent('watchdog:why-opened',{detail:{surface:options?.surface||'unknown',pams_pin:pin,model_key:r.data?.model?.key||'assessment_anomaly'}}));
  }catch(e){renderError(e?.message||'Watchdog Intelligence could not complete this review.',Number(e?.status||0));}
}

function triggerHtml(address,pin,surface,label,cls){
  const button=document.createElement('button');
  button.type='button';
  button.className=cls||'wdwhy-trigger';
  button.dataset.watchdogWhy='true';
  button.dataset.address=address||'';
  button.dataset.pamsPin=pin||'';
  button.dataset.surface=surface||location.pathname;
  button.innerHTML=`<i class="fas fa-dog"></i> ${esc(label||'Why Watchdog?')}`;
  return button;
}

function pinFromHref(href){
  try{return new URL(href,location.origin).searchParams.get('pin')||'';}catch(_){return'';}
}

function installDashboard(){
  document.querySelectorAll('.pr-item').forEach(item=>{
    const actions=item.querySelector('.pr-card-actions');
    if(!actions||actions.querySelector('[data-watchdog-why]'))return;
    const address=String(item.querySelector('.pr-card h3')?.textContent||'').trim();
    if(!address)return;
    actions.appendChild(triggerHtml(address,'','dashboard','Why Watchdog?','wdwhy-menu-trigger'));
  });
  document.querySelectorAll('.cmp3 .ch').forEach(cell=>{
    if(cell.querySelector('[data-watchdog-why]'))return;
    const address=String(cell.querySelector('b')?.textContent||'').trim();
    if(!address)return;
    cell.appendChild(triggerHtml(address,'','compare','Why Watchdog?','wdwhy-compare-trigger'));
  });
}

/* Agent Control opens this review from inside its Evidence drawer (agent-desk.js)
   instead of adding a second button to every worklist row. */
function installSurfaceButtons(){
  const page=String(document.body?.dataset?.sidebarPage||'');
  if(page==='dashboard')installDashboard();
}

function scheduleInstall(){
  clearTimeout(installTimer);
  installTimer=setTimeout(installSurfaceButtons,60);
}

function delegated(e){
  const trigger=e.target.closest('[data-watchdog-why]');
  if(!trigger)return;
  e.preventDefault();
  e.stopPropagation();
  open({pamsPin:trigger.dataset.pamsPin,address:trigger.dataset.address,surface:trigger.dataset.surface||document.body?.dataset?.sidebarPage||location.pathname});
}

ensureCss();
document.addEventListener('click',delegated);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installSurfaceButtons,{once:true});else installSurfaceButtons();
new MutationObserver(scheduleInstall).observe(document.documentElement,{childList:true,subtree:true});
window.WatchdogWhy={open,close,install:installSurfaceButtons};
})();