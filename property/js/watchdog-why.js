(function(){
'use strict';

const $=(s,r=document)=>r.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function client(){
  try{
    const access=window.NJPTRAccess?.client?.();
    if(access)return access;
  }catch(_){}
  try{
    const dashboard=window.NJDashboard?.client?.();
    if(dashboard)return dashboard;
  }catch(_){}
  return null;
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
  panel.innerHTML=`<header class="wdwhy-head"><div><span>WATCHDOG INTELLIGENCE</span><h2 id="wdwhy-title">Why Watchdog flagged this</h2><p>${esc(address||'Property review')}</p></div><button type="button" class="wdwhy-close" aria-label="Close"><i class="fas fa-xmark"></i></button></header><div class="wdwhy-body" id="wdwhy-body"><div class="wdwhy-loading"><i class="fas fa-circle-notch fa-spin"></i><b>Resolving governed evidence</b><span>Watchdog is checking the current property record and deterministic model.</span></div></div>`;
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
  const line=e?.lineage||{},norm=e?.normalization||{},url=safeUrl(e?.source_url),meta=[];
  if(e?.source_key)meta.push(`Source ${esc(e.source_key)}`);
  if(e?.observed_at)meta.push(`Observed ${esc(dateLabel(e.observed_at))}`);
  if(norm?.feature_version!=null)meta.push(`Feature v${esc(norm.feature_version)}`);
  if(norm?.transform_type)meta.push(esc(norm.transform_type));
  if(line?.provider_kind)meta.push(esc(line.provider_kind));
  if(line?.engine_version)meta.push(esc(line.engine_version));
  const deps=Array.isArray(line?.dependencies)?line.dependencies:[];
  return `<article class="wdwhy-evidence ${derived?'derived':''}"><div><b>${esc(e.signal_id)}</b><span>${derived?'Watchdog-derived':'Source fact'}</span></div><strong>Normalized ${esc(e.score)} / 100${e.value!=null?` · source value ${esc(e.value)}`:''}</strong>${meta.length?`<small>${meta.join(' · ')}</small>`:''}${e?.explanation?`<p>${esc(e.explanation)}</p>`:''}${line?.formula?`<code>${esc(line.formula)}</code>`:''}${deps.length?`<small>Depends on ${deps.map(esc).join(', ')}</small>`:''}${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Inspect source <i class="fas fa-arrow-up-right-from-square"></i></a>`:''}</article>`;
}

function renderError(message,status){
  const host=$('#wdwhy-body');
  if(!host)return;
  const upgrade=status===403;
  host.innerHTML=`<div class="wdwhy-error"><i class="fas ${upgrade?'fa-lock':'fa-triangle-exclamation'}"></i><h3>${upgrade?'Pro Intelligence required':'Watchdog could not complete this review'}</h3><p>${esc(message||'The governed Intelligence service is unavailable for this property right now.')}</p>${upgrade?'<a href="/property/pro#plans">Compare Pro plans</a>':'<button type="button" data-wdwhy-close>Close</button>'}</div>`;
  $('[data-wdwhy-close]',host)?.addEventListener('click',close);
}

async function propertyContext(sb,pin,existing){
  if(existing&&(existing.municipality||existing.county||existing.property_class))return existing;
  try{
    const r=await sb.functions.invoke('intelligence-property-context',{body:{pams_pins:[pin]}});
    return r.error?existing||{}:r.data?.contexts?.[pin]||existing||{};
  }catch(_){return existing||{};}
}

function render(data,context){
  const host=$('#wdwhy-body');
  if(!host)return;
  const f=Array.isArray(data?.findings)?data.findings[0]:null;
  if(!f){
    host.innerHTML='<div class="wdwhy-empty"><i class="fas fa-circle-check"></i><h3>No evidence-backed Assessment finding</h3><p>The current governed evidence did not produce a review finding for this property. Watchdog is not filling the gap with a guess.</p></div>';
    return;
  }
  const evidence=Array.isArray(f.evidence)?f.evidence:[],facts=evidence.filter(e=>!isDerived(e)),derived=evidence.filter(isDerived),missing=Array.isArray(f.missing_evidence)?f.missing_evidence:[],why=Array.isArray(f.why_now)?f.why_now:[],ctx=context||f.property_context||{},model=data?.model||{};
  host.innerHTML=`
    <div class="wdwhy-scoreline"><div><b>${Math.round(Number(f.score||0))}</b><span>review score</span></div><div><b>${Math.round(Number(f.confidence||0))}%</b><span>confidence</span></div><div><b>${Math.round(Number(f.evidence_coverage||0))}%</b><span>evidence</span></div></div>
    <div class="wdwhy-context">${[ctx.municipality,ctx.county?`${ctx.county} County`:null,ctx.property_class?`Class ${ctx.property_class}`:null].filter(Boolean).map(x=>`<span>${esc(x)}</span>`).join('')}</div>
    <section class="wdwhy-callout"><b>Review finding, not a determination</b><p>Watchdog ranked current governed evidence for professional review. It is not a valuation, legal conclusion, seller prediction, or guaranteed outcome.</p>${why.length?`<ul>${why.map(w=>`<li><b>${esc(w.signal_id)}</b>${w.explanation?` · ${esc(w.explanation)}`:''}</li>`).join('')}</ul>`:''}</section>
    ${facts.length?`<section class="wdwhy-section"><h3>Factual evidence</h3><div class="wdwhy-grid">${facts.map(e=>evidenceCard(e,false)).join('')}</div></section>`:''}
    ${derived.length?`<section class="wdwhy-section"><h3>Watchdog-derived intelligence</h3><p>Calculated from governed source facts. Derived signals are not source records themselves.</p><div class="wdwhy-grid">${derived.map(e=>evidenceCard(e,true)).join('')}</div></section>`:''}
    <section class="wdwhy-section"><h3>Missing evidence</h3>${missing.length?`<div class="wdwhy-grid">${missing.map(e=>`<article class="wdwhy-evidence missing"><b>${esc(e.signal_id)}</b><strong>${esc(e.reason||'Evidence unavailable')}</strong>${e?.source_key?`<small>Expected source ${esc(e.source_key)}</small>`:''}${e?.normalization?.detail?.reason?`<p>${esc(e.normalization.detail.reason)}</p>`:''}</article>`).join('')}</div>`:'<p class="wdwhy-complete"><i class="fas fa-circle-check"></i> No required model evidence is missing for this finding.</p>'}</section>
    <section class="wdwhy-lineage"><h3>Model and lineage</h3><dl><div><dt>Model</dt><dd>${esc(model.label||model.key||'Assessment Anomaly')} v${esc(model.version||'?')}</dd></div><div><dt>State</dt><dd>${esc(model.status||'preview')} · ${esc(model.calibration_state||'uncalibrated')}</dd></div><div><dt>Scoring engine</dt><dd>${esc(data?.engine_version||'not reported')}</dd></div><div><dt>Pipeline</dt><dd>${esc(data?.pipeline_engine||'not reported')}</dd></div><div><dt>Derived runtime</dt><dd>${esc(data?.derived?.engine_version||'not used')}</dd></div><div><dt>Normalization</dt><dd>${esc(data?.normalization?.engine_version||'not reported')}</dd></div><div><dt>Facts hash</dt><dd><code>${esc(String(f.facts_hash||'not reported').slice(0,24))}${f.facts_hash?'…':''}</code></dd></div></dl></section>
    <div class="wdwhy-footer"><a href="/property/data-workbench">Open Data Workbench</a><button type="button" data-wdwhy-close>Close</button></div>`;
  $('[data-wdwhy-close]',host)?.addEventListener('click',close);
}

async function open(options){
  const pin=String(options?.pamsPin||options?.pams_pin||'').trim(),address=String(options?.address||'').trim();
  shell(address||pin||'Property review');
  if(!pin){renderError('This property does not have a governed PAMS PIN available for Intelligence review.',400);return;}
  const sb=client();
  if(!sb){renderError('Your signed-in Watchdog session is not available on this page.',401);return;}
  try{
    const r=await sb.functions.invoke('intelligence-assessment-run-preview',{body:{model_key:'assessment_anomaly',scope_type:'property',scope_value:{source:'watchdog_why',surface:String(options?.surface||'unknown').slice(0,80)},pams_pins:[pin],limit:1}});
    if(r.error){
      const status=Number(r.error?.context?.status||r.error?.status||0);
      throw Object.assign(new Error(r.error?.message||'The governed Intelligence service could not complete this review.'),{status});
    }
    const finding=Array.isArray(r.data?.findings)?r.data.findings[0]:null;
    const context=await propertyContext(sb,pin,finding?.property_context||{});
    render(r.data,context);
    window.dispatchEvent(new CustomEvent('watchdog:why-opened',{detail:{surface:options?.surface||'unknown',pams_pin:pin,model_key:r.data?.model?.key||'assessment_anomaly'}}));
  }catch(e){renderError(e?.message||'The governed Intelligence service could not complete this review.',Number(e?.status||0));}
}

function delegated(e){
  const trigger=e.target.closest('[data-watchdog-why]');
  if(!trigger)return;
  e.preventDefault();
  e.stopPropagation();
  open({pamsPin:trigger.dataset.pamsPin,address:trigger.dataset.address,surface:trigger.dataset.surface||document.body?.dataset?.sidebarPage||location.pathname});
}

document.addEventListener('click',delegated);
window.WatchdogWhy={open,close};
})();
