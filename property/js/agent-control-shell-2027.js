/* Watchdog Agent Control 2027 shell integration */
(function(){
  'use strict';
  if(window.__WD_AGENT_CONTROL_2027__)return;
  window.__WD_AGENT_CONTROL_2027__=true;

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
    var tries=0;
    (function settle(){
      tries++;
      var ok=decorate();
      bindWindowActions();
      if(!ok&&tries<30)setTimeout(settle,40);
    })();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
