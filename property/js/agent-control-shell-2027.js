/* Watchdog Agent Control 2027 shell integration */
(function(){
  'use strict';
  if(window.__WD_AGENT_CONTROL_2027__)return;
  window.__WD_AGENT_CONTROL_2027__=true;

  var BRAND_STYLE='/property/css/brand-consistency.css';
  var READABILITY_STYLE='/property/css/agent-control-readability.css';
  var MOBILE_AUDIT_STYLE='/property/css/agent-control-mobile-audit.css';
  var EVIDENCE_MOBILE_STYLE='/property/css/agent-control-evidence-mobile.css';
  var BRAND_RUNTIME='/property/js/brand-consistency-runtime.js';
  var EVIDENCE_MOBILE_RUNTIME='/property/js/agent-control-evidence-mobile.js';

  function ensureStyle(href){
    if(document.querySelector('link[href="'+href+'"]'))return;
    var link=document.createElement('link');
    link.rel='stylesheet';
    link.href=href;
    document.head.appendChild(link);
  }

  function ensureScript(src){
    if(document.querySelector('script[src="'+src+'"]'))return;
    var script=document.createElement('script');
    script.src=src;
    document.body.appendChild(script);
  }

  function ensureBrandAssets(){
    ensureStyle(BRAND_STYLE);
    ensureStyle(READABILITY_STYLE);
    ensureStyle(MOBILE_AUDIT_STYLE);
    ensureStyle(EVIDENCE_MOBILE_STYLE);
    ensureScript(EVIDENCE_MOBILE_RUNTIME);
    if(window.__WATCHDOG_BRAND_CONSISTENCY__||document.querySelector('script[src="'+BRAND_RUNTIME+'"]'))return;
    var script=document.createElement('script');
    script.src=BRAND_RUNTIME;
    document.body.appendChild(script);
  }

  function decorate(){
    var bar=document.querySelector('.wdx-pagebar');
    if(!bar)return false;
    var kicker=bar.querySelector('.wdx-kicker');
    var title=bar.querySelector('h1');
    var desc=bar.querySelector('p');
    if(kicker)kicker.textContent='Real estate workspace';
    if(title)title.textContent='Agent Control';
    if(desc)desc.textContent='Turn Watchdog property intelligence into territories, opportunity worklists and measurable relationship workflows.';
    var actions=bar.querySelector('.wdx-page-actions');
    if(actions){
      actions.innerHTML='<a class="wdx-btn" href="/property/dashboard"><i class="fas fa-table-columns"></i> Dashboard</a><a class="wdx-btn primary" href="/property/farm-map"><i class="fas fa-map"></i> Farm Map</a>';
    }
    var nav=document.getElementById('wd4-nav');
    if(nav){
      nav.querySelectorAll('.wd4-nav-links a').forEach(function(a){a.classList.toggle('active',a.getAttribute('href')==='/property/agent-desk');});
    }
    if(window.WatchdogBrandConsistency&&typeof window.WatchdogBrandConsistency.sync==='function')window.WatchdogBrandConsistency.sync();
    return true;
  }

  function bindWindowActions(){
    var fs=document.getElementById('ac-fullscreen');
    if(fs&&!fs.dataset.bound){
      fs.dataset.bound='1';
      fs.addEventListener('click',async function(){
        try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();}catch(_){}
      });
    }
    var close=document.getElementById('ac-close');
    if(close&&!close.dataset.bound){
      close.dataset.bound='1';
      close.addEventListener('click',function(){
        if(window.opener&&!window.opener.closed)window.close();else location.href='/property/dashboard';
      });
    }
  }

  function boot(){
    ensureBrandAssets();
    var tries=0;
    (function settle(){
      tries++;
      var ok=decorate();
      bindWindowActions();
      if(!ok&&tries<30)setTimeout(settle,40);
    })();
  }
  ensureBrandAssets();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();