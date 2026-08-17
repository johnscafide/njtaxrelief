(function(){
'use strict';
var activeSection='overview',timer=null,lastKey='';
var MAP={
  assessment:{models:['assessment_anomaly'],packs:['identity','assessment_tax','sale_market','appeal_uniformity']},
  closing:{models:['closing_review'],packs:['identity','permits_closing','environment_risk','sale_market']},
  change:{models:['property_change_priority'],packs:['identity','sale_market','municipal_pressure','agent_opportunity']},
  compare:{models:['assessment_anomaly','closing_review','property_change_priority'],packs:['identity','assessment_tax','sale_market','appeal_uniformity','permits_closing','environment_risk']},
  overview:{models:[],packs:['identity','assessment_tax','sale_market','agent_opportunity']}
};
function clean(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ' ).trim();}
function sectionFor(value){
  var s=clean(value);
  if(!s)return'overview';
  if(/compare|comparison/.test(s))return'compare';
  if(/permit|closing|title|due diligence|environment|flood|wetland|tideland|deed notice|certificate/.test(s))return'closing';
  if(/change|history|update|timeline|time machine|recent activity/.test(s))return'change';
  if(/assessment|appeal|uniformity|chapter 123|tax/.test(s))return'assessment';
  return'overview';
}
function surface(){
  var page=String(document.body&&document.body.dataset&&document.body.dataset.sidebarPage||'').trim();
  if(page==='agent-desk')return'agent_control';
  if(page==='dashboard')return'dashboard';
  if(page==='home')return'home';
  if(location.pathname.indexOf('/data-workbench')>=0)return'data_workbench';
  return page||'unknown';
}
function hashSection(){return sectionFor((location.hash||'').replace(/^#(?:sec-)?/,''));}
function clickedSection(target){
  if(!target||!target.closest)return null;
  var el=target.closest('[data-section],[data-tab],[data-panel],[aria-controls],a[href^="#"],[id^="sec-"]');
  if(!el)return null;
  return sectionFor(el.dataset.section||el.dataset.tab||el.dataset.panel||el.getAttribute('aria-controls')||el.getAttribute('href')||el.id||el.textContent);
}
async function baseContext(){
  if(!window.WatchdogContextIntelligence||!window.WatchdogContextIntelligence.context)return null;
  try{return await window.WatchdogContextIntelligence.context();}catch(_e){return null;}
}
async function publish(section,reason){
  activeSection=section||activeSection||'overview';
  var base=await baseContext();if(!base)return;
  var cfg=MAP[activeSection]||MAP.overview;
  var ctx=Object.assign({},base,{section:activeSection,context_key:[base.surface||surface(),activeSection,(base.pams_pins||[]).slice().sort().join('|')].join(':'),models:cfg.models.slice()});
  var key=ctx.context_key+'|'+ctx.models.join(',');if(key===lastKey&&reason!=='force')return;lastKey=key;
  if(window.WatchdogContextIntelligence&&window.WatchdogContextIntelligence.publish)window.WatchdogContextIntelligence.publish(ctx);
  if(window.WatchdogSemanticContext&&window.WatchdogSemanticContext.get&&(ctx.pams_pins||[]).length){
    window.WatchdogSemanticContext.get({pams_pins:ctx.pams_pins.slice(0,25),packs:cfg.packs}).then(function(data){
      if(data)window.dispatchEvent(new CustomEvent('watchdog:section-semantic-context',{detail:{surface:ctx.surface,section:activeSection,context:ctx,packs:cfg.packs,data:data}}));
    });
  }
  window.dispatchEvent(new CustomEvent('watchdog:page-context',{detail:{surface:ctx.surface,section:activeSection,context:ctx,packs:cfg.packs,reason:reason||'update'}}));
}
function schedule(section,reason,delay){clearTimeout(timer);timer=setTimeout(function(){publish(section,reason);},delay==null?80:delay);}
function observeSections(){
  if(!('IntersectionObserver'in window))return;
  var nodes=Array.prototype.slice.call(document.querySelectorAll('[id^="sec-"]'));
  if(!nodes.length)return;
  var io=new IntersectionObserver(function(entries){
    var visible=entries.filter(function(e){return e.isIntersecting&&e.intersectionRatio>=0.45;}).sort(function(a,b){return b.intersectionRatio-a.intersectionRatio;})[0];
    if(visible)schedule(sectionFor(visible.target.id),'intersection',120);
  },{threshold:[0.45,0.65]});
  nodes.forEach(function(n){io.observe(n);});
}
function boot(){
  activeSection=hashSection();
  document.addEventListener('click',function(e){var s=clickedSection(e.target);if(s)schedule(s,'interaction',30);},true);
  window.addEventListener('hashchange',function(){schedule(hashSection(),'hash',20);});
  window.addEventListener('popstate',function(){schedule(hashSection(),'navigation',20);});
  window.addEventListener('watchdog:property-context',function(e){var d=e.detail||{},s=sectionFor(d.section||d.context_key||activeSection);schedule(s,'property_context',10);});
  window.addEventListener('watchdog:section-context',function(e){var d=e.detail||{};schedule(sectionFor(d.section||d.key||activeSection),'explicit',10);});
  window.addEventListener('watchdog:context-suggestions',function(){if(!lastKey)setTimeout(function(){schedule(activeSection,'initial',10);},10);},{once:true});
  observeSections();
  schedule(activeSection,'boot',700);
}
window.WatchdogPageContext={publish:function(detail){detail=detail||{};return publish(sectionFor(detail.section||detail.key||activeSection),'force');},section:function(){return activeSection;},map:MAP};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
