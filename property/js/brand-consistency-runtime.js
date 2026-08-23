(function(){
  'use strict';
  if(window.__WATCHDOG_BRAND_CONSISTENCY__)return;
  window.__WATCHDOG_BRAND_CONSISTENCY__=true;

  var STYLE='/property/css/brand-consistency.css';
  var UNIVERSAL='/property/js/watchdog-universal-menu.js';
  var CITY_ADDRESS='/property/js/city-address-runtime.js?v=20260823a';

  function ensureStylesheet(href){
    if(document.querySelector('link[href="'+href+'"]'))return;
    var l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.appendChild(l);
  }
  function ensureScript(src,id){
    if(id&&document.getElementById(id))return;
    if(document.querySelector('script[src="'+src+'"]'))return;
    var s=document.createElement('script');if(id)s.id=id;s.src=src;s.defer=true;document.head.appendChild(s);
  }
  function ensureUniversal(){
    if(window.WatchdogUniversalMenu){window.WatchdogUniversalMenu.refresh();return;}
    ensureScript(UNIVERSAL,'watchdog-universal-menu-runtime');
  }
  function ensureCityAddress(){
    if(window.__WATCHDOG_CITY_ADDRESS_RUNTIME__)return;
    ensureScript(CITY_ADDRESS,'watchdog-city-address-runtime');
  }
  function setText(selector,value){
    document.querySelectorAll(selector).forEach(function(n){if(n.textContent!==value)n.textContent=value;});
  }
  function syncBrand(){
    setText('.wd4-brand-copy strong','Watchdog');
    setText('.wd4-brand-copy small,.hm27-brand-copy small,.wdx-brand-copy small','PROPERTY INTELLIGENCE');
  }
  function run(){
    ensureStylesheet(STYLE);
    ensureUniversal();
    ensureCityAddress();
    syncBrand();
    if(window.WatchdogUniversalMenu)window.WatchdogUniversalMenu.refresh();
  }

  var scheduled=false;
  function schedule(){
    if(scheduled)return;scheduled=true;
    requestAnimationFrame(function(){scheduled=false;run();});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});
  else run();

  if(typeof MutationObserver!=='undefined'&&document.documentElement){
    new MutationObserver(function(records){
      for(var i=0;i<records.length;i++){
        var nodes=records[i].addedNodes||[];
        for(var j=0;j<nodes.length;j++){
          var n=nodes[j];
          if(n&&n.nodeType===1&&((n.matches&&n.matches('.wd4-brand-copy,.hm27-brand-copy,.wdx-brand-copy,.wd4-nav-links,.hm27-nav-links'))||(n.querySelector&&n.querySelector('.wd4-brand-copy,.hm27-brand-copy,.wdx-brand-copy,.wd4-nav-links,.hm27-nav-links')))){schedule();return;}
        }
      }
    }).observe(document.documentElement,{childList:true,subtree:true});
  }

  window.WatchdogBrandConsistency={
    sync:run,
    items:function(){return window.WatchdogUniversalMenu?window.WatchdogUniversalMenu.items():[];}
  };
})();