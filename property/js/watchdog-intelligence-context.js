(function(){
'use strict';

var PROD_URL='https://uvkvaxljhhngydvlrzom.supabase.co';
var PROD_KEY='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
var CACHE_MS=120000;
var state={client:null,lastKey:'',lastAt:0,lastData:null,timer:null,running:false};

function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function uniq(values){return Array.from(new Set((values||[]).map(function(v){return String(v||'').trim();}).filter(Boolean)));}
function clamp(n,min,max){n=Number(n||0);return Math.max(min,Math.min(max,n));}
function surface(){
  var page=String(document.body&&document.body.dataset&&document.body.dataset.sidebarPage||'').trim();
  if(page==='agent-desk')return'agent_control';
  if(page==='dashboard')return'dashboard';
  if(page==='home')return'home';
  if(location.pathname.indexOf('/data-workbench')>=0)return'data_workbench';
  return page||location.pathname.replace(/^\/|\/$/g,'').replace(/\//g,'_')||'unknown';
}
function client(){
  if(state.client)return state.client;
  try{var a=window.NJPTRAccess&&window.NJPTRAccess.client&&window.NJPTRAccess.client();if(a){state.client=a;return a;}}catch(_e){}
  try{var d=window.NJDashboard&&window.NJDashboard.client&&window.NJDashboard.client();if(d){state.client=d;return d;}}catch(_e){}
  if(!window.supabase||!window.supabase.createClient)return null;
  var cfg=window.WatchdogIntelligenceConfig||{};
  var url=String(cfg.supabaseUrl||PROD_URL),key=String(cfg.publishableKey||PROD_KEY);
  state.client=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:String(cfg.storageKey||'sb-uvkvaxljhhngydvlrzom-auth-token')}});
  return state.client;
}
function pinFromHref(href){try{return new URL(href,location.origin).searchParams.get('pin')||'';}catch(_e){return'';}}
function pinsFromDom(){
  var out=[];
  var queryPin=new URLSearchParams(location.search).get('pin');if(queryPin)out.push(queryPin);
  document.querySelectorAll('[data-row]').forEach(function(el){if(el.dataset.row)out.push(el.dataset.row);});
  document.querySelectorAll('a[href*="pin="]').forEach(function(a){var p=pinFromHref(a.getAttribute('href')||'');if(p)out.push(p);});
  var switcher=document.getElementById('hm-switch');if(switcher&&switcher.value&&/^\d{4}_.+/.test(switcher.value))out.push(switcher.value);
  return uniq(out).filter(function(p){return /^\d{4}_.+/.test(p);}).slice(0,100);
}
async function savedPins(sb){
  try{
    var res=await sb.from('saved_properties').select('pams_pin').not('pams_pin','is',null).limit(100);
    if(res.error)return[];
    return uniq((res.data||[]).map(function(r){return r.pams_pin;})).filter(function(p){return /^\d{4}_.+/.test(p);});
  }catch(_e){return[];}
}
async function contextFromPage(){
  var s=surface(),pins=pinsFromDom(),scope='custom';
  if(s==='home')scope='property';
  if(s==='dashboard'&&!pins.length){var sb=client();if(sb)pins=await savedPins(sb);}
  if(pins.length===1)scope='property';
  return{surface:s,scope_type:scope,pams_pins:pins,context_key:s+':'+pins.slice().sort().join('|'),limit:s==='agent_control'?30:12};
}
function keyFor(ctx){return[ctx.surface,ctx.scope_type,(ctx.pams_pins||[]).slice().sort().join(','),ctx.limit||''].join('|');}
function hostFor(s){
  if(s==='dashboard')return document.getElementById('db-panel-main');
  if(s==='home')return document.getElementById('hm-body')&&document.getElementById('hm-body').parentNode;
  if(s==='agent_control')return document.getElementById('ad-app');
  if(s==='data_workbench')return document.querySelector('.dw-shell,.workbench-shell,main');
  return null;
}
function ensureCss(){if(document.querySelector('link[data-wdcx-css]'))return;var l=document.createElement('link');l.rel='stylesheet';l.href='/property/css/watchdog-intelligence-context.css';l.dataset.wdcxCss='true';document.head.appendChild(l);}
function mount(s){
  var existing=document.getElementById('wdcx-root');if(existing)return existing;
  var host=hostFor(s);if(!host)return null;
  var root=document.createElement('section');root.id='wdcx-root';root.className='wdcx-root wdcx-'+s;root.setAttribute('aria-live','polite');
  if(s==='dashboard'){var brief=document.getElementById('db-brief');host.insertBefore(root,brief||host.firstChild);}
  else if(s==='home'){var body=document.getElementById('hm-body');host.insertBefore(root,body||host.firstChild);}
  else if(s==='agent_control'){var overview=host.querySelector('.ad-overview');if(overview&&overview.nextSibling)host.insertBefore(root,overview.nextSibling);else host.insertBefore(root,host.firstChild);}
  else host.insertBefore(root,host.firstChild);
  return root;
}
function bandLabel(b){return b==='act_now'?'Act now':b==='this_week'?'This week':'Watch';}
function modelIcon(k){return k==='property_change_priority'?'fa-arrows-rotate':k==='closing_review'?'fa-file-circle-check':'fa-chart-line';}
function summarySentence(data){
  var s=data.summary||{},parts=[];
  if(s.act_now)parts.push(s.act_now+' act now');
  if(s.this_week)parts.push(s.this_week+' this week');
  if(s.watch)parts.push(s.watch+' watching');
  return parts.length?parts.join(' · '):'No evidence-backed suggestions need attention right now.';
}
function render(data,ctx){
  var root=mount(ctx.surface);if(!root)return;
  var suggestions=Array.isArray(data&&data.suggestions)?data.suggestions:[];
  if(!suggestions.length){root.innerHTML='';root.hidden=true;return;}
  root.hidden=false;
  var top=suggestions.slice(0,ctx.surface==='agent_control'?5:3);
  root.innerHTML='<div class="wdcx-head"><div><span>WATCHDOG INTELLIGENCE</span><h2>What deserves attention here</h2><p>'+esc(summarySentence(data))+'</p></div><button type="button" class="wdcx-toggle" aria-expanded="true">Hide</button></div><div class="wdcx-items">'+top.map(function(item){return'<article class="wdcx-item" data-wdcx-id="'+esc(item.suggestion_id)+'"><div class="wdcx-score"><b>'+Math.round(clamp(item.score,0,100))+'</b><span>'+esc(bandLabel(item.attention_band))+'</span></div><div class="wdcx-copy"><div class="wdcx-model"><i class="fas '+modelIcon(item.model_key)+'"></i>'+esc(item.model_label)+'</div><h3>'+esc(item.property_address||item.pams_pin||'Property review')+'</h3><p>'+esc(item.why_now)+'</p><div class="wdcx-meta"><span>'+Math.round(clamp(item.confidence,0,100))+'% confidence</span><span>'+Math.round(clamp(item.evidence_coverage,0,100))+'% evidence</span>'+(item.limited_evidence?'<span>Limited evidence</span>':'')+'</div></div><div class="wdcx-actions"><button type="button" data-wdcx-open="'+esc(item.suggestion_id)+'">Why Watchdog?</button>'+(item.pams_pin?'<a href="/property/home?pin='+encodeURIComponent(item.pams_pin)+'">Open property</a>':'')+'</div></article>';}).join('')+'</div>'+(suggestions.length>top.length?'<button type="button" class="wdcx-more">+'+(suggestions.length-top.length)+' more current suggestions</button>':'');
  var toggle=root.querySelector('.wdcx-toggle');if(toggle)toggle.onclick=function(){var items=root.querySelector('.wdcx-items'),more=root.querySelector('.wdcx-more'),expanded=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',expanded?'false':'true');toggle.textContent=expanded?'Show':'Hide';if(items)items.hidden=expanded;if(more)more.hidden=expanded;};
  root.querySelectorAll('[data-wdcx-open]').forEach(function(btn){btn.onclick=function(){var id=btn.dataset.wdcxOpen,item=suggestions.find(function(x){return x.suggestion_id===id;});if(item)openDrawer(item);};});
  var more=root.querySelector('.wdcx-more');if(more)more.onclick=function(){openQueue(suggestions);};
}
function evidenceTitle(e){return e&&e.signal_id?e.signal_id:'Governed evidence';}
function evidenceCard(e){
  var line=e&&e.lineage||{},meta=[];if(e&&e.source_key)meta.push('Source '+e.source_key);if(e&&e.observed_at)meta.push('Observed '+new Date(e.observed_at).toLocaleDateString());if(line.engine_version)meta.push(line.engine_version);
  return'<article class="wdcx-evidence"><b>'+esc(evidenceTitle(e))+'</b><strong>'+(e&&e.score!=null?'Normalized '+esc(e.score)+' / 100':'Evidence')+(e&&e.value!=null?' · value '+esc(e.value):'')+'</strong>'+(meta.length?'<small>'+meta.map(esc).join(' · ')+'</small>':'')+(e&&e.explanation?'<p>'+esc(e.explanation)+'</p>':'')+'</article>';
}
function drawerShell(title,subtitle){closeDrawer();var back=document.createElement('div'),panel=document.createElement('aside');back.id='wdcx-backdrop';back.className='wdcx-backdrop';panel.id='wdcx-drawer';panel.className='wdcx-drawer';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.innerHTML='<header><div><span>WATCHDOG INTELLIGENCE</span><h2>'+esc(title)+'</h2><p>'+esc(subtitle||'')+'</p></div><button type="button" aria-label="Close">×</button></header><div class="wdcx-drawer-body"></div>';document.body.append(back,panel);document.body.classList.add('wdcx-open');back.onclick=closeDrawer;panel.querySelector('header button').onclick=closeDrawer;return panel.querySelector('.wdcx-drawer-body');}
function closeDrawer(){document.getElementById('wdcx-backdrop')&&document.getElementById('wdcx-backdrop').remove();document.getElementById('wdcx-drawer')&&document.getElementById('wdcx-drawer').remove();document.body.classList.remove('wdcx-open');}
function openDrawer(item){
  var body=drawerShell('Why Watchdog flagged this',item.property_address||item.pams_pin||item.model_label),ev=Array.isArray(item.evidence)?item.evidence:[],missing=Array.isArray(item.missing_evidence)?item.missing_evidence:[];
  body.innerHTML='<div class="wdcx-scoreline"><div><b>'+Math.round(clamp(item.score,0,100))+'</b><span>review score</span></div><div><b>'+Math.round(clamp(item.confidence,0,100))+'%</b><span>confidence</span></div><div><b>'+Math.round(clamp(item.evidence_coverage,0,100))+'%</b><span>evidence</span></div></div><section class="wdcx-callout"><b>'+esc(item.model_label)+' · '+esc(bandLabel(item.attention_band))+'</b><p>'+esc(item.why_now)+'</p><small>Review signal only. Not a valuation, legal conclusion, seller prediction, or guaranteed outcome.</small></section>'+(ev.length?'<section><h3>Evidence used</h3><div class="wdcx-evidence-grid">'+ev.map(evidenceCard).join('')+'</div></section>':'')+'<section><h3>Missing evidence</h3>'+(missing.length?'<div class="wdcx-evidence-grid">'+missing.map(function(m){return'<article class="wdcx-evidence missing"><b>'+esc(m.signal_id||'Expected evidence')+'</b><strong>'+esc(m.reason||'Evidence unavailable')+'</strong></article>';}).join('')+'</div>':'<p class="wdcx-complete">No required model evidence is missing for this finding.</p>')+'</section><div class="wdcx-drawer-actions">'+(item.pams_pin?'<a href="/property/home?pin='+encodeURIComponent(item.pams_pin)+'">Open property</a>':'')+'<button type="button" data-wdcx-close>Close</button></div>';
  var c=body.querySelector('[data-wdcx-close]');if(c)c.onclick=closeDrawer;
  window.dispatchEvent(new CustomEvent('watchdog:context-suggestion-opened',{detail:{surface:item.surface,model_key:item.model_key,pams_pin:item.pams_pin,suggestion_id:item.suggestion_id}}));
}
function openQueue(items){var body=drawerShell('Current Watchdog suggestions',items.length+' evidence-backed findings in this context');body.innerHTML='<div class="wdcx-queue">'+items.map(function(item){return'<button type="button" data-id="'+esc(item.suggestion_id)+'"><b>'+Math.round(clamp(item.score,0,100))+'</b><span><strong>'+esc(item.property_address||item.pams_pin||item.model_label)+'</strong><small>'+esc(item.model_label)+' · '+esc(bandLabel(item.attention_band))+' · '+Math.round(clamp(item.confidence,0,100))+'% confidence</small></span></button>';}).join('')+'</div>';body.querySelectorAll('[data-id]').forEach(function(btn){btn.onclick=function(){var item=items.find(function(x){return x.suggestion_id===btn.dataset.id;});if(item)openDrawer(item);};});}
async function analyze(input){
  var sb=client();if(!sb)return null;var ctx=input||await contextFromPage();if(!ctx||((ctx.scope_type!=='farm')&&!(ctx.pams_pins||[]).length))return null;
  var k=keyFor(ctx),now=Date.now();if(state.lastKey===k&&state.lastData&&now-state.lastAt<CACHE_MS){render(state.lastData,ctx);return state.lastData;}if(state.running)return null;state.running=true;
  try{var res=await sb.functions.invoke('intelligence-context-suggestions',{body:ctx});if(res.error)throw res.error;state.lastKey=k;state.lastAt=Date.now();state.lastData=res.data;render(res.data,ctx);window.dispatchEvent(new CustomEvent('watchdog:context-suggestions',{detail:{context:ctx,data:res.data}}));return res.data;}catch(error){console.warn('Watchdog Context Intelligence unavailable:',error&&error.message||error);return null;}finally{state.running=false;}
}
function schedule(delay){clearTimeout(state.timer);state.timer=setTimeout(function(){analyze();},delay==null?350:delay);}
function observe(){var target=document.getElementById('db-main')||document.getElementById('hm-main')||document.getElementById('ad-app')||document.querySelector('main')||document.body;if(!target)return;new MutationObserver(function(){schedule(600);}).observe(target,{childList:true,subtree:true});}
function boot(){ensureCss();schedule(500);observe();window.addEventListener('watchdog:context-refresh',function(){state.lastAt=0;schedule(20);});}
window.WatchdogContextIntelligence={analyze:analyze,refresh:function(){state.lastAt=0;return analyze();},publish:function(ctx){state.lastAt=0;return analyze(ctx);},open:openDrawer,close:closeDrawer,context:contextFromPage};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
