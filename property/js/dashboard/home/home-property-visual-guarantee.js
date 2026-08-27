/* Property Home visual mount guarantee — 2026-08-27.
   Ensures the ad-inspired Property Home hero is visible even when the legacy
   hero/score enhancer initializes late. No demo values are introduced. */
(function(){
'use strict';
if(window.__WATCHDOG_HOME_PROPERTY_VISUAL_GUARANTEE__)return;
window.__WATCHDOG_HOME_PROPERTY_VISUAL_GUARANTEE__=true;

var retries=0;
var retryTimer=0;
var observer=null;
var scorePromise=null;

function currentRow(){
  var rows=window.rows;
  if(!Array.isArray(rows)||!rows.length)return null;
  var pin='';
  try{pin=new URL(location.href).searchParams.get('pin')||'';}catch(_e){}
  var sw=document.getElementById('hm-switch');
  if(!pin&&sw)pin=sw.value||'';
  if(pin){for(var i=0;i<rows.length;i++)if(String(rows[i].pams_pin||'')===String(pin))return rows[i];}
  for(var j=0;j<rows.length;j++)if(rows[j].kind==='home')return rows[j];
  return rows[0]||null;
}

function ensureScoreEngine(){
  if(typeof window.watchdogScore==='function')return Promise.resolve();
  if(scorePromise)return scorePromise;
  if(window.NJPropertyModules&&typeof window.NJPropertyModules.loadTool==='function'){
    scorePromise=window.NJPropertyModules.loadTool('watchdog-score').catch(function(error){
      console.warn('[Watchdog] Property hero score engine could not load:',error&&error.message||error);
    }).then(function(){scorePromise=null;});
    return scorePromise;
  }
  return Promise.resolve();
}

function ensureScoreHost(hero){
  var id=hero&&hero.querySelector('.hm-id');
  if(!id)return null;
  var box=id.querySelector(':scope > .hm-score-hero');
  if(box)return box;
  box=document.createElement('div');
  box.className='hm-score-hero';
  var legacy=id.querySelector(':scope > .hm-val');
  if(legacy)legacy.replaceWith(box);else id.appendChild(box);
  box.innerHTML='<div class="hm-score-empty"><i class="fas fa-dog"></i><div><b>Loading Watchdog Score</b><span>Building this property summary from governed evidence.</span></div></div>';
  return box;
}

function refreshLegacyHero(){
  try{
    if(window.WatchdogHomeHeroIntelligence&&typeof window.WatchdogHomeHeroIntelligence.refresh==='function'){
      window.WatchdogHomeHeroIntelligence.refresh();
    }
  }catch(error){console.warn('[Watchdog] Property hero refresh failed:',error&&error.message||error);}
}

function tryMount(){
  clearTimeout(retryTimer);
  var host=document.getElementById('hm-body');
  var hero=host&&host.querySelector('.hm-hero');
  var row=currentRow();
  if(!host||!hero||!row){schedule();return;}

  ensureScoreHost(hero);
  refreshLegacyHero();

  if(window.WatchdogHomePropertyVisual&&typeof window.WatchdogHomePropertyVisual.mount==='function'){
    try{window.WatchdogHomePropertyVisual.mount();}catch(error){console.warn('[Watchdog] Property visual mount failed:',error&&error.message||error);}
  }

  if(!hero.classList.contains('wdpv')){
    ensureScoreEngine().then(function(){
      refreshLegacyHero();
      if(window.WatchdogHomePropertyVisual&&typeof window.WatchdogHomePropertyVisual.mount==='function'){
        try{window.WatchdogHomePropertyVisual.mount();}catch(_e){}
      }
      var latest=document.querySelector('#hm-body .hm-hero');
      if(latest&&!latest.classList.contains('wdpv'))schedule();
    });
  }else{
    retries=0;
  }
}

function schedule(){
  if(retries>=40)return;
  retries++;
  clearTimeout(retryTimer);
  retryTimer=setTimeout(tryMount,Math.min(120+retries*35,650));
}

function boot(){
  var host=document.getElementById('hm-body');
  if(host&&typeof MutationObserver!=='undefined'){
    observer=new MutationObserver(function(){retries=0;schedule();});
    observer.observe(host,{childList:true,subtree:true,characterData:true});
  }
  document.addEventListener('change',function(event){if(event.target&&event.target.id==='hm-switch'){retries=0;schedule();}});
  window.addEventListener('watchdog:context-refresh',function(){retries=0;schedule();});
  document.addEventListener('njptr:plan-change',function(){retries=0;schedule();});
  tryMount();
}

window.WatchdogHomePropertyVisualGuarantee={refresh:function(){retries=0;tryMount();}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
